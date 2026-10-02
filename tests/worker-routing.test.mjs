import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// functions/ の中の import は拡張子なしで node が直接読めないため、
// esbuild（wrangler・astro の依存）で src/worker.ts を OS の一時ディレクトリへ1ファイルにまとめてから読む。
const outfile = join(await mkdtemp(join(tmpdir(), 'mietore-worker-')), 'worker.mjs');
await esbuild.build({
  entryPoints: [new URL('../src/worker.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  outfile,
});
const { default: worker, pagesContextFor } = await import(pathToFileURL(outfile).href);

const ASSETS_STATUS = 599; // ASSETS に回ったことが分かる印（実際の assets は使わない）
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const EVENT = { ts: '2026-10-02T12:00:00+09:00', sid: '9909local', event: 'page_view', param: '', url: 'https://mietore.site/banner/demo/', os: 'Android', v: 'banner-20260928-A1', ua_family: 'browser' };

function makeEnv({ statsKey } = {}) {
  const assets = [];
  const db = [];
  const env = {
    ASSETS: {
      fetch: async (req) => {
        assets.push({ url: req.url, method: req.method });
        return new Response('assets', { status: ASSETS_STATUS });
      },
    },
    DB: {
      prepare: (sql) => ({
        bind: (...binds) => ({
          run: async () => { db.push({ kind: 'run', sql, binds }); return { success: true }; },
          all: async () => { db.push({ kind: 'all', sql, binds }); return { results: [] }; },
        }),
      }),
    },
  };
  if (statsKey) env.STATS_KEY = statsKey;
  return { env, assets, db };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const req = (path, init) => new Request('https://mietore.site' + path, init);
const jsonPost = (payload) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { method: 'POST', body, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } };
};

test('/app は全メソッドで app.ts（302・UA で location が変わる）', async () => {
  for (const method of ['GET', 'HEAD', 'POST']) {
    const { env, assets } = makeEnv();
    const res = await worker.fetch(req('/app', { method, headers: { 'user-agent': UA_IPHONE } }), env, ctx);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://apps.apple.com/jp/app/id6738352362');
    assert.equal(assets.length, 0);
  }
  const { env } = makeEnv();
  const android = await worker.fetch(req('/app', { headers: { 'user-agent': UA_ANDROID } }), env, ctx);
  assert.equal(android.status, 302);
  assert.equal(android.headers.get('location'), 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja');
  const noUa = await worker.fetch(req('/app'), env, ctx);
  assert.equal(noUa.status, 302);
  assert.equal(noUa.headers.get('location'), 'https://mietore.site/download');
});

test('/app はクエリ付きでも app.ts（302）', async () => {
  const { env, assets } = makeEnv();
  const res = await worker.fetch(req('/app?src=header', { headers: { 'user-agent': UA_ANDROID } }), env, ctx);
  assert.equal(res.status, 302);
  assert.equal(assets.length, 0);
});

test('/mm/track は OPTIONS・GET・HEAD で 204・INSERT なし', async () => {
  for (const method of ['OPTIONS', 'GET', 'HEAD']) {
    const { env, db, assets } = makeEnv();
    const res = await worker.fetch(req('/mm/track', { method }), env, ctx);
    assert.equal(res.status, 204);
    assert.equal(db.length, 0);
    assert.equal(assets.length, 0);
  }
});

test('/mm/track の正しい POST は 204 で INSERT が1回', async () => {
  const { env, db } = makeEnv();
  const res = await worker.fetch(req('/mm/track', jsonPost(EVENT)), env, ctx);
  assert.equal(res.status, 204);
  assert.equal(db.length, 1);
  assert.equal(db[0].kind, 'run');
  assert.match(db[0].sql, /^INSERT INTO events /);
  assert.equal(db[0].binds.length, 9);
  assert.equal(db[0].binds[3], 'page_view');
  assert.equal(db[0].binds[2], '9909local');
});

test('/mm/track の壊れた JSON・空ボディは 204 で INSERT なし', async () => {
  const broken = makeEnv();
  const res1 = await worker.fetch(req('/mm/track', jsonPost('{"ts":')), broken.env, ctx);
  assert.equal(res1.status, 204);
  assert.equal(broken.db.length, 0);

  const empty = makeEnv();
  const res2 = await worker.fetch(req('/mm/track', { method: 'POST' }), empty.env, ctx);
  assert.equal(res2.status, 204);
  assert.equal(empty.db.length, 0);
});

test('/mm/stats の GET はキーなしで 403、合うキーで 200', async () => {
  const no = makeEnv({ statsKey: 'test-key' });
  const res403 = await worker.fetch(req('/mm/stats'), no.env, ctx);
  assert.equal(res403.status, 403);
  assert.equal(await res403.text(), 'Forbidden');

  const ok = makeEnv({ statsKey: 'test-key' });
  const res200 = await worker.fetch(req('/mm/stats?key=test-key'), ok.env, ctx);
  assert.equal(res200.status, 200);
  assert.equal(res200.headers.get('content-type'), 'text/html; charset=UTF-8');
  assert.equal(ok.db.length, 1);
  assert.equal(ok.db[0].kind, 'all');

  const unset = makeEnv();
  const res = await worker.fetch(req('/mm/stats?key=test-key'), unset.env, ctx);
  assert.equal(res.status, 403); // STATS_KEY 未設定なら関数側で 403
});

test('/mm/stats の GET 以外は ASSETS に回る（Pages の HEAD と同じ静的の 404）', async () => {
  for (const method of ['HEAD', 'POST']) {
    const { env, assets, db } = makeEnv({ statsKey: 'test-key' });
    const res = await worker.fetch(req('/mm/stats', { method }), env, ctx);
    assert.equal(res.status, ASSETS_STATUS);
    assert.equal(assets.length, 1);
    assert.equal(db.length, 0);
  }
});

test('完全一致しないパスは ASSETS に回る', async () => {
  for (const path of ['/mm/track/', '/app/', '/mm/statsx', '/', '/banner/mtr-exit.js', '/no-such-page']) {
    const { env, assets, db } = makeEnv();
    const res = await worker.fetch(req(path), env, ctx);
    assert.equal(res.status, ASSETS_STATUS, path);
    assert.equal(assets.length, 1);
    assert.equal(assets[0].url, 'https://mietore.site' + path);
    assert.equal(db.length, 0);
  }
});

test('関数へ渡す context: next() が ASSETS.fetch を呼び、functionPath・params・data が入る', async () => {
  const { env, assets } = makeEnv();
  const request = req('/app');
  let waited = 0;
  const context = pagesContextFor(request, env, { waitUntil: () => { waited += 1; }, passThroughOnException() {} }, '/app');
  assert.equal(context.functionPath, '/app');
  assert.deepEqual(context.params, {});
  assert.deepEqual(context.data, {});
  const res = await context.next();
  assert.equal(res.status, ASSETS_STATUS);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].url, 'https://mietore.site/app');
  context.waitUntil(Promise.resolve());
  assert.equal(waited, 1);
});
