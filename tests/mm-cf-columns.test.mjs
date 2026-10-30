import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// 記録に機種・回線会社・地域の 8 列を足す（TASK-I16-20261028-001）。
// D1 に列がまだ無い（人が ALTER を流す前）ときも、記録・書き出しが今どおり動くことを確かめる。
// functions/ の import は拡張子なしなので、worker-routing.test.mjs と同じく esbuild でまとめてから読む。
const dir = await mkdtemp(join(tmpdir(), 'mietore-mm-cf-'));
await esbuild.build({
  entryPoints: [
    new URL('../functions/mm/track.ts', import.meta.url).pathname,
    new URL('../functions/mm/stats.ts', import.meta.url).pathname,
  ],
  bundle: true, format: 'esm', platform: 'browser', target: 'esnext', outdir: dir,
});
const { onRequest: track } = await import(pathToFileURL(join(dir, 'track.js')).href);
const { onRequestGet: stats } = await import(pathToFileURL(join(dir, 'stats.js')).href);

const COLS_9 = ['received_at', 'ts', 'sid', 'event', 'param', 'url', 'os', 'v', 'ua_family'];
const COLS_8 = ['ua', 'asn', 'as_org', 'region', 'city', 'postal', 'model', 'os_version'];
const EVENT = { ts: '2026-10-28T12:00:00+09:00', sid: '12345678', event: 'banner_view', param: 'back',
  url: 'https://lp.example.com/', os: 'Android', v: 'banner-20261026-D', ua_family: 'tiktok' };
// テスト用の作り値（実在の値ではない）
const CF = { asn: 64512, asOrganization: 'Test Carrier', region: 'Test Region', city: 'Test City', postalCode: '000-0000', country: 'ZZ' };
const UA = 'Mozilla/5.0 (Linux; Android 10; K) TestUA';

// D1 の作り物。hasNewCols=false は ALTER 前の本番と同じく、8 列を含む SQL を実行時（run/all）に失敗させる。
// hasCountry=false は 10/30 の ALTER 前（8 列はあり country が無い）と同じく、country を含む SQL を失敗させる
function makeDb({ hasNewCols = true, hasCountry = hasNewCols, rows = [], failAll = false } = {}) {
  const calls = [];
  const usesNew = (sql) => (!hasNewCols && COLS_8.some((c) => new RegExp(`\\b${c}\\b`).test(sql)))
    || (!hasCountry && /\bcountry\b/.test(sql));
  const db = {
    prepare: (sql) => ({
      bind: (...binds) => ({
        run: async () => {
          calls.push({ kind: 'run', sql, binds });
          if (failAll || usesNew(sql)) throw new Error('D1_ERROR: table events has no column named ua');
          return { success: true };
        },
        all: async () => {
          calls.push({ kind: 'all', sql, binds });
          if (usesNew(sql)) throw new Error('D1_ERROR: no such column: ua');
          const cols = sql.slice('SELECT '.length, sql.indexOf(' FROM')).split(', ');
          return { results: rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))) };
        },
      }),
    }),
  };
  return { db, calls };
}

function post(payload, { cf, ua = UA } = {}) {
  const body = JSON.stringify(payload);
  const req = new Request('https://mietore.site/mm/track', { method: 'POST', body,
    headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(body)), ...(ua ? { 'user-agent': ua } : {}) } });
  if (cf) Object.defineProperty(req, 'cf', { value: cf });
  return req;
}
const runTrack = (request, db) => track({ request, env: { DB: db } });

test('track: 列ありの D1 には 18 列で 1 回だけ入れる（cf・UA・機種・国が入る）', async () => {
  const { db, calls } = makeDb();
  const res = await runTrack(post({ ...EVENT, md: 'TEST-MODEL', pv: '14.0.0' }, { cf: CF }), db);
  assert.equal(res.status, 204);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ua_family, ua, asn, as_org, region, city, postal, model, os_version, country\)/);
  const b = calls[0].binds;
  assert.equal(b.length, 18);
  assert.deepEqual(b.slice(1, 9), [EVENT.ts, EVENT.sid, EVENT.event, EVENT.param, EVENT.url, EVENT.os, EVENT.v, EVENT.ua_family]);
  assert.deepEqual(b.slice(9), [UA, 64512, 'Test Carrier', 'Test Region', 'Test City', '000-0000', 'TEST-MODEL', '14.0.0', 'ZZ']);
});

test('track: country の列が無い D1（10/30 の ALTER 前）では今の 17 列で入れ直し、記録を落とさない', async () => {
  const { db, calls } = makeDb({ hasCountry: false });
  const res = await runTrack(post({ ...EVENT, md: 'TEST-MODEL', pv: '14.0.0' }, { cf: CF }), db);
  assert.equal(res.status, 204);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /, country\)/);
  assert.equal(calls[1].sql, 'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family, ua, asn, as_org, region, city, postal, model, os_version)'
    + ' VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)');
  assert.deepEqual(calls[1].binds.slice(1), calls[0].binds.slice(1, 17));
  assert.equal(calls[1].binds.length, 17);
});

test('track: cf の国が無い・空なら country は null。XX（不明）・T1（Tor）はそのまま残す', async () => {
  for (const [cf, want] of [[undefined, null], [{ ...CF, country: '' }, null], [{ ...CF, country: 'XX' }, 'XX'], [{ ...CF, country: 'T1' }, 'T1'], [{ ...CF, country: 'JP' }, 'JP']]) {
    const { db, calls } = makeDb();
    await runTrack(post(EVENT, { cf }), db);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].binds[17], want);
  }
});

test('track: cf が無い（ローカル）・UA も md・pv も無いときは 8 列と国とも null', async () => {
  const { db, calls } = makeDb();
  await runTrack(post(EVENT, { ua: null }), db);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].binds.slice(9), [null, null, null, null, null, null, null, null, null]);
});

test('track: md は 40 文字・pv は 20 文字・UA は 400 文字で切る。先頭の = などは今の決まりで守る', async () => {
  const { db, calls } = makeDb();
  await runTrack(post({ ...EVENT, md: 'M'.repeat(60), pv: '1'.repeat(30) }, { cf: { ...CF, city: '=cmd' }, ua: 'U'.repeat(500) }), db);
  const b = calls[0].binds;
  assert.equal(b[9].length, 400);
  assert.equal(b[13], "'=cmd");
  assert.equal(b[15].length, 40);
  assert.equal(b[16].length, 20);
});

test('track: 列が無い D1（ALTER 前）では 18 列 → 17 列 → 9 列で入れ直し、記録を落とさない', async () => {
  const { db, calls } = makeDb({ hasNewCols: false });
  const res = await runTrack(post({ ...EVENT, md: 'TEST-MODEL' }, { cf: CF }), db);
  assert.equal(res.status, 204);
  assert.equal(calls.length, 3);
  calls.splice(1, 1); // 2 回目（17 列）は上のテストで見る
  assert.equal(calls[1].sql, 'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)');
  assert.equal(calls[1].binds.length, 9);
  assert.deepEqual(calls[1].binds.slice(1), [EVENT.ts, EVENT.sid, EVENT.event, EVENT.param, EVENT.url, EVENT.os, EVENT.v, EVENT.ua_family]);
});

test('track: 9 列でも失敗したら諦めて 204（今と同じ）', async () => {
  const { db, calls } = makeDb({ failAll: true });
  const res = await runTrack(post(EVENT, { cf: CF }), db);
  assert.equal(res.status, 204);
  assert.equal(calls.length, 3);
});

test('track: はじく条件は今と同じ（未知の event・GET・空・4096 超は D1 に触らない）', async () => {
  for (const req of [
    post({ ...EVENT, event: 'hack', md: 'X' }, { cf: CF }),
    new Request('https://mietore.site/mm/track'),
    new Request('https://mietore.site/mm/track', { method: 'POST', body: 'x'.repeat(5000), headers: { 'content-length': '5000' } }),
    new Request('https://mietore.site/mm/track', { method: 'POST', body: 'not json', headers: { 'content-length': '8' } }),
  ]) {
    const { db, calls } = makeDb();
    const res = await runTrack(req, db);
    assert.equal(res.status, 204);
    assert.equal(calls.length, 0);
  }
});

const ROW = { received_at: '2026-10-28T12:00:01+09:00', ts: EVENT.ts, sid: EVENT.sid, event: EVENT.event, param: EVENT.param,
  url: EVENT.url, os: EVENT.os, v: EVENT.v, ua_family: EVENT.ua_family,
  ua: UA, asn: 64512, as_org: 'Test Carrier', region: 'Test Region', city: 'Test City', postal: '000-0000', model: 'TEST-MODEL', os_version: '14.0.0',
  country: 'ZZ' };
const runStats = (path, db) => stats({ request: new Request('https://mietore.site' + path), env: { DB: db, STATS_KEY: 'k' } });

test('stats ?export=csv: 列ありなら今の 17 列の後ろに country を足して 18 列で返す', async () => {
  const { db } = makeDb({ rows: [ROW] });
  const text = await (await runStats('/mm/stats?key=k&export=csv', db)).text();
  const [head, line] = text.split('\n');
  assert.equal(head, [...COLS_9, ...COLS_8, 'country'].join(','));
  assert.equal(line, [...COLS_9, ...COLS_8, 'country'].map((c) => `"${ROW[c]}"`).join(','));
});

test('stats ?export=csv: country の列が無い D1（10/30 の ALTER 前）は今と同じ 17 列・同じ中身', async () => {
  const { db, calls } = makeDb({ hasCountry: false, rows: [ROW] });
  const text = await (await runStats('/mm/stats?key=k&export=csv&month=202610', db)).text();
  assert.equal(text, [...COLS_9, ...COLS_8].join(',') + '\n'
    + [...COLS_9, ...COLS_8].map((c) => `"${ROW[c]}"`).join(',') + '\n');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].sql, `SELECT ${[...COLS_9, ...COLS_8].join(', ')} FROM events WHERE received_at LIKE ?1 ORDER BY received_at`);
  assert.deepEqual(calls[1].binds, ['2026-10%']);
});

test('stats ?export=csv: 列が無い D1（ALTER 前）は今と同じ 9 列・同じ中身', async () => {
  const { db, calls } = makeDb({ hasNewCols: false, rows: [ROW] });
  const text = await (await runStats('/mm/stats?key=k&export=csv&month=202610', db)).text();
  assert.equal(text, 'received_at,ts,sid,event,param,url,os,v,ua_family\n'
    + COLS_9.map((c) => `"${ROW[c]}"`).join(',') + '\n');
  // 3 回目（9 列）の SQL は今までと同じ形で、month の絞り込みも残る
  assert.equal(calls.length, 3);
  assert.equal(calls[2].sql, 'SELECT received_at, ts, sid, event, param, url, os, v, ua_family FROM events WHERE received_at LIKE ?1 ORDER BY received_at');
  assert.deepEqual(calls[2].binds, ['2026-10%']);
});

test('stats: 表（HTML）も列の有無によらず 200 で出る', async () => {
  for (const opts of [{}, { hasCountry: false }, { hasNewCols: false }]) {
    const { db } = makeDb({ ...opts, rows: [ROW] });
    const res = await runStats('/mm/stats?key=k', db);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /1件/);
  }
});
