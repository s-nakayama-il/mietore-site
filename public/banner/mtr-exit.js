/* mtr-exit.js — 離脱バナー配信（A1/A2/A3/B/C の5本）
 * 代理店の LP には次の1行だけを入れてもらう:
 *   <script src="https://mietore.site/banner/mtr-exit.js" defer></script>
 *
 * 流用元: public/mm/b/mietore-popup_mailmag.js（v3d-2.4.0-mailmag）の
 *   - 離脱トリガー MtrExitTrigger（CloseWatcher 優先・履歴方式フォールバック）
 *   - 送信関数（sendBeacon を text/plain で送り、積めなければ no-cors の fetch）
 * 持ち込まないもの: 常時即表示のパッチ（preview）・ゲーム・会話アニメ・メルマガ用の画面、
 *   7日間の localStorage 抑制、page_view / lp_click / exit_no_popup / scroll_up_signal の送信。
 * 保存キーとグローバルは既存のポップアップ（mtr_*）と混ざらないよう mtrb_* にしている。
 */
(function () {
  'use strict';
  if (window.__mtrbInit) return;
  window.__mtrbInit = true;

  /* 自分自身の src から origin を作る。本番は https://mietore.site、
     プレビューはプレビューの origin、手元は wrangler pages dev の origin になる。
     currentScript は読み込み時にしか取れないので、ここで確定させる。 */
  var SELF = document.currentScript;
  var ORIGIN = (function () {
    try { return new URL(SELF.src, location.href).origin; } catch (e) { return 'https://mietore.site'; }
  })();

  var CFG = {
    TRACK_URL: ORIGIN + '/mm/track',
    IMG_BASE: ORIGIN + '/banner/img',
    APP_URL: ORIGIN + '/app',
    CHECK_B: ORIGIN + '/banner/check/b.html',
    CHECK_C: ORIGIN + '/banner/check/c.html'
  };

  /* 配信する5本。v が計測の版の識別子になる */
  var CREATIVES = [
    { id: 'A1', v: 'banner-20260928-A1', img: 'banner_A1.webp', dest: 'app',     alt: '1日3分の目のトレーニング' },
    { id: 'A2', v: 'banner-20260928-A2', img: 'banner_A2.webp', dest: 'app',     alt: '運転中に標識がぼやける方へ' },
    { id: 'A3', v: 'banner-20260928-A3', img: 'banner_A3.webp', dest: 'app',     alt: 'スマホの字を離して読む方へ' },
    { id: 'B',  v: 'banner-20260928-B',  img: 'banner_BC.webp', dest: 'check_b', alt: '点の中の4けたの数字、わかりますか' },
    { id: 'C',  v: 'banner-20260928-C',  img: 'banner_BC.webp', dest: 'check_c', alt: '点の中の4けたの数字、わかりますか' }
  ];

  var QS = (function () {
    var p; try { p = new URLSearchParams(location.search); } catch (e) { p = null; }
    return {
      debug: !!(p && p.get('mtr_debug') === '1'),
      cw: (p && p.get('mtr_cw')) || null,
      reset: !!(p && p.get('mtr_reset') === '1')
    };
  })();

  /* ---------- sid と割り当て ---------- */
  function sid() {
    var s = '';
    try { s = sessionStorage.getItem('mtrb_sid') || ''; } catch (e) {}
    if (!s) {
      s = String(Math.floor(Math.random() * 1e8));
      while (s.length < 8) s = '0' + s;
      try { sessionStorage.setItem('mtrb_sid', s); } catch (e) {}
    }
    return s;
  }

  /* 5本から均等に1本。sid から決めるので、D1 の行から後で割り当てを確かめられる */
  function creative() {
    var saved = null;
    try { saved = sessionStorage.getItem('mtrb_creative'); } catch (e) {}
    if (saved) {
      for (var i = 0; i < CREATIVES.length; i++) if (CREATIVES[i].id === saved) return CREATIVES[i];
    }
    var s = sid(), h = 0;
    for (var j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j)) % 100000;
    var c = CREATIVES[h % CREATIVES.length];
    try { sessionStorage.setItem('mtrb_creative', c.id); } catch (e) {}
    return c;
  }

  var CRE = creative();

  /* ---------- 計測 ---------- */
  function osName() {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    return 'PC';
  }
  function uaFamily() {
    var ua = navigator.userAgent || '';
    if (/musical_ly|trill|Bytedance|TTWebView/.test(ua)) return 'tiktok';
    if (/ Line\//.test(ua)) return 'line';
    if (/Instagram/.test(ua)) return 'instagram';
    if (/FBAN|FBAV/.test(ua)) return 'facebook';
    if (/; wv\)/.test(ua)) return 'wv';
    return 'browser';
  }
  function track(event, param) {
    var payload = {
      ts: new Date().toISOString(),
      sid: sid(),
      event: event,
      param: String(param == null ? '' : param).slice(0, 64),
      url: location.href,
      os: osName(),
      v: CRE.v,
      ua_family: uaFamily()
    };
    if (QS.debug) { try { console.log('[mtrb]', payload); } catch (e) {} return; }
    var body = JSON.stringify(payload);
    /* sendBeacon はキューに積めなかったとき false を返す。その場合は no-cors の fetch で送り直す
       （流用元 mietore-popup_mailmag.js 121〜157行と同じ作り） */
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(CFG.TRACK_URL, new Blob([body], { type: 'text/plain' })) === true) return;
    } catch (e) {}
    try {
      var p = fetch(CFG.TRACK_URL, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  /* ---------- 表示（Shadow DOM。LP の CSS と混ざらない） ---------- */
  var shown = false;
  function seen() {
    if (QS.reset) return false;
    try { return !!sessionStorage.getItem('mtrb_shown'); } catch (e) { return false; }
  }
  function markSeen() { try { sessionStorage.setItem('mtrb_shown', '1'); } catch (e) {} }

  function destUrl() {
    if (CRE.dest === 'check_b' || CRE.dest === 'check_c') {
      /* LP とチェックページは origin が違い sessionStorage を共有できないため、クエリで渡す */
      var base = CRE.dest === 'check_b' ? CFG.CHECK_B : CFG.CHECK_C;
      return base + '?sid=' + encodeURIComponent(sid()) + '&v=' + encodeURIComponent(CRE.v);
    }
    return CFG.APP_URL;
  }

  var CSS = '' +
    ':host{all:initial}' +
    '.bg{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;' +
    'justify-content:center;z-index:2147483000}' +
    '.pop{position:relative;width:min(86vw,calc(80vh * 9 / 16));aspect-ratio:9 / 16;max-height:80vh;' +
    'border-radius:16px;overflow:hidden;box-shadow:0 10px 32px rgba(0,0,0,.4);background:#fff}' +
    '.tap{display:block;width:100%;height:100%;border:0;padding:0;background:none;cursor:pointer}' +
    '.tap img{display:block;width:100%;height:100%;object-fit:contain}' +
    '.x{position:absolute;top:6px;right:6px;width:40px;height:40px;border-radius:50%;border:0;' +
    'background:rgba(0,0,0,.55);color:#fff;font-size:22px;font-weight:800;line-height:1;cursor:pointer}' +
    '.x:focus-visible,.tap:focus-visible{outline:3px solid #f0a500;outline-offset:2px}';

  var host = null;
  function close(how) {
    if (!host) return;
    track('banner_close', how);
    try { host.remove(); } catch (e) {}
    host = null;
  }

  function show(source) {
    if (shown || seen()) return false;
    shown = true;
    markSeen();
    host = document.createElement('div');
    host.id = 'mtrb-root';
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    var root = sr || host;
    var st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
    var bg = document.createElement('div'); bg.className = 'bg';
    bg.innerHTML = '<div class="pop">' +
      '<button class="x" type="button" aria-label="閉じる">×</button>' +
      '<button class="tap" type="button" aria-label="' + CRE.alt + '">' +
      '<img src="' + CFG.IMG_BASE + '/' + CRE.img + '" alt="' + CRE.alt + '"></button></div>';
    root.appendChild(bg);
    document.body.appendChild(host);
    lastSource = source;
    root.querySelector('.x').addEventListener('click', function () { close('x'); });
    root.querySelector('.tap').addEventListener('click', function () {
      track('banner_tap', CRE.dest);
      location.href = destUrl();
    });
    track('banner_view', source);
    return true;
  }

  /* ---------- 離脱検知（流用元 MtrExitTrigger と同じ考え方） ---------- */
  var armed = false, popped = false, cwActive = false;

  function hasActivation() {
    var ua = navigator.userActivation;
    if (!ua) return true;
    return ua.hasBeenActive === true;
  }
  function arm() {
    if (armed) return true;
    if (history.state && history.state.mtrb) { armed = true; return true; }
    armed = true;
    history.pushState({ mtrb: 1 }, '');
    return true;
  }
  function cwSupported() {
    if (QS.cw === 'off') return false;
    return typeof window.CloseWatcher === 'function';
  }
  function setupCloseWatcher() {
    try {
      var w = new CloseWatcher();
      w.onclose = function () { cwActive = false; show('back_cw'); };
      cwActive = true;
      return true;
    } catch (e) { return false; }
  }
  var lastSource = null;
  function onPopState() {
    /* 表示中に戻るが来たら、握り潰さずポップアップを閉じて本来の離脱を続ける
       （流用元 mietore-popup_mailmag.js の onPopState と同じ形）。
       そうしないと、積んだ履歴の分だけ戻るボタンが1回効かない状態になる */
    if (host) {
      close('back');
      if (lastSource === 'back') history.back();
      return;
    }
    if (popped) { history.back(); return; }
    popped = true;
    if (!show('back')) { history.back(); return; }   /* 出せないときは本来の離脱を続行させる */
    history.pushState({ mtrb: 2 }, '');
  }
  function registerHistoryTriggers() {
    /* user activation が付いてからでないと、Chromium が積んだ履歴を読み飛ばす */
    ['touchend', 'pointerup', 'click'].forEach(function (t) {
      window.addEventListener(t, function h() {
        if (arm()) window.removeEventListener(t, h);
      }, { passive: true });
    });
    setTimeout(arm, 3000);
    setTimeout(arm, 0);
  }

  window.addEventListener('popstate', onPopState);
  window.addEventListener('pagehide', function () { if (host) close('leave'); });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { armed = false; popped = false; }
  });

  if (seen()) return;   /* 同じ sid では2回目を出さない */

  if (cwSupported()) {
    setTimeout(function () { if (!setupCloseWatcher()) registerHistoryTriggers(); }, 0);
  } else {
    registerHistoryTriggers();
  }
})();
