import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// tests/worker-routing.test.mjs と同じく、esbuild で src/worker.ts を1ファイルにまとめてから読む
const outfile = join(await mkdtemp(join(tmpdir(), 'mietore-banner-stats-')), 'worker.mjs');
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
const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
const ctx = { waitUntil() {}, passThroughOnException() {} };

// D1 を模す。tables に無い表を読もうとしたら、D1 と同じように例外を投げる
function makeDb({ tables = {}, rows = {}, fail = [] } = {}) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      const stmt = {
        sql,
        binds: [],
        bind(...b) { stmt.binds = b; return stmt; },
        async all() {
          queries.push(sql);
          for (const f of fail) if (sql.includes(f)) throw new Error('D1 error: ' + f);
          if (sql.includes('sqlite_master')) {
            return { results: Object.keys(tables).filter((t) => tables[t]).map((name) => ({ name })) };
          }
          if (sql.includes('FROM banner_config')) return { results: rows.config ?? [] };
          if (sql.includes('FROM banner_creatives')) return { results: rows.creatives ?? [] };
          if (sql.includes('FROM banner_daily')) return { results: rows.bannerDaily ?? [] };
          if (sql.includes('FROM ranked')) return { results: rows.trial ?? [{}] };
          return { results: rows.stats ?? [] };
        },
      };
      return stmt;
    },
  };
}

function makeEnv(opts = {}) {
  const assets = [];
  const db = makeDb(opts);
  const env = {
    DB: db,
    ASSETS: { fetch: async (req) => { assets.push(req.url); return new Response('assets', { status: ASSETS_STATUS }); } },
  };
  if (opts.noUser !== true) env.BANNER_STATS_USER = USER;
  if (opts.noPass !== true) env.BANNER_STATS_PASS = PASS;
  return { env, assets, db };
}

const call = (env, path, init) => worker.fetch(new Request('https://mietore.site' + path, init), env, ctx);
const auth = (headers = {}) => ({ headers: { authorization: basic(USER, PASS), ...headers } });

function assertCommonHeaders(res) {
  assert.equal(res.headers.get('x-robots-tag'), 'noindex', 'X-Robots-Tag');
  assert.equal(res.headers.get('cache-control'), 'no-store', 'Cache-Control');
}

test('資格情報が無いと 401 と WWW-Authenticate', async () => {
  const { env } = makeEnv();
  const res = await call(env, '/mm/banner-stats');
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') ?? '', /^Basic realm="mietore-banner-stats", charset="UTF-8"$/);
  assertCommonHeaders(res);
});

test('資格情報が違うと 401（壊れた Base64・形の違いも 401）', async () => {
  const { env } = makeEnv();
  for (const h of [basic(USER, 'wrong'), basic('other', PASS), 'Basic !!!notbase64!!!', 'Bearer abc', 'Basic']) {
    const res = await call(env, '/mm/banner-stats', { headers: { authorization: h } });
    assert.equal(res.status, 401, h);
    assertCommonHeaders(res);
  }
});

test('資格情報が合うと 200（basic の大文字・小文字は問わない）', async () => {
  const { env } = makeEnv();
  const res = await call(env, '/mm/banner-stats', auth());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  assertCommonHeaders(res);
  const lower = await call(env, '/mm/banner-stats', { headers: { authorization: basic(USER, PASS).replace('Basic', 'basic') } });
  assert.equal(lower.status, 200);
});

test('設定（BANNER_STATS_USER / PASS）が無いと 403', async () => {
  for (const opts of [{ noUser: true }, { noPass: true }, { noUser: true, noPass: true }]) {
    const { env } = makeEnv(opts);
    const res = await call(env, '/mm/banner-stats', auth());
    assert.equal(res.status, 403);
    assertCommonHeaders(res);
    assert.equal(res.headers.get('www-authenticate'), null);
  }
});

test('GET・HEAD 以外は 405（Allow: GET, HEAD）。405 は認証より先', async () => {
  const { env } = makeEnv();
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const res = await call(env, '/mm/banner-stats', { method });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
    assertCommonHeaders(res);
  }
});

test('HEAD は本文なしで、GET と同じヘッダ', async () => {
  const { env } = makeEnv();
  const res = await call(env, '/mm/banner-stats', { method: 'HEAD', headers: { authorization: basic(USER, PASS) } });
  assert.equal(res.status, 200);
  assertCommonHeaders(res);
  assert.equal(await res.text(), '');
});

test('期間の形が違うと 400', async () => {
  const { env } = makeEnv();
  for (const q of ['?p=week', '?p=day', '?p=day&d=2026-13-01']) {
    const res = await call(env, '/mm/banner-stats' + q, auth());
    assert.equal(res.status, 400, q);
    assertCommonHeaders(res);
  }
});

test('判定の表・日次の表が無いと、200 で「未設定」と出る（無い表には SELECT を投げない）', async () => {
  const { env, db } = makeEnv({ tables: {} });
  const res = await call(env, '/mm/banner-stats', auth());
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('未設定'), '「未設定」が出る');
  assert.ok(!db.queries.some((q) => q.includes('FROM banner_config')), 'banner_config には投げない');
  assert.ok(!db.queries.some((q) => q.includes('FROM banner_creatives')), 'banner_creatives には投げない');
  assert.ok(!db.queries.some((q) => q.includes('FROM banner_daily')), 'banner_daily には投げない');
});

test('試し中の案があると、進み具合が「表示 N/1,000」の形で出る', async () => {
  const { env } = makeEnv({
    tables: { banner_config: true, banner_creatives: true },
    rows: {
      config: [{ stopped: 0, active_vs: '["banner-20260928-B"]', cycle_done: 0, updated_at: '2026-10-02T18:00:00+09:00', updated_by: 'human' }],
      creatives: [{ v: 'banner-20260928-B', dest: 'check_b', trial_order: 1, status: 'trialing', started_at: '2026-10-02T09:00:00+09:00', decided_at: null, decided_views: null, decided_taps: null, decided_store: null }],
      trial: [{ total: 412, v300: 300, t300: 21, s300: 7, v1000: 412, t1000: 21, s1000: 7, at300: '2026-10-02T15:00:00+09:00', at1000: '' }],
    },
  });
  const res = await call(env, '/mm/banner-stats', auth());
  const html = await res.text();
  assert.ok(html.includes('表示 412/1,000'), '表示 N/1,000');
  assert.ok(html.includes('タップ 21件'), 'タップ件数');
  assert.ok(html.includes('試し中'), '状態が日本語');
});

test('全停止中は、ページの上に目立つ1行が出る', async () => {
  const { env } = makeEnv({
    tables: { banner_config: true, banner_creatives: true },
    rows: {
      config: [{ stopped: 1, active_vs: '[]', cycle_done: 0, updated_at: '2026-10-02T18:00:00+09:00', updated_by: 'init' }],
      creatives: [{ v: 'banner-20260928-B', dest: 'check_b', trial_order: 1, status: 'pending', started_at: null, decided_at: null, decided_views: null, decided_taps: null, decided_store: null }],
    },
  });
  const html = await (await call(env, '/mm/banner-stats', auth())).text();
  assert.ok(html.includes('全停止中'), '全停止中の表示');
  assert.ok(html.includes('試し中の案はありません'), '試し中が無いとき');
});

test('D1 が例外を投げても、その欄だけ「読めませんでした」になり、ほかは出る', async () => {
  const { env } = makeEnv({
    tables: { banner_config: true, banner_creatives: true, banner_daily: true },
    fail: ['FROM banner_daily'],
    rows: {
      config: [{ stopped: 0, active_vs: '[]', cycle_done: 0, updated_at: 'x', updated_by: 'init' }],
      creatives: [],
    },
  });
  const res = await call(env, '/mm/banner-stats', auth());
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('読めませんでした'), '読めなかった欄');
  assert.ok(html.includes('離脱バナーの成績'), 'ほかの欄は出る');
});

test('/mm/banner-stats/ と /mm/banner-statsx は ASSETS に回る', async () => {
  for (const path of ['/mm/banner-stats/', '/mm/banner-statsx', '/mm/banner-stats/index.html']) {
    const { env, assets } = makeEnv();
    const res = await call(env, path, auth());
    assert.equal(res.status, ASSETS_STATUS, path);
    assert.equal(assets.length, 1);
  }
});

test('既存の道（/app・/mm/track・/mm/stats）は変わらない', async () => {
  const { env } = makeEnv();
  const app = await call(env, '/app', { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' } });
  assert.equal(app.status, 302);
  assert.equal(app.headers.get('location'), 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja&referrer=utm_source%3Dexit_banner%26utm_campaign%3Dapp');
  const track = await call(env, '/mm/track', { method: 'OPTIONS' });
  assert.equal(track.status, 204);
  const stats = await call(env, '/mm/stats');
  assert.equal(stats.status, 403); // STATS_KEY 未設定
});

test('ページを組み立てる JS の処理時間（D1 を模した遅れ0の DB・50回）', async () => {
  // 50,000 行の検査データで返った行数（案5本 × 日30 × 前後2 = 300行）に合わせる
  const stats = [];
  const vs = ['banner-20260928-A1', 'banner-20260928-A2', 'banner-20260928-A3', 'banner-20260928-B', 'banner-20260928-C'];
  for (const v of vs) {
    for (let d = 1; d <= 30; d += 1) {
      for (const seg of ['before', 'after']) {
        const day = `2026-09-${String(d).padStart(2, '0')}`;
        const row = { v, day, seg, views: 120, taps: 9, taps_app: 4, store_any: 5 };
        for (const c of ['cs', 'q1', 'q2', 'q3', 'rule_view', 'trial_start', 'trial_clear', 'check_result', 'store']) {
          row[c] = 6; row[c + '_b'] = 3; row[c + '_a'] = 3;
        }
        stats.push(row);
      }
    }
  }
  const creatives = vs.map((v, i) => ({ v, dest: i < 3 ? 'app' : 'check_b', trial_order: i + 1, status: i === 3 ? 'trialing' : 'pending', started_at: i === 3 ? '2026-09-20T00:00:00+09:00' : null, decided_at: null, decided_views: null, decided_taps: null, decided_store: null }));
  const bannerDaily = [];
  for (const v of vs) for (let d = 1; d <= 30; d += 1) bannerDaily.push({ day: `2026-09-${String(d).padStart(2, '0')}`, v, views: 120, taps: 9, store: 5, status: 'pending', stopped: 0, written_at: 'x' });
  const opts = {
    tables: { banner_config: true, banner_creatives: true, banner_daily: true },
    rows: {
      stats,
      creatives,
      bannerDaily,
      config: [{ stopped: 0, active_vs: '["banner-20260928-B"]', cycle_done: 0, updated_at: 'x', updated_by: 'cron' }],
      trial: [{ total: 1400, v300: 300, t300: 21, s300: 7, v1000: 1000, t1000: 64, s1000: 20, at300: 'x', at1000: 'y' }],
    },
  };
  const times = [];
  for (let i = 0; i < 55; i += 1) {
    const { env } = makeEnv(opts);
    const t0 = performance.now();
    const res = await call(env, '/mm/banner-stats', auth());
    await res.text();
    const t1 = performance.now();
    if (i >= 5) times.push(t1 - t0); // 最初の5回は慣らしとして除く
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const max = times[times.length - 1];
  console.log(`[banner-stats] JS 処理時間（${stats.length}行・50回）: 中央値 ${median.toFixed(3)} ms / 最大 ${max.toFixed(3)} ms`);
  assert.ok(max < 50, `最大 ${max.toFixed(3)} ms（Free の 10 ms に対して明らかに外れていないこと）`);
});

const EXPORT_COLS = [
  'received_at', 'ts', 'sid', 'event', 'param', 'url', 'os', 'v', 'ua_family',
  'ua', 'asn', 'as_org', 'region', 'city', 'postal', 'model', 'os_version', 'country',
];

function makeExportDb(rows) {
  const calls = [];
  const db = {
    prepare(sql) {
      const stmt = {
        binds: [],
        bind(...binds) { stmt.binds = binds; return stmt; },
        async all() {
          calls.push({ sql, binds: stmt.binds });
          let selected = rows.map((r, i) => ({ __rowid: i + 1, ...r }));
          if (sql.includes('received_at LIKE')) selected = selected.filter((r) => r.received_at.startsWith(String(stmt.binds[0]).replace('%', '')));
          if (sql.includes('received_at >= ?1')) selected = selected.filter((r) => r.received_at >= stmt.binds[0] && r.received_at < stmt.binds[1]);
          if (sql.startsWith('SELECT count(*) AS n')) return { results: [{ n: selected.length }] };
          if (sql.includes('received_at > ?3')) selected = selected.filter((r) => r.received_at > stmt.binds[2] || (r.received_at === stmt.binds[2] && r.__rowid > stmt.binds[3]));
          if (sql.includes('LIMIT 1000')) selected = selected.slice(0, 1000);
          return { results: selected };
        },
      };
      return stmt;
    },
  };
  return { db, calls };
}

const exportRow = (receivedAt, sid) => ({
  received_at: receivedAt, ts: receivedAt, sid, event: 'banner_view', param: 'back',
  url: 'https://example.test/lp', os: 'Android', v: 'banner-test', ua_family: 'tiktok',
  ua: 'TEST-UA', asn: 64512, as_org: 'Test Carrier', region: 'Test Region', city: 'Test City',
  postal: '000-0000', model: 'TEST-MODEL', os_version: '14', country: 'ZZ',
});

const statsCall = (db, query) => call({ DB: db, STATS_KEY: 'stats-test' }, `/mm/stats?key=stats-test&${query}`);

test('/mm/stats export=csv の from・to は JST の両端日を含み、翌日を含めない', async () => {
  const rows = [
    exportRow('2026-10-31T23:59:59+09:00', 'before'),
    exportRow('2026-11-01T00:00:00+09:00', 'first'),
    exportRow('2026-11-02T23:59:59+09:00', 'last'),
    exportRow('2026-11-03T00:00:00+09:00', 'after'),
  ];
  const { db, calls } = makeExportDb(rows);
  const res = await statsCall(db, 'export=csv&from=2026-11-01&to=2026-11-02');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-export-count'), '2');
  const body = await res.text();
  assert.match(body, /"first"/);
  assert.match(body, /"last"/);
  assert.doesNotMatch(body, /"before"|"after"/);
  assert.deepEqual(calls[0].binds, ['2026-11-01T00:00:00+09:00', '2026-11-03T00:00:00+09:00']);
  assert.match(calls[0].sql, /ORDER BY received_at, rowid LIMIT 1000$/);
});

test('/mm/stats export=csv の from・to は片方欠け・実在しない日・逆順・month併用を 400 にする', async () => {
  const { db, calls } = makeExportDb([]);
  for (const query of [
    'export=csv&from=2026-11-01',
    'export=csv&to=2026-11-01',
    'export=csv&from=2026-02-30&to=2026-03-01',
    'export=csv&from=2026-11-02&to=2026-11-01',
    'export=csv&month=202611&from=2026-11-01&to=2026-11-02',
    'from=2026-11-01&to=2026-11-02',
  ]) {
    const res = await statsCall(db, query);
    assert.equal(res.status, 400, query);
  }
  assert.equal(calls.length, 0, '不正な範囲では D1 を読まない');
});

test('/mm/stats export=csv の従来 month と全件はそのまま使える', async () => {
  const rows = [exportRow('2026-10-31T12:00:00+09:00', 'oct'), exportRow('2026-11-01T12:00:00+09:00', 'nov')];
  const monthDb = makeExportDb(rows);
  const month = await (await statsCall(monthDb.db, 'export=csv&month=202610')).text();
  assert.match(month, /"oct"/);
  assert.doesNotMatch(month, /"nov"/);
  const allDb = makeExportDb(rows);
  const all = await (await statsCall(allDb.db, 'export=csv')).text();
  assert.match(all, /"oct"/);
  assert.match(all, /"nov"/);
});

test('/mm/stats export=csv の日付範囲は1000行ずつ続きから読み、同時刻の行も落とさない', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => exportRow('2026-11-01T12:00:00+09:00', `sid-${i}`));
  const { db, calls } = makeExportDb(rows);
  const res = await statsCall(db, 'export=csv&from=2026-11-01&to=2026-11-01');
  assert.equal(res.headers.get('x-export-count'), '1001');
  const body = await res.text();
  assert.equal(body.match(/"banner_view"/g)?.length, 1001);
  const pages = calls.filter((call) => call.sql.startsWith('SELECT rowid AS __rowid'));
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].binds.slice(2), ['2026-11-01T12:00:00+09:00', 1000]);
});
