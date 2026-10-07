// 離脱バナーの判定（2026-10-02 人の決定。TASK-I16-20261002-003）。
// D1 を触らない純関数だけを置く（テストで SQLite にそのまま流せるようにするため）。
// 数え方は src/lib/banner/metrics.ts の関数だけを使う（同じ数え方をここに書かない）。
import { type TrialStats } from './metrics.ts';

// 判定の線（1本 1,000 表示でタップ 55 件以上なら合格、300 表示でタップ 10 件以下なら打ち切り）
export const VIEWS_CUT = 300;
export const VIEWS_DECIDE = 1000;
export const TAPS_CUT = 10;
export const TAPS_PASS = 55;

// タップが届くまでの猶予（本 TASK で決めたこと 1）。N 件目の表示がこれより新しければ次の実行に回す
export const GRACE_MS = 30 * 60 * 1000;

// 合格0件のときに残す言葉（一巡後のモード）
export const NO_PASS_DETAIL = '合格0件のため最高のストア到達率の1本を出している';

// cron の文字列（wrangler.toml の [triggers] と同じ）
export const CRON_HOURLY = '0 * * * *';
export const CRON_DAILY = '5 15 * * *';

// 判定の表が揃っているかの確かめ（src/routes/banner-stats.ts と同じ見方）
export const TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('banner_config','banner_creatives','banner_judgments','banner_daily')";
export const CONFIG_SQL = 'SELECT stopped, active_vs, cycle_done FROM banner_config WHERE id = 1';
export const CREATIVES_SQL = 'SELECT v, dest, trial_order, status, started_at, decided_at, decided_views, decided_taps, decided_store FROM banner_creatives ORDER BY trial_order';
export const JUDGMENT_SQL = 'INSERT INTO banner_judgments (run_at, v, views, taps, store, outcome, applied, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)';

// 全停止中は設定を書き換えない（人のコマンドとの競りを避けるため、SQL 側でも止める）
const NOT_STOPPED = "(SELECT stopped FROM banner_config WHERE id = 1) = 0";

const DECIDED = ['cut', 'pass', 'fail'];

export type Outcome = 'none' | 'wait' | 'start' | 'cut' | 'pass' | 'fail' | 'cycle' | 'daily' | 'error';

export interface CreativeRow {
  v: string;
  dest: string;
  trial_order: number;
  status: string;
  started_at: string | null;
  decided_at: string | null;
  decided_views: number | null;
  decided_taps: number | null;
  decided_store: number | null;
}

export interface ConfigRow {
  stopped: number;
  active_vs: string;
  cycle_done: number;
}

export type Bind = string | number | null;

// D1 へ渡す1本。banner-cron.ts が env.DB.batch([...]) で1回にまとめて書く
export interface PlannedWrite {
  sql: string;
  binds: Bind[];
}

export interface JudgmentRow {
  run_at: string;
  v: string | null;
  views: number | null;
  taps: number | null;
  store: number | null;
  outcome: Outcome;
  applied: number;
  detail: string;
}

export interface HourlyPlan {
  outcome: Outcome;
  // 全停止中は空（判定の記録だけを書く）
  writes: PlannedWrite[];
  judgment: JudgmentRow;
  // 次に試す案（始めた場合）と、反映した active_vs（反映しない場合も計算した値）
  nextTrial: string | null;
  activeVs: string[];
}

// events.received_at と同じ形（JST）
export function jstStamp(now: number): string {
  return `${new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 19)}+09:00`;
}

// N 件目の表示から猶予（30分）が過ぎたか。時刻が無ければ「過ぎていない」、読めなければ「過ぎた」とみなす
function graceDone(at: string, now: number): boolean {
  if (at === '') return false;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return true;
  return ms <= now - GRACE_MS;
}

export interface TrialDecision {
  outcome: 'wait' | 'cut' | 'pass' | 'fail';
  views: number | null;
  taps: number | null;
  store: number | null;
  detail: string;
}

// 試し中の1本の判定。300件の打ち切りを先に見る（本 TASK で決めたこと 3）
export function decideTrial(trial: TrialStats, now: number): TrialDecision {
  if (trial.first300.views >= VIEWS_CUT) {
    if (!graceDone(trial.at300, now)) {
      return {
        outcome: 'wait', views: trial.first1000.views, taps: trial.first1000.taps, store: trial.first1000.store,
        detail: `${VIEWS_CUT}件目の表示が30分以内（${trial.at300}）のため次の実行に回す（試し開始からの全件 ${trial.total}）`,
      };
    }
    if (trial.first300.taps <= TAPS_CUT) {
      return {
        outcome: 'cut', views: VIEWS_CUT, taps: trial.first300.taps, store: trial.first300.store,
        detail: `先頭${VIEWS_CUT}件のタップ${trial.first300.taps}件（${TAPS_CUT}件以下）で打ち切り`,
      };
    }
  }
  if (trial.first1000.views >= VIEWS_DECIDE) {
    if (!graceDone(trial.at1000, now)) {
      return {
        outcome: 'wait', views: trial.first1000.views, taps: trial.first1000.taps, store: trial.first1000.store,
        detail: `${VIEWS_DECIDE}件目の表示が30分以内（${trial.at1000}）のため次の実行に回す（試し開始からの全件 ${trial.total}）`,
      };
    }
    const taps = trial.first1000.taps;
    const outcome = taps >= TAPS_PASS ? 'pass' : 'fail';
    return {
      outcome, views: VIEWS_DECIDE, taps, store: trial.first1000.store,
      detail: `先頭${VIEWS_DECIDE}件のタップ${taps}件（${TAPS_PASS}件以上で合格）→ ${outcome === 'pass' ? '合格' : '不合格'}`,
    };
  }
  // 判定に使う窓（先頭1,000件）の数をそのまま記録に残す。行き過ぎた分は detail に書く
  return {
    outcome: 'wait', views: trial.first1000.views, taps: trial.first1000.taps, store: trial.first1000.store,
    detail: `続行（先頭${VIEWS_DECIDE}件で表示${trial.first1000.views}件・タップ${trial.first1000.taps}件／試し開始からの全件 ${trial.total}）`,
  };
}

function byOrder(a: CreativeRow, b: CreativeRow): number {
  return a.trial_order - b.trial_order;
}

// 一巡後に出す案。pass が0件なら、ストア到達率がいちばん高い1本（同率は trial_order の小さい方）
export function cycleActive(decided: CreativeRow[]): { active: string[]; note: string } {
  const ordered = [...decided].sort(byOrder);
  const passed = ordered.filter((c) => c.status === 'pass');
  if (passed.length > 0) return { active: passed.map((c) => c.v), note: '' };
  let best: { v: string; rate: number } | null = null;
  for (const c of ordered) {
    const views = c.decided_views ?? 0;
    if (views <= 0) continue;
    const rate = (c.decided_store ?? 0) / views;
    // 同率のときは先に見た（trial_order の小さい）方を残す
    if (best === null || rate > best.rate) best = { v: c.v, rate };
  }
  if (best === null) return { active: [], note: '判定のついた案が無い' };
  return { active: [best.v], note: NO_PASS_DETAIL };
}

function configWrite(active: string[], cycleDone: number, runAt: string): PlannedWrite {
  return {
    sql: "UPDATE banner_config SET active_vs = ?1, cycle_done = ?2, updated_at = ?3, updated_by = 'cron' WHERE id = 1 AND stopped = 0",
    binds: [JSON.stringify(active), cycleDone, runAt],
  };
}

function startWrite(v: string, runAt: string): PlannedWrite {
  return {
    sql: `UPDATE banner_creatives SET status = 'trialing', started_at = ?1, decided_at = NULL, decided_views = NULL, decided_taps = NULL, decided_store = NULL WHERE v = ?2 AND status = 'pending' AND ${NOT_STOPPED}`,
    binds: [runAt, v],
  };
}

function decideWrite(v: string, d: TrialDecision, runAt: string): PlannedWrite {
  return {
    sql: `UPDATE banner_creatives SET status = ?1, decided_at = ?2, decided_views = ?3, decided_taps = ?4, decided_store = ?5 WHERE v = ?6 AND status = 'trialing' AND ${NOT_STOPPED}`,
    binds: [d.outcome, runAt, d.views, d.taps, d.store, v],
  };
}

function sameActive(current: string, active: string[]): boolean {
  return current === JSON.stringify(active);
}

export interface HourlyInput {
  // controller.scheduledTime（UTC のミリ秒）
  now: number;
  config: ConfigRow;
  creatives: CreativeRow[];
  // 試し中の案の数（試し中が無いときは null）
  trial: TrialStats | null;
}

// 1時間ごとの判定と入れ替え。全停止中は writes を空にして、判定の記録だけを残す
export function planHourly(input: HourlyInput): HourlyPlan {
  const runAt = jstStamp(input.now);
  const stopped = input.config.stopped === 1;
  const ordered = [...input.creatives].sort(byOrder);
  const trialing = ordered.find((c) => c.status === 'trialing' && c.started_at) ?? null;
  const pending = ordered.find((c) => c.status === 'pending') ?? null;
  const plan = (
    outcome: Outcome, writes: PlannedWrite[], judgment: Omit<JudgmentRow, 'run_at' | 'applied' | 'outcome'>,
    nextTrial: string | null, activeVs: string[],
  ): HourlyPlan => ({
    outcome,
    writes: stopped ? [] : writes,
    judgment: {
      run_at: runAt, outcome, applied: stopped || writes.length === 0 ? 0 : 1,
      v: judgment.v, views: judgment.views, taps: judgment.taps, store: judgment.store,
      detail: stopped ? `${judgment.detail}／全停止中のため設定は書き換えない` : judgment.detail,
    },
    nextTrial, activeVs,
  });

  if (trialing !== null) {
    if (input.trial === null) {
      return plan('wait', [], { v: trialing.v, views: null, taps: null, store: null, detail: '試し中の案の数が取れなかった' }, null, []);
    }
    const d = decideTrial(input.trial, input.now);
    if (d.outcome === 'wait') {
      return plan('wait', [], { v: trialing.v, views: d.views, taps: d.taps, store: d.store, detail: d.detail }, null, []);
    }
    const writes: PlannedWrite[] = [decideWrite(trialing.v, d, runAt)];
    const judged: CreativeRow = {
      ...trialing, status: d.outcome, decided_at: runAt,
      decided_views: d.views, decided_taps: d.taps, decided_store: d.store,
    };
    if (pending !== null) {
      writes.push(startWrite(pending.v, runAt), configWrite([pending.v], 0, runAt));
      return plan(
        d.outcome, writes,
        { v: trialing.v, views: d.views, taps: d.taps, store: d.store, detail: `${d.detail}／次は ${pending.v}` },
        pending.v, [pending.v],
      );
    }
    // 未判定が無くなった → 一巡後のモードへ
    const decided = ordered.map((c) => (c.v === trialing.v ? judged : c)).filter((c) => DECIDED.includes(c.status));
    const { active, note } = cycleActive(decided);
    writes.push(configWrite(active, 1, runAt));
    const detail = `${d.detail}／一巡した（出す案 ${active.join(', ') || 'なし'}）${note === '' ? '' : `／${note}`}`;
    return plan(d.outcome, writes, { v: trialing.v, views: d.views, taps: d.taps, store: d.store, detail }, null, active);
  }

  if (pending !== null) {
    const writes = [startWrite(pending.v, runAt), configWrite([pending.v], 0, runAt)];
    return plan('start', writes, { v: pending.v, views: null, taps: null, store: null, detail: `試しを始めた（${pending.v}）` }, pending.v, [pending.v]);
  }

  // 試し中も未判定も無い = 一巡後のモード
  const decided = ordered.filter((c) => DECIDED.includes(c.status));
  const { active, note } = cycleActive(decided);
  const settled = input.config.cycle_done === 1 && sameActive(input.config.active_vs, active);
  if (settled) {
    return plan('none', [], { v: null, views: null, taps: null, store: null, detail: `一巡後（出す案 ${active.join(', ') || 'なし'}）のまま${note === '' ? '' : `／${note}`}` }, null, active);
  }
  return plan(
    'cycle', [configWrite(active, 1, runAt)],
    { v: null, views: null, taps: null, store: null, detail: `一巡後の設定にした（出す案 ${active.join(', ') || 'なし'}）${note === '' ? '' : `／${note}`}` },
    null, active,
  );
}

export interface DailyCounts {
  views: number;
  taps: number;
  store: number;
}

export interface DailyInput {
  now: number;
  // 前日（JST）の YYYY-MM-DD
  day: string;
  config: ConfigRow | null;
  creatives: CreativeRow[];
  // metrics.ts の toDaily が返した、その日の案ごとの数
  byV: Record<string, DailyCounts>;
}

export interface DailyPlan {
  day: string;
  writes: PlannedWrite[];
  judgment: JudgmentRow;
}

// 前日（JST）の日次の記録。全停止中も書く（設定ではないため。本 TASK で決めたこと 5）
export function planDaily(input: DailyInput): DailyPlan {
  const runAt = jstStamp(input.now);
  const stopped = input.config?.stopped === 1 ? 1 : 0;
  const ordered = [...input.creatives].sort(byOrder);
  const writes: PlannedWrite[] = ordered.map((c) => {
    const n = input.byV[c.v] ?? { views: 0, taps: 0, store: 0 };
    return {
      sql: 'INSERT OR REPLACE INTO banner_daily (day, v, views, taps, store, status, stopped, written_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
      binds: [input.day, c.v, n.views, n.taps, n.store, c.status, stopped, runAt],
    };
  });
  // 一巡後に合格0件のときは、その事情を日次の実行の記録にも残す（banner_daily に detail の列が無いため）
  const decided = ordered.filter((c) => DECIDED.includes(c.status));
  const note = input.config?.cycle_done === 1 ? cycleActive(decided).note : '';
  const detail = `前日 ${input.day} の日次の記録を ${writes.length} 行書いた${note === '' ? '' : `／${note}`}`;
  return {
    day: input.day,
    writes,
    judgment: { run_at: runAt, v: null, views: null, taps: null, store: null, outcome: 'daily', applied: 0, detail },
  };
}

// 判定の記録の行を D1 へ渡す形にする
export function judgmentWrite(j: JudgmentRow): PlannedWrite {
  return { sql: JUDGMENT_SQL, binds: [j.run_at, j.v, j.views, j.taps, j.store, j.outcome, j.applied, j.detail] };
}

export function errorJudgment(now: number, detail: string): JudgmentRow {
  return { run_at: jstStamp(now), v: null, views: null, taps: null, store: null, outcome: 'error', applied: 0, detail };
}

