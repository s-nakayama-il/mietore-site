/* mtr-exit.js - exit banner delivery (5 creatives: A1/A2/A3/B/C)
 * The agency only pastes this single tag into their LP:
 *   <script src="https://mietore.site/banner/mtr-exit.js" defer></script>
 *
 * Derived from public/mm/b/mietore-popup_mailmag.js (v3d-2.4.0-mailmag):
 *   - exit trigger MtrExitTrigger (CloseWatcher first, history pushState as fallback)
 *   - sender (sendBeacon with text/plain, falling back to a no-cors fetch)
 * Not carried over: the always-show preview patch, the game, the talk animation,
 *   the mailmag screens, the 7-day localStorage suppression, and the
 *   page_view / lp_click / exit_no_popup / scroll_up_signal events.
 * Storage keys and globals use the mtrb_* prefix so they never collide with the
 * existing popup (mtr_*).
 *
 * This file must stay ASCII-only. Japanese text is written as \uXXXX escapes so the
 * same characters render no matter which charset the host LP declares
 * (the script is served as application/javascript with no charset).
 */
(function () {
  'use strict';
  if (window.__mtrbInit) return;
  window.__mtrbInit = true;

  /* Build the origin from this script's own src: https://mietore.site in production,
     the preview origin on a preview deploy, and the wrangler pages dev origin locally.
     document.currentScript is only readable while the script is loading, so capture it here. */
  var SELF = document.currentScript;
  var ORIGIN = (function () {
    try { return new URL(SELF.src, location.href).origin; } catch (e) { return 'https://mietore.site'; }
  })();

  var CFG = {
    TRACK_URL: ORIGIN + '/mm/track',
    IMG_BASE: ORIGIN + '/banner/img',
    APP_URL: ORIGIN + '/app',
    CHECK_B: ORIGIN + '/banner/check/b',       /* no .html: avoids the 308 redirect Pages adds */
    CHECK_C: ORIGIN + '/banner/check/c'        /* no .html: avoids the 308 redirect Pages adds */
  };

  /* The 5 creatives. v is the version identifier recorded with every event. */
  var CREATIVES = [
    { id: 'A1', v: 'banner-20260928-A1', img: 'banner_A1.webp', dest: 'app',     alt: '1\u65e53\u5206\u306e\u76ee\u306e\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0' },
    { id: 'A2', v: 'banner-20260928-A2', img: 'banner_A2.webp', dest: 'app',     alt: '\u904b\u8ee2\u4e2d\u306b\u6a19\u8b58\u304c\u307c\u3084\u3051\u308b\u65b9\u3078' },
    { id: 'A3', v: 'banner-20260928-A3', img: 'banner_A3.webp', dest: 'app',     alt: '\u30b9\u30de\u30db\u306e\u5b57\u3092\u96e2\u3057\u3066\u8aad\u3080\u65b9\u3078' },
    { id: 'B',  v: 'banner-20260928-B',  img: 'banner_BC.webp', dest: 'check_b', alt: '\u70b9\u306e\u4e2d\u306e4\u3051\u305f\u306e\u6570\u5b57\u3001\u308f\u304b\u308a\u307e\u3059\u304b' },
    { id: 'C',  v: 'banner-20260928-C',  img: 'banner_BC.webp', dest: 'check_c', alt: '\u70b9\u306e\u4e2d\u306e4\u3051\u305f\u306e\u6570\u5b57\u3001\u308f\u304b\u308a\u307e\u3059\u304b' }
  ];

  var QS = (function () {
    var p; try { p = new URLSearchParams(location.search); } catch (e) { p = null; }
    return {
      debug: !!(p && p.get('mtr_debug') === '1'),
      cw: (p && p.get('mtr_cw')) || null,
      reset: !!(p && p.get('mtr_reset') === '1')
    };
  })();

  /* ---------- sid and creative assignment ---------- */
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

  /* Pick 1 of 5 evenly. Derived from the sid so the assignment can be rechecked from the D1 rows. */
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

  /* ---------- tracking ---------- */
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
    /* sendBeacon returns false when it cannot queue the payload; resend with a no-cors fetch
       (same shape as mietore-popup_mailmag.js lines 121-157). */
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(CFG.TRACK_URL, new Blob([body], { type: 'text/plain' })) === true) return;
    } catch (e) {}
    try {
      var p = fetch(CFG.TRACK_URL, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  /* ---------- rendering (Shadow DOM, so the host LP's CSS cannot leak in or out) ---------- */
  var shown = false;
  function seen() {
    if (QS.reset) return false;
    try { return !!sessionStorage.getItem('mtrb_shown'); } catch (e) { return false; }
  }
  function markSeen() { try { sessionStorage.setItem('mtrb_shown', '1'); } catch (e) {} }

  function destUrl() {
    if (CRE.dest === 'check_b' || CRE.dest === 'check_c') {
      /* The LP and the check page are on different origins and cannot share sessionStorage,
         so sid and v are passed in the query string. */
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
      '<button class="x" type="button" aria-label="\u9589\u3058\u308b">\u00d7</button>' +
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

  /* ---------- exit detection (same approach as the original MtrExitTrigger) ---------- */
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
    /* If back arrives while the popup is open, do not swallow it: close the popup and let the
       real navigation continue (same shape as onPopState in mietore-popup_mailmag.js).
       Otherwise the pushed history entry makes the back button appear dead once. */
    if (host) {
      close('back');
      if (lastSource === 'back') history.back();
      return;
    }
    if (popped) { history.back(); return; }
    popped = true;
    if (!show('back')) { history.back(); return; }   /* cannot show: let the real navigation continue */
    history.pushState({ mtrb: 2 }, '');
  }
  function registerHistoryTriggers() {
    /* Without user activation Chromium skips the history entry we pushed. */
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

  if (seen()) return;   /* never show twice within the same sid */

  if (cwSupported()) {
    setTimeout(function () { if (!setupCloseWatcher()) registerHistoryTriggers(); }, 0);
  } else {
    registerHistoryTriggers();
  }
})();
