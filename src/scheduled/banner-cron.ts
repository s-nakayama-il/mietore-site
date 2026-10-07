// 離脱バナーの定期実行（TASK-I16-20261002-003）。
// 毎時0分（UTC）は判定と入れ替え、毎日 15:05 UTC（00:05 JST）は前日分の日次の記録。
// 数え方は src/lib/banner/metrics.ts、判定は src/lib/banner/judge.ts（どちらも D1 を触らない）。
// ここは D1 の読み書きだけを行う。events の行は JS で回さず、数え終わった小さい結果だけを渡す。
// events を読む2本には received_at の下限を渡す（毎時は試しの started_at、日次は前日0時の30日前）。
import {
  buildTrialSql, toTrial, buildStatsSql, toDaily, jstToday, recentDays, type StatRow,
} from '../lib/banner/metrics.ts';
import {
  CRON_HOURLY, CRON_DAILY, TABLES_SQL, CONFIG_SQL, CREATIVES_SQL,
  planHourly, planDaily, judgmentWrite, errorJudgment,
  type ConfigRow, type CreativeRow, type JudgmentRow, type PlannedWrite,
} from '../lib/banner/judge.ts';

export interface BannerCronEnv {
  DB: D1Database;
}

// 判定の表が無いときは何も書かずに終わる（本 TASK で決めたこと 7）
async function readTables(db: D1Database): Promise<Set<string> | null> {
  try {
    const { results } = await db.prepare(TABLES_SQL).all();
    return new Set((results as { name: string }[]).map((r) => r.name));
  } catch {
    return null;
  }
}

function stmts(db: D1Database, writes: PlannedWrite[]): D1PreparedStatement[] {
  return writes.map((w) => db.prepare(w.sql).bind(...w.binds));
}

// 書き込みは1回の batch にまとめる。banner_judgments が無ければ記録だけを落とす
async function writeAll(
  db: D1Database, tables: Set<string>, writes: PlannedWrite[], judgment: JudgmentRow,
): Promise<void> {
  const all = [...writes];
  if (tables.has('banner_judgments')) all.push(judgmentWrite(judgment));
  if (all.length === 0) return;
  await db.batch(stmts(db, all));
}

// D1 が例外を投げたときは、記録を残せる場合だけ残す（残せなくても例外にしない）
async function writeError(db: D1Database, tables: Set<string>, now: number, detail: string): Promise<void> {
  if (!tables.has('banner_judgments')) return;
  try {
    await db.batch(stmts(db, [judgmentWrite(errorJudgment(now, detail))]));
  } catch {
    // 記録も書けないときは何もしない
  }
}

async function readConfigAndCreatives(
  db: D1Database, tables: Set<string>,
): Promise<{ config: ConfigRow | null; creatives: CreativeRow[] }> {
  const config = tables.has('banner_config')
    ? ((await db.prepare(CONFIG_SQL).all()).results as unknown as ConfigRow[])[0] ?? null
    : null;
  const creatives = tables.has('banner_creatives')
    ? ((await db.prepare(CREATIVES_SQL).all()).results as unknown as CreativeRow[])
    : [];
  return { config, creatives };
}

async function runHourly(db: D1Database, now: number): Promise<void> {
  const tables = await readTables(db);
  if (!tables || !tables.has('banner_config') || !tables.has('banner_creatives')) return;

  let config: ConfigRow | null;
  let creatives: CreativeRow[];
  try {
    ({ config, creatives } = await readConfigAndCreatives(db, tables));
  } catch {
    await writeError(db, tables, now, '設定・案の読み取りに失敗した');
    return;
  }
  if (config === null) return;

  // 試し中の案は多くても1本。その1本だけ events を数える（試し中が無ければ events を読まない）
  const trialing = creatives.find((c) => c.status === 'trialing' && c.started_at) ?? null;
  let trial = null;
  if (trialing !== null && trialing.started_at !== null) {
    try {
      // 下限にその案の started_at を渡す（それより前の行は読まない）
      const t = buildTrialSql(trialing.v, trialing.started_at, trialing.started_at);
      const { results } = await db.prepare(t.sql).bind(...t.binds).all();
      trial = toTrial(trialing.v, results as unknown as Record<string, unknown>[]);
    } catch {
      await writeError(db, tables, now, `試し中の案（${trialing.v}）の数の取得に失敗した`);
      return;
    }
  }

  const plan = planHourly({ now, config, creatives, trial });
  try {
    await writeAll(db, tables, plan.writes, plan.judgment);
  } catch {
    await writeError(db, tables, now, '判定の書き込みに失敗した');
  }
}

async function runDaily(db: D1Database, now: number): Promise<void> {
  const tables = await readTables(db);
  if (!tables || !tables.has('banner_creatives') || !tables.has('banner_daily')) return;

  let config: ConfigRow | null;
  let creatives: CreativeRow[];
  try {
    ({ config, creatives } = await readConfigAndCreatives(db, tables));
  } catch {
    await writeError(db, tables, now, '設定・案の読み取りに失敗した（日次）');
    return;
  }
  if (creatives.length === 0) return;

  // 前日（JST）。00:05 JST に動くので、jstToday の1つ前の日
  const today = jstToday(now);
  const day = recentDays(today, 2)[1];
  let byV: Record<string, { views: number; taps: number; store: number }>;
  // 下限は前日の0時（JST）の30日前。30日より前に初めて表示した sid が戻ってきた場合は、
  // その日の初回として数える（「作るもの」6 のとおり受け入れる）
  const since = `${recentDays(day, 31)[30]}T00:00:00+09:00`;
  try {
    const { sql, binds } = buildStatsSql({ kind: 'day', day }, since);
    const { results } = await db.prepare(sql).bind(...binds).all();
    const rows = results as unknown as StatRow[];
    byV = toDaily(rows, today, 2)[1].byV;
  } catch {
    await writeError(db, tables, now, `前日（${day}）の集計に失敗した`);
    return;
  }

  const plan = planDaily({ now, day, config, creatives, byV });
  try {
    await writeAll(db, tables, plan.writes, plan.judgment);
  } catch {
    await writeError(db, tables, now, `前日（${day}）の日次の記録の書き込みに失敗した`);
  }
}

// 入口。知らない cron の文字列では何もしない
export async function runBannerCron(cron: string, env: BannerCronEnv, scheduledTime: number): Promise<void> {
  if (cron === CRON_HOURLY) return runHourly(env.DB, scheduledTime);
  if (cron === CRON_DAILY) return runDaily(env.DB, scheduledTime);
}
