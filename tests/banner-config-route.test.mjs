import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

// ---------------------------------------------------------------------------
// public/banner/mtr-exit.js を vm で読んで動かす（TASK-I16-20261007-001）。
// このファイルに足した理由: mtr-exit.js を実行している既存のテストは無く（rg で確認）、
// grep で当たった3件のうち、設定（/banner/config）から案が決まるまでを扱う本ファイルが
// いちばん近い。新しいテストファイルは変更許可パスの外なので作らない。
// MTR_PATH で別の版を指すと、同じテストを main の版に当てて比べられる。
// ---------------------------------------------------------------------------
const A7 = 'banner-20261008-A7';
const MTR_SRC = readFileSync(process.env.MTR_PATH
  ? process.env.MTR_PATH
  : new URL('../public/banner/mtr-exit.js', import.meta.url), 'utf8');

// mtr-exit.js が触る分だけの DOM。innerHTML は文字列のまま持ち、querySelector は
// class="…" の有無で引く（描いた HTML をそのまま確かめたいので、解析はしない）
function makeDom({ sid = '12345678', config = { stopped: false, active: [] }, deferImages = false } = {}) {
  const store = new Map();
  if (sid) store.set('mtrb_sid', sid);
  const sent = [];
  const listeners = new Map();
  const images = [];
  const hooks = {};
  let backs = 0;

  function node(tag) {
    const el = {
      tag, id: '', className: '', textContent: '', innerHTML: '', children: [], shadow: null, removed: false,
      attachShadow() { el.shadow = node('#shadow'); return el.shadow; },
      appendChild(c) { el.children.push(c); return c; },
      remove() { el.removed = true; },
      addEventListener() {},
      querySelector(sel) {
        const want = 'class="' + sel.slice(1) + '"';
        if (typeof el.innerHTML === 'string' && el.innerHTML.includes(want)) {
          const key = sel + '@' + el.tag;
          if (!hooks[key]) hooks[key] = { on: {}, addEventListener(ev, fn) { this.on[ev] = fn; } };
          return hooks[key];
        }
        for (const c of el.children) { const r = c.querySelector(sel); if (r) return r; }
        return null;
      },
    };
    return el;
  }

  const body = node('body');
  const ctx = {
    console: { log() {} },
    URL, URLSearchParams, Promise, JSON, Math, Date, Object, String, Blob,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    location: { search: '', href: 'https://lp.example.com/' },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { userAgent: 'Mozilla/5.0 (Android 14; Mobile) Chrome/140', maxTouchPoints: 5,
      userActivation: { hasBeenActive: true }, sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; } },
    history: {
      state: null,
      pushState(s) { this.state = s; },
      replaceState(s) { this.state = s; },
      back() { backs += 1; },
    },
    document: {
      currentScript: { src: 'https://mietore.site/banner/mtr-exit.js' },
      hidden: false,
      body,
      createElement: (t) => node(t),
      addEventListener() {},
    },
    Image: function FakeImage() {
      const im = { onload: null, onerror: null, decode: () => Promise.resolve() };
      Object.defineProperty(im, 'src', {
        set(v) { im._src = v; images.push(im); if (!deferImages) ready.push(im); },
        get() { return im._src; },
      });
      return im;
    },
    fetch: async () => (config === null
      ? { status: 503, json: async () => ({}) }
      : { status: 200, json: async () => config }),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) {
      const l = listeners.get(type) || [];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
  };
  const ready = [];
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const dom = {
    ctx, sent, images, store,
    get backs() { return backs; },
    fire(type, ev = {}) { for (const fn of (listeners.get(type) || []).slice()) fn(ev); },
    // 層の読み込みを終わらせる。fail に入れた名前だけ失敗させる
    settle(fail = []) {
      for (const im of images.splice(0)) {
        if (fail.some((f) => String(im.src).includes(f))) { if (im.onerror) im.onerror(); }
        else if (im.onload) im.onload();
      }
      return new Promise((r) => setImmediate(r));
    },
    // 1回タップしてから戻る（arm → 元の履歴へ戻る popstate）
    async leave() {
      dom.fire('click');
      ctx.history.state = { mtrb: 0 };
      dom.fire('popstate');
      await new Promise((r) => setImmediate(r));
    },
    // 描かれたバナーの HTML（出ていなければ null）
    html() {
      const h = body.children.find((c) => c.id === 'mtrb-root');
      if (!h) return null;
      const root = h.shadow || h;
      const bg = root.children.find((c) => c.className === 'bg');
      return bg ? bg.innerHTML : null;
    },
    css() {
      const h = body.children.find((c) => c.id === 'mtrb-root');
      if (!h) return null;
      const root = h.shadow || h;
      const st = root.children.find((c) => c.tag === 'style');
      return st ? st.textContent : null;
    },
    events() { return sent.map((s) => JSON.parse(s.blob.text)); },
  };
  // sendBeacon の Blob は中身を読めるようにする
  ctx.navigator.sendBeacon = (url, blob) => { sent.push({ url, blob: { text: blob.__t } }); return true; };
  ctx.Blob = function FakeBlob(parts) { return { __t: parts.join('') }; };

  vm.runInContext(MTR_SRC, ctx);
  return dom;
}

async function started(dom) { await new Promise((r) => setImmediate(r)); return dom; }

test('A7 は active に入っているときだけ、層つきで出る', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [A7] } }));
  await dom.settle();                       // 先読みが終わる
  await dom.leave();
  const html = dom.html();
  assert.ok(html, 'A7 が出ていない');
  assert.match(html, /<div class="pop lyr">/);
  for (const l of ['base', 'head', 'ring', 'stamps', 'coin', 'picture']) {
    assert.ok(html.includes(`<img class="${l}" src="https://mietore.site/banner/img/banner_A7_20261008_${l}.webp" alt="">`),
      `層 ${l} が無い`);
  }
  assert.equal((html.match(/<img /g) || []).length, 6);
  const ev = dom.events();
  assert.deepEqual(ev.map((e) => e.event), ['banner_view']);
  assert.equal(ev[0].v, A7);
});

test('A7 の層は CSS だけで動かす（keyframes と「動きを減らす」設定が入っている）', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [A7] } }));
  await dom.settle();
  await dom.leave();
  const css = dom.css();
  // 試作（index_2.html）と同じ keyframes・同じ時刻
  assert.ok(css.includes('@keyframes ring{0%{top:29.427%}33.333%{top:45.260%}66.667%{top:61.094%}100%{top:61.094%}}'));
  assert.ok(css.includes('@keyframes stamp{0%{clip-path:inset(0 100% 0 0);animation-timing-function:steps(7,end)}25%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 0 0 0)}}'));
  assert.ok(css.includes('@keyframes hopC{0%,33.333%{transform:none}38%{transform:translateY(-8%) scale(1.12)}44%,100%{transform:none}}'));
  assert.ok(css.includes('@keyframes hopB{0%,66.667%{transform:none}71%{transform:translateY(-6%) scale(1.1)}77%,100%{transform:none}}'));
  assert.ok(css.includes('.pop.lyr .ring{animation:ring 6s steps(1,end) infinite}'));
  // .tap img の display:block（0,3,1）に勝つ必要があるので img.ring で書く
  assert.ok(css.includes('@media (prefers-reduced-motion:reduce){.pop.lyr .tap img.ring{display:none}'));
  assert.ok(css.includes('.pop.lyr .stamps,.pop.lyr .coin,.pop.lyr .picture{animation:none;clip-path:none}}'));
  // 層は .pop.lyr の下だけ。既存5本の .tap img の決まりは残っている
  assert.ok(css.includes('.tap img{display:block;width:100%;height:100%;object-fit:contain}'));
  assert.ok(css.includes('.pop.lyr .x{z-index:2}'), '層が × を覆わないための指定が無い');
});

test('A7 が active に無ければ、層を読まず・出ない（B だけのとき）', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [B] } }));
  assert.equal(dom.images.length, 0, 'B のときに A7 の層を読んでいる');
  await dom.leave();
  const html = dom.html();
  assert.ok(html.includes('<img src="https://mietore.site/banner/img/banner_BC.webp"'));
  assert.ok(!html.includes('lyr'));
  assert.equal(dom.events()[0].v, B);
});

test('既存5本の描き方は変わっていない（1枚の img・pop に lyr が付かない）', async () => {
  const want = {
    'banner-20260928-A1': 'banner_A1.webp',
    'banner-20260928-A2': 'banner_A2.webp',
    'banner-20260928-A3': 'banner_A3.webp',
    'banner-20260928-B': 'banner_BC.webp',
    'banner-20260928-C': 'banner_BC.webp',
  };
  for (const [v, img] of Object.entries(want)) {
    const dom = await started(makeDom({ config: { stopped: false, active: [v] } }));
    await dom.leave();
    const html = dom.html();
    assert.ok(html.startsWith('<div class="pop">'), v);
    assert.equal((html.match(/<img /g) || []).length, 1, v);
    assert.ok(html.includes('/banner/img/' + img), v);
    assert.equal(dom.images.length, 0, v + ' で層を読んでいる');
  }
});

test('5本が active のときの割り当ては sid で決まり、A7 を足しても変わらない', async () => {
  // main の版（b4c1a15d…）で同じ sid を流して得た並び。A7 は CREATIVES の末尾なので
  // 既存5本の pool の順も、hash の余りも変わらない
  const expected = {
    '10000000': 'A1', '10000001': 'A2', '10000002': 'A3', '10000003': 'B', '10000004': 'C',
    '20000000': 'A2', '30000000': 'A3', '40000000': 'B', '55555555': 'C', '99999999': 'A2',
  };
  const active = ['banner-20260928-A1', 'banner-20260928-A2', 'banner-20260928-A3', B, C];
  for (const [sid, id] of Object.entries(expected)) {
    const dom = await started(makeDom({ sid, config: { stopped: false, active } }));
    assert.equal(dom.store.get('mtrb_creative'), id, 'sid ' + sid);
  }
});

test('A7 の層の読み込みに失敗したら、出さず banner_view も送らない', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [A7] } }));
  await dom.settle(['_coin.webp']);
  await dom.leave();
  assert.equal(dom.html(), null, '読み込みに失敗したのに出ている');
  assert.deepEqual(dom.events(), [], '出ていないのに送っている');
  assert.ok(dom.backs >= 1, '出せないときは戻る操作を通すこと');
  // 出せずに終わった筋書きは、今までどおり exit_no_popup として1回だけ残る
  dom.fire('pagehide');
  assert.deepEqual(dom.events().map((e) => e.event), ['exit_no_popup']);
  assert.equal(dom.events()[0].param, 'armed_no_back');
});

test('層の読み込み中に離脱したら、読み終わった時点で出す', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [A7] }, deferImages: true }));
  await dom.leave();
  assert.equal(dom.html(), null, '読み終える前に出ている');
  assert.deepEqual(dom.events(), [], '読み終える前に送っている');
  await dom.settle();
  assert.ok(dom.html(), '読み終わっても出ていない');
  assert.deepEqual(dom.events().map((e) => e.event), ['banner_view']);
});

test('読み込み中に離脱して失敗した場合は、出さず送らず、2回目の戻るは通す', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [A7] }, deferImages: true }));
  await dom.leave();
  await dom.settle(['_picture.webp']);
  assert.equal(dom.html(), null);
  assert.deepEqual(dom.events(), []);
  dom.ctx.history.state = { mtrb: 0 };
  dom.fire('popstate');
  assert.ok(dom.backs >= 1, '2回目の戻るが通っていない');
});

test('全停止・設定が読めない・active が空のときは、A7 の層も読まない', async () => {
  for (const config of [{ stopped: true, active: [A7] }, null, { stopped: false, active: [] }]) {
    const dom = await started(makeDom({ config }));
    assert.equal(dom.images.length, 0);
    await dom.leave();
    assert.equal(dom.html(), null);
    assert.deepEqual(dom.events(), []);
  }
});

test('同じ sid で2回目の表示はしない（A7 の層も読まない）', async () => {
  const dom = await started(makeDom({ config: { stopped: false, active: [A7] } }));
  dom.store.set('mtrb_shown', '1');
  const again = await started(makeDom({ config: { stopped: false, active: [A7] } }));
  again.store.set('mtrb_shown', '1');
  const third = makeDom({ config: { stopped: false, active: [A7] } });
  third.store.set('mtrb_shown', '1');
  await started(third);
  assert.equal(third.images.length, 0, '表示済みの sid で層を読んでいる');
  assert.ok(dom.images.length > 0 && again.images.length > 0);
});

test('mtr-exit.js に動きのための JS タイマーは無い（CSS だけで動かす）', () => {
  // 離脱の仕掛け（arm・CloseWatcher・設定の時間切れ）以外に setTimeout は増やさない
  assert.equal((MTR_SRC.match(/setInterval/g) || []).length, 0);
  assert.equal((MTR_SRC.match(/requestAnimationFrame/g) || []).length, 0);
  const timeouts = (MTR_SRC.match(/setTimeout\(/g) || []).length;
  assert.equal(timeouts, 5, 'setTimeout の数が main の版（5か所）から変わった');
});
