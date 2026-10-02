import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  buildStatsSql, toPeriodStats, toDaily, buildTrialSql, toTrial,
  parsePeriod, recentDays, jstToday, destOf, FIX_BOUNDARY,
} from '../src/lib/banner/metrics.ts';

const SCHEMA = new URL('../schema/mm.sql', import.meta.url).pathname;
const B = 'banner-20260928-B';
const C = 'banner-20260928-C';
const A1 = 'banner-20260928-A1';

function newDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(SCHEMA, 'utf8'));
  const ins = db.prepare('INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family) VALUES (?,?,?,?,?,?,?,?,?)');
  const add = (at, sid, event, v, param = '') => ins.run(at, at, sid, event, param, 'u', 'Android', v, 'browser');
  return { db, add };
}

function statsOf(db, period) {
  const { sql, binds } = buildStatsSql(period);
  const rows = db.prepare(sql).all(...binds);
  return { rows, stats: toPeriodStats(rows, period) };
}

const byV = (list, v) => list.find((s) => s.v === v);
const stageOf = (funnels, v, key) => funnels.find((f) => f.v === v).stages.find((s) => s.key === key).count;

test('検査用（9909）と空の sid は数に入らない', () => {
  const { db, add } = newDb();
  add('2026-10-02T10:00:00+09:00', 's1', 'banner_view', B);
  add('2026-10-02T10:00:00+09:00', '99091234', 'banner_view', B);
  add('2026-10-02T10:00:00+09:00', '', 'banner_view', B);
  const { stats } = statsOf(db, { kind: 'all' });
  assert.equal(byV(stats.summary, B).views, 1);
});

test('同じ sid の banner_view が2回あっても1件', () => {
  const { db, add } = newDb();
  add('2026-10-02T10:00:00+09:00', 's1', 'banner_view', B);
  add('2026-10-02T10:30:00+09:00', 's1', 'banner_view', B);
  const { stats } = statsOf(db, { kind: 'all' });
  assert.equal(byV(stats.summary, B).views, 1);
});

test('違う v の banner_tap は、その v のタップに入らない', () => {
  const { db, add } = newDb();
  add('2026-10-02T10:00:00+09:00', 's1', 'banner_view', B);
  add('2026-10-02T10:00:05+09:00', 's1', 'banner_tap', C, 'check_c');
  const { stats } = statsOf(db, { kind: 'all' });
  assert.equal(byV(stats.summary, B).views, 1);
  assert.equal(byV(stats.summary, B).taps, 0);
});

test('A1 のストア到達はタップと同じ、B のストア到達は cta_store', () => {
  const { db, add } = newDb();
  add('2026-10-02T10:00:00+09:00', 'a1', 'banner_view', A1);
  add('2026-10-02T10:00:05+09:00', 'a1', 'banner_tap', A1, 'app');
  add('2026-10-02T10:00:00+09:00', 'b1', 'banner_view', B);
  add('2026-10-02T10:00:05+09:00', 'b1', 'banner_tap', B, 'check_b');
  add('2026-10-02T10:00:00+09:00', 'b2', 'banner_view', B);
  add('2026-10-02T10:00:05+09:00', 'b2', 'banner_tap', B, 'check_b');
  add('2026-10-02T10:01:00+09:00', 'b2', 'cta_store', B, 'os=ios');
  const { stats } = statsOf(db, { kind: 'all' });
  assert.equal(byV(stats.summary, A1).taps, 1);
  assert.equal(byV(stats.summary, A1).store, 1);
  assert.equal(byV(stats.summary, B).taps, 2);
  assert.equal(byV(stats.summary, B).store, 1);
});

test('今の5本以外の v は、タップの param が app か cta_store でストア到達を数える（二重に数えない）', () => {
  const { db, add } = newDb();
  const X = 'banner-20261101-X';
  assert.equal(destOf(X), 'unknown');
  add('2026-10-02T10:00:00+09:00', 'x1', 'banner_view', X);
  add('2026-10-02T10:00:05+09:00', 'x1', 'banner_tap', X, 'app');
  add('2026-10-02T10:01:00+09:00', 'x1', 'cta_store', X, 'os=ios'); // 両方ある人を2回数えない
  add('2026-10-02T10:00:00+09:00', 'x2', 'banner_view', X);
  add('2026-10-02T10:00:05+09:00', 'x2', 'banner_tap', X, 'check_b');
  const { stats } = statsOf(db, { kind: 'all' });
  assert.equal(byV(stats.summary, X).views, 2);
  assert.equal(byV(stats.summary, X).taps, 2);
  assert.equal(byV(stats.summary, X).store, 1);
});

test('banner_view が無く check_start だけ来た sid は段階に入らない', () => {
  const { db, add } = newDb();
  add('2026-10-02T10:00:00+09:00', 's1', 'banner_view', B);
  add('2026-10-02T10:00:06+09:00', 's1', 'check_start', B, 'cv=20261001');
  add('2026-10-02T09:00:00+09:00', 's9', 'check_start', B, 'cv=20261001');
  add('2026-10-02T09:00:10+09:00', 's9', 'check_answer', B, 'q=1;ok=1');
  const { stats } = statsOf(db, { kind: 'all' });
  assert.equal(byV(stats.summary, B).views, 1);
  assert.equal(stageOf(stats.funnels, B, 'cs'), 1);
  assert.equal(stageOf(stats.funnels, B, 'q1'), 0);
});

test('期間の振り分けは最初の banner_view で決まる（日をまたぐタップも前の日に数える）', () => {
  const { db, add } = newDb();
  add('2026-10-01T23:59:59+09:00', 's1', 'banner_view', B);
  add('2026-10-02T00:00:10+09:00', 's1', 'banner_tap', B, 'check_b');
  const d01 = statsOf(db, { kind: 'day', day: '2026-10-01' }).stats;
  assert.equal(byV(d01.summary, B).views, 1);
  assert.equal(byV(d01.summary, B).taps, 1);
  const d02 = statsOf(db, { kind: 'day', day: '2026-10-02' }).stats;
  assert.equal(d02.summary.length, 0);
  const { rows } = statsOf(db, { kind: 'all' });
  const daily = toDaily(rows, '2026-10-02', 3);
  assert.equal(daily[0].day, '2026-10-02');
  assert.deepEqual(daily[0].byV, {});
  assert.equal(daily[1].byV[B].views, 1);
  assert.equal(daily[1].byV[B].taps, 1);
});

test('改修の前後: 境目ちょうどは後。段階は check_start の param で分ける', () => {
  const { db, add } = newDb();
  // 前（表示も段階も前）
  add('2026-10-01T13:15:53+09:00', 'p1', 'banner_view', B);
  add('2026-10-01T13:15:55+09:00', 'p1', 'banner_tap', B, 'check_b');
  add('2026-10-01T13:15:56+09:00', 'p1', 'check_start', B, '');
  // 境目ちょうど（後）
  add(FIX_BOUNDARY, 'p2', 'banner_view', B);
  add('2026-10-01T13:16:10+09:00', 'p2', 'banner_tap', B, 'check_b');
  add('2026-10-01T13:16:11+09:00', 'p2', 'check_start', B, 'cv=20261001');
  // 表示は前・チェックは後にまたがる sid
  add('2026-10-01T13:00:00+09:00', 'p3', 'banner_view', B);
  add('2026-10-01T14:00:00+09:00', 'p3', 'banner_tap', B, 'check_b');
  add('2026-10-01T14:00:01+09:00', 'p3', 'check_start', B, 'cv=20261001');
  const { stats } = statsOf(db, { kind: 'fix' });
  assert.equal(byV(stats.summaryBefore, B).views, 2); // p1・p3
  assert.equal(byV(stats.summaryAfter, B).views, 1);  // p2
  assert.equal(stageOf(stats.funnelsBefore, B, 'cs'), 1); // p1 だけ param ''
  assert.equal(stageOf(stats.funnelsAfter, B, 'cs'), 2);  // p2・p3
});

test('試しの範囲: started_at より前の表示は数えない。先頭 N 件の境目は received_at → events.id の順', () => {
  const { db, add } = newDb();
  const started = '2026-10-02T00:00:00+09:00';
  add('2026-10-01T10:00:00+09:00', 'old1', 'banner_view', B); // 開始前
  add('2026-10-01T10:00:05+09:00', 'old1', 'banner_tap', B, 'check_b');
  // 同じ時刻に3件。id の順で並ぶ
  add('2026-10-02T00:00:01+09:00', 'e1', 'banner_view', B);
  add('2026-10-02T00:00:01+09:00', 'e2', 'banner_view', B);
  add('2026-10-02T00:00:01+09:00', 'e3', 'banner_view', B);
  add('2026-10-02T00:00:02+09:00', 'e2', 'banner_tap', B, 'check_b');
  const t = buildTrialSql(B, started);
  const trial = toTrial(B, db.prepare(t.sql).all(...t.binds));
  assert.equal(trial.total, 3);
  assert.equal(trial.first300.views, 3);
  assert.equal(trial.first300.taps, 1);
  assert.equal(trial.at300, '');
  assert.equal(trial.at1000, '');
});

test('試しの範囲: 1,400件あるとき、先頭 1,000件の外のタップ・ストア到達は数えない。300件目・1,000件目の時刻が返る', () => {
  const { db, add } = newDb();
  const started = '2026-10-02T00:00:00+09:00';
  const at = (i) => `2026-10-02T${String(Math.floor(i / 3600) % 24).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}+09:00`;
  for (let i = 1; i <= 1400; i += 1) {
    add(at(i), `s${String(i).padStart(4, '0')}`, 'banner_view', B);
    // 全員タップ・ストア到達させる（先頭 N 件の外が数に入らないことを見る）
    add(at(i), `s${String(i).padStart(4, '0')}`, 'banner_tap', B, 'check_b');
    add(at(i), `s${String(i).padStart(4, '0')}`, 'cta_store', B, 'os=ios');
  }
  const t = buildTrialSql(B, started);
  const trial = toTrial(B, db.prepare(t.sql).all(...t.binds));
  assert.equal(trial.total, 1400);
  assert.equal(trial.first300.views, 300);
  assert.equal(trial.first300.taps, 300);
  assert.equal(trial.first300.store, 300);
  assert.equal(trial.first1000.views, 1000);
  assert.equal(trial.first1000.taps, 1000);
  assert.equal(trial.first1000.store, 1000);
  assert.equal(trial.at300, at(300));
  assert.equal(trial.at1000, at(1000));
});

test('試しの範囲: B は cta_store、A1 は banner_tap でストア到達を数える', () => {
  const { db, add } = newDb();
  const started = '2026-10-02T00:00:00+09:00';
  add('2026-10-02T01:00:00+09:00', 'b1', 'banner_view', B);
  add('2026-10-02T01:00:05+09:00', 'b1', 'banner_tap', B, 'check_b');
  add('2026-10-02T01:00:00+09:00', 'a1', 'banner_view', A1);
  add('2026-10-02T01:00:05+09:00', 'a1', 'banner_tap', A1, 'app');
  const tb = buildTrialSql(B, started);
  assert.equal(toTrial(B, db.prepare(tb.sql).all(...tb.binds)).first300.store, 0);
  const ta = buildTrialSql(A1, started);
  assert.equal(toTrial(A1, db.prepare(ta.sql).all(...ta.binds)).first300.store, 1);
});

test('C の段階は c.html の流れの順に並ぶ', () => {
  const { db, add } = newDb();
  add('2026-10-02T10:00:00+09:00', 'c1', 'banner_view', C);
  add('2026-10-02T10:00:05+09:00', 'c1', 'banner_tap', C, 'check_c');
  add('2026-10-02T10:00:06+09:00', 'c1', 'check_start', C, 'cv=20261001');
  add('2026-10-02T10:00:10+09:00', 'c1', 'check_answer', C, 'q=1;ok=1');
  add('2026-10-02T10:00:20+09:00', 'c1', 'check_answer', C, 'q=2;ok=1');
  add('2026-10-02T10:00:30+09:00', 'c1', 'check_answer', C, 'q=3;ok=1');
  add('2026-10-02T10:00:40+09:00', 'c1', 'rule_view', C);
  add('2026-10-02T10:00:50+09:00', 'c1', 'trial_start', C);
  add('2026-10-02T10:01:00+09:00', 'c1', 'trial_clear', C, 's=7.6;in=1');
  add('2026-10-02T10:01:10+09:00', 'c1', 'check_result', C, 'ty=1');
  add('2026-10-02T10:01:20+09:00', 'c1', 'cta_store', C, 'os=ios');
  const { stats } = statsOf(db, { kind: 'all' });
  const f = stats.funnels.find((x) => x.v === C);
  assert.deepEqual(f.stages.map((s) => s.key), ['taps', 'cs', 'q1', 'q2', 'q3', 'rule_view', 'trial_start', 'trial_clear', 'check_result', 'store']);
  assert.ok(f.stages.every((s) => s.count === 1));
});

test('parsePeriod: 既定は全期間。形が違えば null', () => {
  const p = (q) => parsePeriod(new URLSearchParams(q));
  assert.deepEqual(p(''), { kind: 'all' });
  assert.deepEqual(p('p=all'), { kind: 'all' });
  assert.deepEqual(p('p=fix'), { kind: 'fix' });
  assert.deepEqual(p('p=day&d=2026-10-02'), { kind: 'day', day: '2026-10-02' });
  assert.equal(p('p=day'), null);
  assert.equal(p('p=day&d=2026-13-01'), null);
  assert.equal(p('p=day&d=2026-02-30'), null);
  assert.equal(p('p=day&d=20261002'), null);
  assert.equal(p('p=week'), null);
});

test('recentDays・jstToday', () => {
  assert.deepEqual(recentDays('2026-10-02', 3), ['2026-10-02', '2026-10-01', '2026-09-30']);
  assert.deepEqual(recentDays('2026-03-01', 2), ['2026-03-01', '2026-02-28']);
  assert.equal(jstToday(Date.parse('2026-10-02T14:00:00Z')), '2026-10-02'); // JST 23:00
  assert.equal(jstToday(Date.parse('2026-10-02T15:30:00Z')), '2026-10-03'); // JST 翌 00:30
});

test('表示が 0 のとき率は「—」になる（null を返す）', () => {
  const { db } = newDb();
  const { stats } = statsOf(db, { kind: 'all' });
  assert.deepEqual(stats.summary, []);
});
