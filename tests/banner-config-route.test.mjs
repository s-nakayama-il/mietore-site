import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// tests/worker-routing.test.mjs と同じく、esbuild で src/worker.ts を1ファイルにまとめてから読む
const outfile = join(await mkdtemp(join(tmpdir(), 'mietore-banner-config-')), 'worker.mjs');
await esbuild.build({
  entryPoints: [new URL('../src/worker.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  outfile,
});
const { default: worker } = await import(pathToFileURL(outfile).href);

const ASSETS_STATUS = 599; // ASSETS に回ったことが分かる印
const B = 'banner-20260928-B';
const C = 'banner-20260928-C';
const ctx = { waitUntil() {}, passThroughOnException() {} };

// D1 を模す。表が無いときは D1 と同じように例外を投げる
function makeEnv({ row = { stopped: 0, active_vs: `["${B}"]` }, noTable = false, noRow = false, fail = false } = {}) {
  const assets = [];
  const queries = [];
  const env = {
    DB: {
      prepare(sql) {
        const stmt = {
          bind(...b) { stmt.binds = b; return stmt; },
          async all() {
            queries.push(sql);
            if (noTable) throw new Error('D1_ERROR: no such table: banner_config');
            if (fail) throw new Error('D1_ERROR: network');
            return { results: noRow ? [] : [row] };
          },
        };
        return stmt;
      },
    },
    ASSETS: { fetch: async (req) => { assets.push(req.url); return new Response('assets', { status: ASSETS_STATUS }); } },
  };
  return { env, assets, queries };
}

const call = (env, path, init) => worker.fetch(new Request('https://mietore.site' + path, init), env, ctx);

function assertCommonHeaders(res) {
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
}

test('GET /banner/config は 200 で {"stopped":…,"active":[…]} とヘッダ3つ', async () => {
  const { env, queries, assets } = makeEnv();
  const res = await call(env, '/banner/config');
  assert.equal(res.status, 200);
  assertCommonHeaders(res);
  assert.equal(await res.text(), `{"stopped":false,"active":["${B}"]}`);
  assert.equal(queries.length, 1);
  assert.equal(queries[0], 'SELECT stopped, active_vs FROM banner_config WHERE id = 1');
  assert.equal(assets.length, 0);
});

test('GET /banner/config は全停止・複数の案・空の一覧をそのまま返す', async () => {
  const stopped = await call(makeEnv({ row: { stopped: 1, active_vs: `["${B}"]` } }).env, '/banner/config');
  assert.equal(await stopped.text(), `{"stopped":true,"active":["${B}"]}`);

  const two = await call(makeEnv({ row: { stopped: 0, active_vs: `["${B}","${C}"]` } }).env, '/banner/config');
  assert.equal(await two.text(), `{"stopped":false,"active":["${B}","${C}"]}`);

  const none = await call(makeEnv({ row: { stopped: 0, active_vs: '[]' } }).env, '/banner/config');
  assert.equal(await none.text(), '{"stopped":false,"active":[]}');
});

test('HEAD /banner/config は 200・本文なし・ヘッダ3つ', async () => {
  const { env } = makeEnv();
  const res = await call(env, '/banner/config', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assertCommonHeaders(res);
  assert.equal(await res.text(), '');
});

test('クエリ付きでも 200（クエリは見ない）', async () => {
  const { env, assets } = makeEnv();
  const res = await call(env, '/banner/config?t=1');
  assert.equal(res.status, 200);
  assert.equal(assets.length, 0);
});

test('表が無い・行が無い・active_vs が壊れている・D1 の例外は 503', async () => {
  const cases = [
    ['表が無い', { noTable: true }],
    ['行が無い', { noRow: true }],
    ['D1 の例外', { fail: true }],
    ['active_vs が JSON でない', { row: { stopped: 0, active_vs: 'B' } }],
    ['active_vs が配列でない', { row: { stopped: 0, active_vs: '{"a":1}' } }],
    ['active_vs に文字列でない要素', { row: { stopped: 0, active_vs: '[1]' } }],
    ['active_vs が文字列でない', { row: { stopped: 0, active_vs: null } }],
    ['stopped が 0・1 でない', { row: { stopped: 'no', active_vs: '[]' } }],
  ];
  for (const [name, opts] of cases) {
    const { env, assets } = makeEnv(opts);
    const res = await call(env, '/banner/config');
    assert.equal(res.status, 503, name);
    assertCommonHeaders(res);
    assert.equal(await res.text(), '{"error":"config_unavailable"}', name);
    assert.equal(assets.length, 0, name);
  }
});

test('GET・HEAD 以外は 405 と Allow・ヘッダ3つ（D1 は読まない）', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const { env, queries, assets } = makeEnv();
    const res = await call(env, '/banner/config', { method });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD', method);
    assertCommonHeaders(res);
    assert.equal(await res.text(), '{"error":"method_not_allowed"}', method);
    assert.equal(queries.length, 0, method);
    assert.equal(assets.length, 0, method);
  }
});

test('/banner/config/ など完全一致しないパスは ASSETS に回る', async () => {
  for (const path of ['/banner/config/', '/banner/configx', '/banner/config.json', '/banner/', '/banner/mtr-exit.js']) {
    const { env, assets, queries } = makeEnv();
    const res = await call(env, path);
    assert.equal(res.status, ASSETS_STATUS, path);
    assert.equal(assets.length, 1, path);
    assert.equal(assets[0], 'https://mietore.site' + path);
    assert.equal(queries.length, 0, path);
  }
});

test('-001 までの振り分けは変わっていない（/app・/mm/track・/mm/stats・/mm/banner-stats）', async () => {
  const app = await call(makeEnv().env, '/app', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } });
  assert.equal(app.status, 302);
  assert.equal(app.headers.get('location'), 'https://apps.apple.com/jp/app/id6738352362');

  const track = await call(makeEnv().env, '/mm/track', { method: 'OPTIONS' });
  assert.equal(track.status, 204);

  const stats = await call(makeEnv().env, '/mm/stats');
  assert.equal(stats.status, 403); // STATS_KEY 未設定

  const statsEnv = makeEnv().env;
  statsEnv.BANNER_STATS_USER = 'test-user';
  statsEnv.BANNER_STATS_PASS = 'test-pass';
  const bannerStats = await call(statsEnv, '/mm/banner-stats');
  assert.equal(bannerStats.status, 401); // 資格情報なし
  assert.equal((await call(makeEnv().env, '/mm/banner-stats')).status, 403); // 認証の設定なし
  assert.equal(bannerStats.headers.get('cache-control'), 'no-store');
});

// Workers Free の CPU 時間は1回 10 ms。D1 を模した遅れ0の DB で、JS の処理時間を測る。
test('JS の処理時間: 50回の中央値と最大（最大 5 ms 以下）', async (t) => {
  const { env } = makeEnv();
  const run = async () => {
    const res = await call(env, '/banner/config');
    await res.text();
  };
  for (let i = 0; i < 10; i += 1) await run(); // 測る前の慣らし（10回）
  const ms = [];
  for (let i = 0; i < 50; i += 1) {
    const t0 = performance.now();
    await run();
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const median = (ms[24] + ms[25]) / 2;
  const max = ms[ms.length - 1];
  t.diagnostic(`/banner/config の JS 処理時間: 中央値 ${median.toFixed(3)} ms / 最大 ${max.toFixed(3)} ms（50回・慣らし10回のあと）`);
  assert.ok(max <= 5, `最大 ${max.toFixed(3)} ms が 5 ms を超えた`);
});
