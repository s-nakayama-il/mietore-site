import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// tests/worker-routing.test.mjs と同じく、esbuild で1ファイルにまとめてから読む
const dir = await mkdtemp(join(tmpdir(), 'mietore-banner-pv-'));
await esbuild.build({
  entryPoints: [new URL('../src/worker.ts', import.meta.url).pathname, new URL('../src/lib/banner/pv.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'browser', target: 'esnext', outdir: dir,
});
const { default: worker } = await import(pathToFileURL(join(dir, 'worker.js')).href);
const { toPvKey, PV_SQL } = await import(pathToFileURL(join(dir, 'lib/banner/pv.js')).href);

const ctx = { waitUntil() {}, passThroughOnException() {} };
const B = 'banner-20260928-B';
const GOOGLE = 'https://dreamyrainbowgarden.com/ab/platinumeye_pm_05?gad_source=5&gad_campaignid=24344089641&gclid=abc';
const TIKTOK = 'https://dreamyrainbowgarden.com/ab/platinumeye_tik_03?utm_source=tiktok&utm_campaign=1005_CC&ttclid=x';
// 2026-10-15T20:30Z = JST 10/16 05:30
const NOW = Date.UTC(2026, 9, 15, 20, 30);

test('toPvKey: JST の日・時、LP はクエリなし、広告とキャンペーンは URL の印から', () => {
  assert.deepEqual(toPvKey({ url: GOOGLE, os: 'iOS', ua_family: 'browser', v: B, seen: 0 }, NOW), {
    day: '2026-10-16', hour: 5, lp: 'dreamyrainbowgarden.com/ab/platinumeye_pm_05',
    ad: 'google', campaign: '24344089641', os: 'iOS', ua_family: 'browser', v: B, seen: 0,
  });
  const t = toPvKey({ url: TIKTOK, os: 'Android', ua_family: 'tiktok', v: B, seen: 1 }, NOW);
  assert.equal(t.ad, 'tiktok');
  assert.equal(t.campaign, '1005_CC');
  assert.equal(t.seen, 1);
  assert.equal(toPvKey({ url: 'https://lp.example.com/a?fbclid=1', v: B }, NOW).ad, 'meta');
  assert.equal(toPvKey({ url: 'https://lp.example.com/a', v: B }, NOW).ad, 'none');
});

test('toPvKey: 決まった値以外は丸める・読めない URL は数えない', () => {
  const k = toPvKey({ url: GOOGLE, os: 'Windows', ua_family: 'x', v: "x'; DROP", seen: 'yes' }, NOW);
  assert.equal(k.os, 'other');
  assert.equal(k.ua_family, 'browser');
  assert.equal(k.v, 'other');
  assert.equal(k.seen, 0);
  for (const p of [null, [], {}, { url: 'not a url' }, { url: 'javascript:alert(1)' }, { url: 1 }]) {
    assert.equal(toPvKey(p, NOW), null, JSON.stringify(p));
  }
});

function makeEnv({ fail = false, rows = [] } = {}) {
  const calls = [];
  const env = {
    STATS_KEY: 'k',
    ASSETS: { fetch: async () => new Response('assets', { status: 599 }) },
    DB: {
      prepare(sql) {
        const stmt = {
          bind(...b) { stmt.binds = b; return stmt; },
          async run() { calls.push({ sql, binds: stmt.binds }); if (fail) throw new Error('D1_ERROR'); return { success: true }; },
          async all() { calls.push({ sql, binds: stmt.binds }); return { results: rows }; },
        };
        return stmt;
      },
    },
  };
  return { env, calls };
}
const post = (body) => new Request('https://mietore.site/banner/pv', {
  method: 'POST', body, headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(body)) },
});

test('POST /banner/pv は件数の +1 を1回だけ書いて 204', async () => {
  const { env, calls } = makeEnv();
  const res = await worker.fetch(post(JSON.stringify({ url: GOOGLE, os: 'iOS', ua_family: 'browser', v: B, seen: 0 })), env, ctx);
  assert.equal(res.status, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, PV_SQL);
  assert.match(calls[0].sql, /ON CONFLICT .* DO UPDATE SET n = n \+ 1/);
  assert.equal(calls[0].binds[2], 'dreamyrainbowgarden.com/ab/platinumeye_pm_05');
});

test('/banner/pv: GET・壊れた本文・D1 の失敗でも 204 で、書かないものは書かない', async () => {
  const a = makeEnv();
  assert.equal((await worker.fetch(new Request('https://mietore.site/banner/pv'), a.env, ctx)).status, 204);
  assert.equal((await worker.fetch(post('{broken'), a.env, ctx)).status, 204);
  assert.equal(a.calls.length, 0);
  const b = makeEnv({ fail: true });
  assert.equal((await worker.fetch(post(JSON.stringify({ url: GOOGLE, v: B })), b.env, ctx)).status, 204);
});

test('GET /mm/stats?export=pv は banner_pv の CSV（key が要る・events は読まない）', async () => {
  const { env, calls } = makeEnv({ rows: [{ day: '2026-10-16', hour: 5, lp: 'a/b', ad: 'google', campaign: '1', os: 'iOS', ua_family: 'browser', v: B, seen: 0, n: 3 }] });
  const no = await worker.fetch(new Request('https://mietore.site/mm/stats?export=pv'), env, ctx);
  assert.equal(no.status, 403);
  const res = await worker.fetch(new Request('https://mietore.site/mm/stats?key=k&export=pv'), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'day,hour,lp,ad,campaign,os,ua_family,v,seen,n\n"2026-10-16","5","a/b","google","1","iOS","browser","banner-20260928-B","0","3"\n');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM banner_pv/);
});
