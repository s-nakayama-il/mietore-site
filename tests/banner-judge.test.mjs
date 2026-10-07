// 離脱バナーの判定（src/lib/banner/judge.ts）の13場面。
// 検査データを SQLite に入れ、metrics.ts が組み立てた SQL を実際に流し、その結果を judge.ts に渡す。
// 返ってきた書き込みをそのまま流して、banner_creatives・banner_config・banner_judgments の中身を見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildTrialSql, toTrial, buildStatsSql, toDaily, jstToday, recentDays, FIX_BOUNDARY } from '../src/lib/banner/metrics.ts';
import {
  planHourly, planDaily, judgmentWrite, jstStamp, cycleActive,
  CONFIG_SQL, CREATIVES_SQL, NO_PASS_DETAIL,
} from '../src/lib/banner/judge.ts';

const SCHEMA = new URL('../schema/mm.sql', import.meta.url).pathname;

// TASK-I16-20261002-002「D1 に足す表」の4表（本番 D1 と同じ。schema/ には入れない）
const BANNER_DDL = `
CREATE TABLE IF NOT EXISTS banner_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stopped INTEGER NOT NULL DEFAULT 0 CHECK (stopped IN (0, 1)),
  active_vs TEXT NOT NULL DEFAULT '[]',
  cycle_done INTEGER NOT NULL DEFAULT 0 CHECK (cycle_done IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS banner_creatives (
  v TEXT PRIMARY KEY,
  dest TEXT NOT NULL CHECK (dest IN ('app', 'check_b', 'check_c')),
  trial_order INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'trialing', 'cut', 'pass', 'fail')),
  started_at TEXT,
  decided_at TEXT,
  decided_views INTEGER,
  decided_taps INTEGER,
  decided_store INTEGER,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS banner_judgments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  v TEXT, views INTEGER, taps INTEGER, store INTEGER,
  outcome TEXT NOT NULL,
  applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_banner_judgments_run_at ON banner_judgments(run_at);
CREATE TABLE IF NOT EXISTS banner_daily (
  day TEXT NOT NULL, v TEXT NOT NULL,
  views INTEGER NOT NULL, taps INTEGER NOT NULL, store INTEGER NOT NULL,
  status TEXT NOT NULL,
  stopped INTEGER NOT NULL CHECK (stopped IN (0, 1)),
  written_at TEXT NOT NULL,
  PRIMARY KEY (day, v)
);
`;

const B = 'banner-20260928-B';
const C = 'banner-20260928-C';
const A1 = 'banner-20260928-A1';
const A2 = 'banner-20260928-A2';
const A3 = 'banner-20260928-A3';
const ORDER = [B, C, A1, A2, A3];
const DEST = { [B]: 'check_b', [C]: 'check_c', [A1]: 'app', [A2]: 'app', [A3]: 'app' };

const START = '2026-10-06T00:00:00+09:00';
const START_MS = Date.parse(START);
const NOW = START_MS + 4 * 3600 * 1000; // 試しの開始から4時間後（猶予30分はどの場面でも過ぎている）
const at = (sec) => `${new Date(START_MS + sec * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 19)}+09:00`;

function newDb({ stopped = 0, activeVs = [B], cycleDone = 0, creatives = {} } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(SCHEMA, 'utf8'));
  db.exec(BANNER_DDL);
  db.prepare('INSERT INTO banner_config (id, stopped, active_vs, cycle_done, updated_at, updated_by) VALUES (1, ?, ?, ?, ?, ?)')
    .run(stopped, JSON.stringify(activeVs), cycleDone, START, 'init');
  const ins = db.prepare('INSERT INTO banner_creatives (v, dest, trial_order, status, started_at, decided_at, decided_views, decided_taps, decided_store, added_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  ORDER.forEach((v, i) => {
    const c = creatives[v] ?? { status: 'pending' };
    ins.run(v, DEST[v], i + 1, c.status, c.started_at ?? null, c.decided_at ?? null,
      c.decided_views ?? null, c.decided_taps ?? null, c.decided_store ?? null, START);
  });
  const insEv = db.prepare('INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family) VALUES (?,?,?,?,?,?,?,?,?)');
  const add = (receivedAt, sid, event, v, param = '') => insEv.run(receivedAt, receivedAt, sid, event, param, 'u', 'Android', v, 'browser');
  return { db, add };
}

// 試し中の案に、表示 n 件・先頭 taps 件にタップ・先頭 store 件にストア到達を入れる（1秒ずつずらす）
function fillTrial(add, v, { n, taps = 0, store = 0, offset = 0, sidPrefix = 's' } = {}) {
  for (let i = 0; i < n; i += 1) {
    const sid = `${sidPrefix}${String(i + 1).padStart(5, '0')}`;
    const sec = offset + i;
    add(at(sec), sid, 'banner_view', v);
    if (i < taps) add(at(sec + 1), sid, 'banner_tap', v, DEST[v] === 'app' ? 'app' : DEST[v]);
    if (i < store) {
      if (DEST[v] === 'app') add(at(sec + 1), sid, 'banner_tap', v, 'app');
      else add(at(sec + 2), sid, 'cta_store', v);
    }
  }
}

// banner-cron.ts の毎時の実行と同じ順で読み、同じ書き込みを流す
function hourly(db, now = NOW) {
  const config = db.prepare(CONFIG_SQL).get();
  const creatives = db.prepare(CREATIVES_SQL).all();
  const trialing = creatives.find((c) => c.status === 'trialing' && c.started_at);
  let trial = null;
  if (trialing) {
    const t = buildTrialSql(trialing.v, trialing.started_at);
    trial = toTrial(trialing.v, db.prepare(t.sql).all(...t.binds));
  }
  const plan = planHourly({ now, config, creatives, trial });
  for (const w of [...plan.writes, judgmentWrite(plan.judgment)]) db.prepare(w.sql).run(...w.binds);
  return { plan, trial };
}

// banner-cron.ts の日次の実行と同じ
function daily(db, now = NOW) {
  const config = db.prepare(CONFIG_SQL).get();
  const creatives = db.prepare(CREATIVES_SQL).all();
  const today = jstToday(now);
  const day = recentDays(today, 2)[1];
  const { sql, binds } = buildStatsSql({ kind: 'day', day });
  const rows = db.prepare(sql).all(...binds);
  const byV = toDaily(rows, today, 2)[1].byV;
  const plan = planDaily({ now, day, config, creatives, byV });
  for (const w of [...plan.writes, judgmentWrite(plan.judgment)]) db.prepare(w.sql).run(...w.binds);
  return plan;
}

const creativeOf = (db, v) => db.prepare('SELECT * FROM banner_creatives WHERE v = ?').get(v);
const configOf = (db) => db.prepare('SELECT * FROM banner_config WHERE id = 1').get();
const lastJudgment = (db) => db.prepare('SELECT * FROM banner_judgments ORDER BY id DESC LIMIT 1').get();
const trialing = { status: 'trialing', started_at: START };

test('1. 先頭1,000件でタップ55件 → pass、次の案が trialing になり active_vs が次の1本になる', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 1000, taps: 55, store: 30 });
  const { plan } = hourly(db);
  assert.equal(plan.outcome, 'pass');
  const b = creativeOf(db, B);
  assert.equal(b.status, 'pass');
  assert.equal(b.decided_views, 1000);
  assert.equal(b.decided_taps, 55);
  assert.equal(b.decided_store, 30);
  assert.equal(creativeOf(db, C).status, 'trialing');
  assert.equal(creativeOf(db, C).started_at, jstStamp(NOW));
  assert.equal(configOf(db).active_vs, JSON.stringify([C]));
  assert.equal(configOf(db).cycle_done, 0);
  assert.equal(configOf(db).updated_by, 'cron');
  const j = lastJudgment(db);
  assert.equal(j.outcome, 'pass');
  assert.equal(j.applied, 1);
  assert.equal(j.views, 1000);
  assert.equal(j.taps, 55);
});

test('2. 先頭1,000件でタップ54件 → fail', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 1000, taps: 54, store: 20 });
  const { plan } = hourly(db);
  assert.equal(plan.outcome, 'fail');
  assert.equal(creativeOf(db, B).status, 'fail');
  assert.equal(creativeOf(db, B).decided_taps, 54);
  assert.equal(configOf(db).active_vs, JSON.stringify([C]));
  assert.equal(lastJudgment(db).outcome, 'fail');
});

test('3. 先頭300件でタップ10件 → cut（1,000件に達する前に切れる）', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 300, taps: 10, store: 5 });
  const { plan } = hourly(db);
  assert.equal(plan.outcome, 'cut');
  const b = creativeOf(db, B);
  assert.equal(b.status, 'cut');
  assert.equal(b.decided_views, 300);
  assert.equal(b.decided_taps, 10);
  assert.equal(b.decided_store, 5);
  assert.equal(configOf(db).active_vs, JSON.stringify([C]));
});

test('4. 先頭300件でタップ11件 → 続行（1,000件まで待つ）', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 300, taps: 11 });
  const { plan } = hourly(db);
  assert.equal(plan.outcome, 'wait');
  assert.equal(plan.writes.length, 0);
  assert.equal(creativeOf(db, B).status, 'trialing');
  assert.equal(creativeOf(db, B).decided_at, null);
  assert.equal(configOf(db).active_vs, JSON.stringify([B]));
  const j = lastJudgment(db);
  assert.equal(j.outcome, 'wait');
  assert.equal(j.applied, 0);
  assert.equal(j.views, 300); // 判定に使う窓（先頭1,000件）の数。行き過ぎた分は detail に書く
  assert.equal(j.taps, 11);
});

test('5. 1,400件まで行き過ぎても先頭1,000件だけで判定し、同時刻は events.id の順で決まる', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  // 先頭1,000件のうちタップは55件。1,001件目以降（400件）は全部タップあり
  fillTrial(add, B, { n: 1000, taps: 55 });
  fillTrial(add, B, { n: 400, taps: 400, offset: 1000, sidPrefix: 'late' });
  // 1,000件目と同じ received_at の sid を1つ足す（id が後なので 1,001件目になり、タップは数えない）
  add(at(999), 'tie', 'banner_view', B);
  add(at(999), 'tie', 'banner_tap', B, 'check_b');
  const { plan, trial } = hourly(db);
  assert.equal(trial.total, 1401);
  assert.equal(trial.first1000.views, 1000);
  assert.equal(trial.first1000.taps, 55);
  assert.equal(plan.outcome, 'pass');
  assert.equal(creativeOf(db, B).decided_views, 1000);
  assert.equal(creativeOf(db, B).decided_taps, 55);
});

test('6. 全部が不合格（cut・fail のみ）→ 一巡後はストア到達率が最高の1本だけ・記録に合格0件が残る', () => {
  // B〜A2 は判定済み（A1 のストア到達率が最高）。A3 を試し中にして最後の判定を出す
  const { db, add } = newDb({
    activeVs: [A3], creatives: {
      [B]: { status: 'cut', decided_at: START, decided_views: 300, decided_taps: 5, decided_store: 3 },
      [C]: { status: 'fail', decided_at: START, decided_views: 1000, decided_taps: 40, decided_store: 20 },
      [A1]: { status: 'fail', decided_at: START, decided_views: 1000, decided_taps: 50, decided_store: 50 },
      [A2]: { status: 'cut', decided_at: START, decided_views: 300, decided_taps: 8, decided_store: 8 },
      [A3]: trialing,
    },
  });
  fillTrial(add, A3, { n: 1000, taps: 40 });
  const { plan } = hourly(db);
  assert.equal(plan.outcome, 'fail');
  assert.deepEqual(plan.activeVs, [A1]); // 50/1000 = 0.05 が最高（B 0.01・C 0.02・A2 0.0267・A3 0.04）
  const cfg = configOf(db);
  assert.equal(cfg.active_vs, JSON.stringify([A1]));
  assert.equal(cfg.cycle_done, 1);
  assert.match(lastJudgment(db).detail, new RegExp(NO_PASS_DETAIL));
});

test('7. ストア到達率が同点なら trial_order が小さい方が選ばれる', () => {
  const rows = [
    { v: C, trial_order: 2, status: 'fail', decided_views: 1000, decided_store: 100 },
    { v: B, trial_order: 1, status: 'fail', decided_views: 300, decided_store: 30 },
  ];
  const { active, note } = cycleActive(rows);
  assert.deepEqual(active, [B]);
  assert.equal(note, NO_PASS_DETAIL);
});

test('8. 一巡後に未判定の案を足すと試しのモードに戻り、判定がつくと一巡後のモードに戻る', () => {
  const { db, add } = newDb({
    activeVs: [B], cycleDone: 1, creatives: {
      [B]: { status: 'pass', decided_at: START, decided_views: 1000, decided_taps: 60, decided_store: 40 },
      [C]: { status: 'fail', decided_at: START, decided_views: 1000, decided_taps: 20, decided_store: 10 },
      [A1]: { status: 'cut', decided_at: START, decided_views: 300, decided_taps: 3, decided_store: 2 },
      [A2]: { status: 'cut', decided_at: START, decided_views: 300, decided_taps: 4, decided_store: 2 },
      [A3]: { status: 'pending' }, // あとから足した案
    },
  });
  // 1回目: 試しのモードに戻り、足した案だけを出す
  const first = hourly(db, NOW).plan;
  assert.equal(first.outcome, 'start');
  assert.equal(creativeOf(db, A3).status, 'trialing');
  assert.equal(configOf(db).active_vs, JSON.stringify([A3]));
  assert.equal(configOf(db).cycle_done, 0);
  // 2回目: その案に判定がつくと、一巡後のモード（pass の案）に戻る
  fillTrial(add, A3, { n: 1000, taps: 30 });
  db.prepare('UPDATE banner_creatives SET started_at = ? WHERE v = ?').run(START, A3);
  const second = hourly(db, NOW).plan;
  assert.equal(second.outcome, 'fail');
  assert.equal(configOf(db).active_vs, JSON.stringify([B]));
  assert.equal(configOf(db).cycle_done, 1);
});

test('9. 全停止中は判定の記録だけが残り、再開後の実行で同じ結果が反映される', () => {
  const { db, add } = newDb({ stopped: 1, creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 1000, taps: 55, store: 30 });
  const { plan } = hourly(db);
  assert.equal(plan.outcome, 'pass');
  assert.equal(plan.writes.length, 0);
  assert.equal(creativeOf(db, B).status, 'trialing');
  assert.equal(creativeOf(db, C).status, 'pending');
  assert.equal(configOf(db).active_vs, JSON.stringify([B]));
  assert.equal(configOf(db).updated_by, 'init');
  const j = lastJudgment(db);
  assert.equal(j.outcome, 'pass');
  assert.equal(j.applied, 0);
  assert.match(j.detail, /全停止中/);
  // 再開（人のコマンド）→ 次の実行で同じ判定が反映される
  db.prepare('UPDATE banner_config SET stopped = 0 WHERE id = 1').run();
  const after = hourly(db, NOW + 3600 * 1000).plan;
  assert.equal(after.outcome, 'pass');
  assert.equal(creativeOf(db, B).status, 'pass');
  assert.equal(creativeOf(db, B).decided_taps, 55);
  assert.equal(configOf(db).active_vs, JSON.stringify([C]));
});

test('10. 9909 の sid・空の sid は数えず、同じ sid の重複は1件と数える', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 300, taps: 11 });
  add(at(10), '99091234', 'banner_view', B);
  add(at(10), '99091234', 'banner_tap', B, 'check_b');
  add(at(11), '', 'banner_view', B);
  add(at(12), 's00001', 'banner_view', B); // 2回目の表示
  add(at(13), 's00001', 'banner_tap', B, 'check_b'); // 2回目のタップ
  const { trial } = hourly(db);
  assert.equal(trial.total, 300);
  assert.equal(trial.first300.views, 300);
  assert.equal(trial.first300.taps, 11);
});

test('11. 1,000件目の表示が実行の30分前より後なら判定しない', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 1000, taps: 55 });
  const { plan } = hourly(db, START_MS + 1000 * 1000 + 10 * 60 * 1000); // 1,000件目から10分後
  assert.equal(plan.outcome, 'wait');
  assert.equal(plan.writes.length, 0);
  assert.equal(creativeOf(db, B).status, 'trialing');
  assert.match(lastJudgment(db).detail, /30分以内/);
  // 30分を過ぎた次の実行では判定する
  const after = hourly(db, START_MS + 1000 * 1000 + 31 * 60 * 1000).plan;
  assert.equal(after.outcome, 'pass');
});

test('12. B・C のストア到達は cta_store、A1〜A3 は banner_tap。違う v の行は数えない', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 300, taps: 20, store: 12 });
  add(at(5), 's00001', 'cta_store', C); // 違う v のストア到達
  add(at(5), 's00002', 'banner_tap', C, 'check_c'); // 違う v のタップ
  const { trial: tb } = hourly(db);
  assert.equal(tb.first300.taps, 20);
  assert.equal(tb.first300.store, 12);

  const second = newDb({ activeVs: [A1], creatives: { [A1]: trialing } });
  fillTrial(second.add, A1, { n: 300, taps: 15 });
  second.add(at(5), 'a00001', 'cta_store', A1); // app の案では cta_store を見ない
  const { trial: ta } = hourly(second.db);
  assert.equal(ta.first300.taps, 15);
  assert.equal(ta.first300.store, 15); // app はタップ＝ストア到達
});

test('13. started_at より前の banner_view は数えない', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 300, taps: 11 });
  fillTrial(add, B, { n: 50, taps: 50, offset: -7200, sidPrefix: 'old' }); // 開始の2時間前
  const { trial } = hourly(db);
  assert.equal(trial.total, 300);
  assert.equal(trial.first300.taps, 11);
});

test('日次の記録: 前日（JST）の案ごとの行を1日1行ずつ書く（全停止中も書く）', () => {
  const now = Date.parse('2026-10-07T00:05:00+09:00');
  const { db, add } = newDb({ stopped: 1, creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 10, taps: 4, store: 2 }); // 2026-10-06（前日）
  add('2026-10-07T09:00:00+09:00', 'today1', 'banner_view', B); // 当日は入らない
  const plan = daily(db, now);
  assert.equal(plan.day, '2026-10-06');
  const rows = db.prepare('SELECT * FROM banner_daily ORDER BY v').all();
  assert.equal(rows.length, 5);
  const b = rows.find((r) => r.v === B);
  assert.equal(b.views, 10);
  assert.equal(b.taps, 4);
  assert.equal(b.store, 2);
  assert.equal(b.status, 'trialing');
  assert.equal(b.stopped, 1);
  assert.equal(rows.find((r) => r.v === C).views, 0);
  assert.equal(lastJudgment(db).outcome, 'daily');
  // 同じ日をもう一度書いても1日1行（INSERT OR REPLACE）
  daily(db, now);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM banner_daily WHERE day = '2026-10-06'").get().n, 5);
});

// --- metrics.ts に足した received_at の下限（TASK-I16-20261002-003「作るもの」6）---

test('下限を渡さないときの SQL と binds は -001 のまま（`+event` が付かない）', () => {
  const t = buildTrialSql(B, START);
  assert.deepEqual(t.binds, [B, START]);
  assert.ok(t.sql.includes(`WHERE event IN ('banner_view'`));
  assert.ok(!t.sql.includes('+event'));
  assert.ok(!t.sql.includes('received_at >= ?3'));
  for (const period of [{ kind: 'all' }, { kind: 'fix' }, { kind: 'day', day: '2026-10-05' }]) {
    const q = buildStatsSql(period);
    assert.deepEqual(q.binds, [FIX_BOUNDARY]);
    assert.ok(q.sql.includes(`WHERE event IN ('banner_view'`));
    assert.ok(!q.sql.includes('+event'));
  }
});

test('下限を渡すと `+event` と received_at の下限が入り、下限より前の行を数えない', () => {
  const since = '2026-10-06T00:00:00+09:00';
  const t = buildTrialSql(B, START, since);
  assert.deepEqual(t.binds, [B, START, since]);
  assert.ok(t.sql.includes(`WHERE +event IN ('banner_view'`));
  assert.ok(t.sql.includes('received_at >= ?3'));
  const q = buildStatsSql({ kind: 'day', day: '2026-10-05' }, '2026-09-06T00:00:00+09:00');
  assert.deepEqual(q.binds, [FIX_BOUNDARY, '2026-09-06T00:00:00+09:00']);
  assert.ok(q.sql.includes(`WHERE +event IN ('banner_view'`));
  assert.ok(q.sql.includes('received_at >= ?2'));

  // 下限より前（試しの開始の2時間前）に別の表示とタップがあっても、数は変わらない
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  fillTrial(add, B, { n: 300, taps: 11 });
  fillTrial(add, B, { n: 50, taps: 50, offset: -7200, sidPrefix: 'old' });
  const withSince = toTrial(B, db.prepare(t.sql).all(...t.binds));
  const noSince = (() => { const x = buildTrialSql(B, START); return toTrial(B, db.prepare(x.sql).all(...x.binds)); })();
  assert.equal(withSince.total, 300);
  assert.deepEqual(withSince, noSince); // 下限の有無で結果は変わらない（読む行だけが減る）

  // 集計の SQL は、下限より前の日の行を返さない
  const all = buildStatsSql({ kind: 'all' });
  const rowsAll = db.prepare(all.sql).all(...all.binds);
  const bounded = buildStatsSql({ kind: 'all' }, '2026-10-06T00:00:00+09:00');
  const rowsBounded = db.prepare(bounded.sql).all(...bounded.binds);
  assert.ok(rowsAll.some((r) => r.day === '2026-10-05'));
  assert.ok(!rowsBounded.some((r) => r.day === '2026-10-05'));
  assert.equal(rowsBounded.find((r) => r.day === '2026-10-06').views, 300);
});

// 下限は ev に入るので、タップ・ストア到達を作る m にも効く。「下限を渡しても結果は変わらない」が
// 成り立つのは、同じ sid が同じ案を2回見ることが無いから（public/banner/mtr-exit.js: sid は
// sessionStorage の mtrb_sid、mtrb_shown で「同じ sid には二度出さない」）。その前提をここで固定する。
test('下限は m にも効く: 開始前にタップした sid が開始後にもう一度見た場合だけ、数が1件ずれる', () => {
  const { db, add } = newDb({ creatives: { [B]: trialing } });
  add('2026-10-05T23:00:00+09:00', 'ret', 'banner_view', B);
  add('2026-10-05T23:00:05+09:00', 'ret', 'banner_tap', B, 'check_b');
  add('2026-10-05T23:00:30+09:00', 'ret', 'cta_store', B);
  add('2026-10-06T00:00:10+09:00', 'ret', 'banner_view', B); // 本番では起きない（二度出さないため）
  fillTrial(add, B, { n: 299, offset: 20 });
  const run = (q) => toTrial(B, db.prepare(q.sql).all(...q.binds));
  const noBound = run(buildTrialSql(B, START));
  const bound = run(buildTrialSql(B, START, START));
  assert.equal(noBound.first300.views, 300);
  assert.equal(bound.first300.views, 300); // 表示数は同じ
  assert.equal(noBound.first300.taps, 1);
  assert.equal(bound.first300.taps, 0); // 開始前のタップは下限つきでは数えない
  assert.equal(noBound.first300.store, 1);
  assert.equal(bound.first300.store, 0);
});
