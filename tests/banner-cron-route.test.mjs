// 定期実行の入口（src/worker.ts の scheduled → src/scheduled/banner-cron.ts）。
// esbuild で src/worker.ts を1ファイルにまとめ、D1 を模した DB で動かす。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outfile = join(await mkdtemp(join(tmpdir(), 'mietore-banner-cron-')), 'worker.mjs');
await esbuild.build({
  entryPoints: [new URL('../src/worker.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  outfile,
});
const { default: worker } = await import(pathToFileURL(outfile).href);

const ASSETS_STATUS = 599;
const USER = 'test-user';
const PASS = 'test-pass';
const B = 'banner-20260928-B';
const C = 'banner-20260928-C';
const START = '2026-10-06T00:00:00+09:00';
const NOW = Date.parse('2026-10-06T04:00:00+09:00');
const ALL_TABLES = ['banner_config', 'banner_creatives', 'banner_judgments', 'banner_daily'];

const creative = (v, order, status, extra = {}) => ({
  v, dest: v.endsWith('-B') ? 'check_b' : 'app', trial_order: order, status,
  started_at: status === 'trialing' ? START : null,
  decided_at: null, decided_views: null, decided_taps: null, decided_store: null, ...extra,
});

// D1 を模す。tables に無い表を読もうとしたら、D1 と同じように例外を投げる
function makeDb({ tables = ALL_TABLES, config = [{ stopped: 0, active_vs: JSON.stringify([B]), cycle_done: 0 }],
  creatives = [creative(B, 1, 'trialing'), creative(C, 2, 'pending')],
  trial = [{ total: 1000, v300: 300, t300: 40, s300: 20, v1000: 1000, t1000: 55, s1000: 60, at300: START, at1000: START }],
  stats = [], fail = [] } = {}) {
  const queries = [];
  const reads = [];
  const writes = [];
  // 案の更新は banner_config の副問い合わせ（全停止の確かめ）を含むので、先に banner_creatives を見る
  const table = (sql) => {
    if (sql.includes('sqlite_master')) return 'sqlite_master';
    if (sql.includes('banner_creatives')) return 'banner_creatives';
    if (sql.includes('banner_judgments')) return 'banner_judgments';
    if (sql.includes('banner_daily')) return 'banner_daily';
    if (sql.includes('banner_config')) return 'banner_config';
    return 'events';
  };
  const db = {
    queries,
    reads,
    writes,
    batches: 0,
    prepare(sql) {
      const stmt = {
        sql,
        binds: [],
        bind(...b) { stmt.binds = b; return stmt; },
        async all() {
          queries.push(sql);
          reads.push({ sql, binds: stmt.binds });
          for (const f of fail) if (sql.includes(f)) throw new Error('D1 error: ' + f);
          const t = table(sql);
          if (t !== 'sqlite_master' && t !== 'events' && !tables.includes(t)) throw new Error('no such table: ' + t);
          if (t === 'sqlite_master') return { results: tables.map((name) => ({ name })) };
          if (t === 'banner_config') return { results: config };
          if (t === 'banner_creatives') return { results: creatives };
          if (sql.includes('FROM ranked')) return { results: trial };
          return { results: stats };
        },
      };
      return stmt;
    },
    async batch(list) {
      db.batches += 1;
      for (const s of list) {
        if (!tables.includes(table(s.sql))) throw new Error('no such table');
        writes.push({ sql: s.sql, binds: s.binds });
      }
      return list.map(() => ({ success: true }));
    },
  };
  return db;
}

function makeEnv(opts = {}) {
  const assets = [];
  const db = makeDb(opts);
  return {
    db,
    assets,
    env: {
      DB: db,
      BANNER_STATS_USER: USER,
      BANNER_STATS_PASS: PASS,
      ASSETS: { fetch: async (req) => { assets.push(req.url); return new Response('assets', { status: ASSETS_STATUS }); } },
    },
  };
}

// scheduled は ctx.waitUntil に渡すので、渡された Promise を待つ
async function runCron(env, cron, now = NOW) {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p), passThroughOnException() {} };
  await worker.scheduled({ cron, scheduledTime: now, noRetry() {} }, env, ctx);
  await Promise.all(pending);
}

const sqlOf = (db) => db.writes.map((w) => w.sql);
const wroteTo = (db, name) => sqlOf(db).filter((s) => s.includes(name));

test('毎時の cron は判定と入れ替えを書く（banner_creatives・banner_config・banner_judgments）', async () => {
  const { env, db } = makeEnv();
  await runCron(env, '0 * * * *');
  assert.equal(db.batches, 1);
  assert.equal(db.writes.length, 4); // 判定した案・次の案・設定・記録
  assert.equal(wroteTo(db, 'UPDATE banner_creatives').length, 2);
  assert.equal(wroteTo(db, 'UPDATE banner_config').length, 1);
  assert.equal(wroteTo(db, 'INSERT INTO banner_judgments').length, 1);
  // events を読むクエリは試し中の1本だけ
  assert.equal(db.queries.filter((q) => q.includes('FROM ranked')).length, 1);
  assert.ok(db.queries.length <= 10, `クエリ ${db.queries.length} 本`);
});

test('日次の cron は banner_daily に案ごとの行と記録を書く（判定は書かない）', async () => {
  const { env, db } = makeEnv();
  await runCron(env, '5 15 * * *', Date.parse('2026-10-07T00:05:00+09:00'));
  assert.equal(db.batches, 1);
  assert.equal(wroteTo(db, 'INSERT OR REPLACE INTO banner_daily').length, 2); // 案2本
  assert.equal(wroteTo(db, 'INSERT INTO banner_judgments').length, 1);
  assert.equal(wroteTo(db, 'UPDATE banner_creatives').length, 0);
  assert.equal(wroteTo(db, 'UPDATE banner_config').length, 0);
  assert.equal(db.writes[0].binds[0], '2026-10-06'); // 前日（JST）
  assert.ok(db.queries.length <= 10, `クエリ ${db.queries.length} 本`);
});

test('知らない cron の文字列では何も読まず何も書かない', async () => {
  const { env, db } = makeEnv();
  for (const cron of ['*/5 * * * *', '0 0 * * *', '', '5 15 * * ?']) {
    await runCron(env, cron);
  }
  assert.equal(db.queries.length, 0);
  assert.equal(db.writes.length, 0);
  assert.equal(db.batches, 0);
});

test('判定の表が無いときは例外にならず、何も書かない', async () => {
  for (const tables of [[], ['banner_config'], ['banner_creatives'], ['banner_config', 'banner_creatives']]) {
    const { env, db } = makeEnv({ tables });
    await runCron(env, '0 * * * *');
    await runCron(env, '5 15 * * *');
    // banner_judgments・banner_daily が無ければ書けない。設定と案だけの場合は判定の記録を落として終わる
    assert.equal(wroteTo(db, 'banner_judgments').length, 0);
    assert.equal(wroteTo(db, 'banner_daily').length, 0);
  }
});

test('sqlite_master が読めないときも例外にならない', async () => {
  const { env, db } = makeEnv({ fail: ['sqlite_master'] });
  await runCron(env, '0 * * * *');
  await runCron(env, '5 15 * * *');
  assert.equal(db.writes.length, 0);
});

test('events の集計が落ちたときは outcome = error の記録だけを残す', async () => {
  const { env, db } = makeEnv({ fail: ['FROM ranked'] });
  await runCron(env, '0 * * * *');
  assert.equal(db.writes.length, 1);
  assert.match(db.writes[0].sql, /INSERT INTO banner_judgments/);
  assert.equal(db.writes[0].binds[5], 'error');
});

test('全停止中は設定を書き換えず、記録だけを残す', async () => {
  const { env, db } = makeEnv({ config: [{ stopped: 1, active_vs: JSON.stringify([B]), cycle_done: 0 }] });
  await runCron(env, '0 * * * *');
  assert.equal(db.writes.length, 1);
  assert.match(db.writes[0].sql, /INSERT INTO banner_judgments/);
  assert.equal(db.writes[0].binds[6], 0); // applied = 0
  // 日次の記録は全停止中も書く
  const daily = makeEnv({ config: [{ stopped: 1, active_vs: JSON.stringify([B]), cycle_done: 0 }] });
  await runCron(daily.env, '5 15 * * *', Date.parse('2026-10-07T00:05:00+09:00'));
  assert.equal(wroteTo(daily.db, 'banner_daily').length, 2);
  assert.equal(daily.db.writes[0].binds[6], 1); // banner_daily.stopped = 1
});

test('fetch の振り分けは変わっていない（/mm/banner-stats・/banner/config・既存の道）', async () => {
  const { env, assets } = makeEnv();
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const call = (path, init) => worker.fetch(new Request('https://mietore.site' + path, init), env, ctx);
  const basic = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

  const stats = await call('/mm/banner-stats', { headers: { authorization: basic } });
  assert.equal(stats.status, 200);
  assert.equal((await call('/mm/banner-stats')).status, 401);
  assert.equal((await call('/mm/banner-stats', { method: 'POST' })).status, 405);

  const config = await call('/banner/config');
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), { stopped: false, active: [B] });
  assert.equal((await call('/banner/config', { method: 'POST' })).status, 405);

  assert.equal((await call('/app')).status, 302);
  assert.equal((await call('/mm/track', { method: 'OPTIONS' })).status, 204);
  assert.equal((await call('/mm/stats')).status, 403);
  assert.equal((await call('/')).status, ASSETS_STATUS);
  assert.equal((await call('/banner/config/')).status, ASSETS_STATUS);
  assert.ok(assets.length >= 2);
});

test('D1 の結果を受け取ってから書き込みを組み立てるまでの JS の処理が 5 ms 以下', async () => {
  const { env } = makeEnv();
  const times = [];
  for (let i = 0; i < 55; i += 1) {
    const t0 = performance.now();
    await runCron(env, '0 * * * *');
    times.push(performance.now() - t0);
  }
  const measured = times.slice(5).sort((a, b) => a - b); // 慣らしの5回を除く50回
  const median = measured[Math.floor(measured.length / 2)];
  const max = measured[measured.length - 1];
  console.log(`毎時の実行の JS: 中央値 ${median.toFixed(3)} ms・最大 ${max.toFixed(3)} ms（慣らし5回を除く50回）`);
  assert.ok(max <= 5, `最大 ${max.toFixed(3)} ms`);
});

test('events を読む2本には received_at の下限が入る（毎時は started_at、日次は前日0時の30日前）', async () => {
  const hourly = makeEnv();
  await runCron(hourly.env, '0 * * * *');
  const trial = hourly.db.reads.find((r) => r.sql.includes('FROM ranked'));
  assert.ok(trial.sql.includes(`WHERE +event IN ('banner_view'`), '下限つきは +event');
  assert.ok(trial.sql.includes('received_at >= ?3'));
  assert.deepEqual(trial.binds, [B, START, START]); // 下限は試し中の案の started_at

  const daily = makeEnv();
  await runCron(daily.env, '5 15 * * *', Date.parse('2026-10-07T00:05:00+09:00'));
  const stats = daily.db.reads.find((r) => r.sql.includes('GROUP BY fv.v, day, seg'));
  assert.ok(stats.sql.includes(`WHERE +event IN ('banner_view'`));
  assert.ok(stats.sql.includes('received_at >= ?2'));
  // 前日 2026-10-06 の0時の30日前 = 2026-09-06T00:00:00+09:00
  assert.equal(stats.binds[1], '2026-09-06T00:00:00+09:00');
});
