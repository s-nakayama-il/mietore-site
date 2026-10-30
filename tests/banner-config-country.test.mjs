import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// 日本以外から来た人にはバナーを出さない（TASK-I16-20261030-001）。
// GET /banner/config は Cloudflare の国（request.cf.country）が JP 以外なら D1 を読まずに「止めている」を返す。
// JP と、cf・国が無いとき（ローカル・テスト）は今までと同じ応答。
// tests/banner-config-route.test.mjs と同じく、esbuild で src/worker.ts を1ファイルにまとめてから読む
const outfile = join(await mkdtemp(join(tmpdir(), 'mietore-banner-config-country-')), 'worker.mjs');
await esbuild.build({
  entryPoints: [new URL('../src/worker.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  outfile,
});
const { default: worker } = await import(pathToFileURL(outfile).href);

const D = 'banner-20261026-D';
const E = 'banner-20261026-E';
const ctx = { waitUntil() {}, passThroughOnException() {} };
const STOPPED = '{"stopped":true,"active":[]}';

function makeEnv({ row = { stopped: 0, active_vs: `["${D}","${E}"]` }, fail = false } = {}) {
  const queries = [];
  const assets = [];
  const env = {
    DB: {
      prepare(sql) {
        const stmt = {
          bind() { return stmt; },
          async all() {
            queries.push(sql);
            if (fail) throw new Error('D1_ERROR: network');
            return { results: [row] };
          },
        };
        return stmt;
      },
    },
    ASSETS: { fetch: async (req) => { assets.push(req.url); return new Response('assets', { status: 599 }); } },
  };
  return { env, queries, assets };
}

// cf は Workers の実行環境が付ける。テストでは Request に後から足す
function call(env, { cf, method = 'GET' } = {}) {
  const req = new Request('https://mietore.site/banner/config', { method });
  if (cf !== undefined) Object.defineProperty(req, 'cf', { value: cf });
  return worker.fetch(req, env, ctx);
}

const headersOf = (res) => [...res.headers.entries()].sort();

test('JP は今と同じ応答（状態・本文・ヘッダーとも、cf が無いときと一致）。D1 を 1 回読む', async () => {
  for (const row of [{ stopped: 0, active_vs: `["${D}","${E}"]` }, { stopped: 1, active_vs: `["${D}"]` }]) {
    const jp = makeEnv({ row });
    const none = makeEnv({ row });
    const a = await call(jp.env, { cf: { country: 'JP', city: 'Test City' } });
    const b = await call(none.env);
    assert.equal(a.status, 200);
    assert.equal(a.status, b.status);
    assert.equal(await a.text(), await b.text());
    assert.deepEqual(headersOf(a), headersOf(b));
    assert.equal(jp.queries.length, 1);
  }
});

test('JP 以外（US・XX＝不明・T1＝Tor）は D1 を読まずに 200「止めている」。ヘッダーは今の 200 と同じ', async () => {
  const ref = await call(makeEnv().env);
  for (const country of ['US', 'LT', 'CA', 'SG', 'XX', 'T1']) {
    const { env, queries, assets } = makeEnv();
    const res = await call(env, { cf: { country } });
    assert.equal(res.status, 200, country);
    assert.equal(await res.text(), STOPPED, country);
    assert.deepEqual(headersOf(res), headersOf(ref), country);
    assert.equal(queries.length, 0, country);
    assert.equal(assets.length, 0, country);
  }
});

test('「止めている」の本文は D1 が stopped=1・active 空のときと同じ形', async () => {
  const fromDb = await call(makeEnv({ row: { stopped: 1, active_vs: '[]' } }).env);
  const outside = await call(makeEnv().env, { cf: { country: 'US' } });
  assert.equal(await outside.text(), await fromDb.text());
});

test('cf が無い・国が無い・国が空はこれまでどおり D1 を読んで返す', async () => {
  for (const cf of [undefined, {}, { country: '' }, { country: null }, { city: 'Test City' }]) {
    const { env, queries } = makeEnv();
    const res = await call(env, { cf });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), `{"stopped":false,"active":["${D}","${E}"]}`);
    assert.equal(queries.length, 1);
  }
});

test('HEAD: JP 以外は 200・本文なし・D1 を読まない。JP は今と同じ 200・本文なし', async () => {
  const out = makeEnv();
  const a = await call(out.env, { cf: { country: 'US' }, method: 'HEAD' });
  assert.equal(a.status, 200);
  assert.equal(await a.text(), '');
  assert.equal(out.queries.length, 0);

  const jp = makeEnv();
  const b = await call(jp.env, { cf: { country: 'JP' }, method: 'HEAD' });
  assert.equal(b.status, 200);
  assert.equal(await b.text(), '');
  assert.equal(jp.queries.length, 1);
});

test('D1 が落ちているとき: JP 以外は D1 を読まずに 200「止めている」、JP と国なしは今どおり 503', async () => {
  const out = makeEnv({ fail: true });
  const a = await call(out.env, { cf: { country: 'US' } });
  assert.equal(a.status, 200);
  assert.equal(await a.text(), STOPPED);
  assert.equal(out.queries.length, 0);

  for (const cf of [{ country: 'JP' }, undefined]) {
    const res = await call(makeEnv({ fail: true }).env, { cf });
    assert.equal(res.status, 503);
    assert.equal(await res.text(), '{"error":"config_unavailable"}');
  }
});

test('405 は国によらず今と同じ（POST は JP 以外でも 405）', async () => {
  for (const country of ['JP', 'US']) {
    const { env, queries } = makeEnv();
    const res = await call(env, { cf: { country }, method: 'POST' });
    assert.equal(res.status, 405, country);
    assert.equal(res.headers.get('allow'), 'GET, HEAD', country);
    assert.equal(queries.length, 0, country);
  }
});
