/* mtr-exit.js - exit banner delivery (6 creatives: A1/A2/A3/B/C/A7)
 * The agency only pastes this single tag into their LP:
 *   <script src="https://mietore.site/banner/mtr-exit.js" defer></script>
 *
 * Derived from public/mm/b/mietore-popup_mailmag.js (v3d-2.4.0-mailmag):
 *   - exit trigger MtrExitTrigger (CloseWatcher first, history pushState as fallback)
 *   - sender (sendBeacon with text/plain, falling back to a no-cors fetch)
 * Nothing is registered until GET /banner/config has been read (TASK-I16-20261002-002):
 *   the D1 row decides whether the banner runs at all and which creatives are eligible, so a
 *   human can stop every banner with one command. An unreadable config shows nothing.
 * Also carried over for in-app browsers (TASK-I16-20260930-003): the CloseWatcher +
 *   history hybrid, the LINE navboost (one replaceState after the first tap), a guard so
 *   in-page moves do not fire the banner (the origin entry is tagged with mtrb:0 and only a
 *   popstate that lands on it counts as leaving), and the exit_no_popup outcome event.
 * A7 (TASK-I16-20261007-001) is the first creative built from layers instead of one flat
 *   image: a base image plus 5 transparent layers moved by CSS keyframes alone (6s loop).
 *   No JavaScript timer drives the animation. Its layers are preloaded once the config has
 *   picked it, and the banner is only shown after every layer has loaded, so the loop is in
 *   step from the first frame.
 * B/C (TASK-I16-20261008-001) are drawn the same way, with 2 layers: the dots face as the
 *   base image and the 4 digits (4682) as a transparent layer that CSS fades in over 2.5s
 *   and then breathes. The digits are now all four equally strong, so the number read on the
 *   banner is the answer to the first question of the check page. A1/A2/A3 keep the
 *   single-image markup unchanged.
 * Not carried over: the always-show preview patch, the game, the talk animation,
 *   the mailmag screens, the 7-day localStorage suppression, the scroll_up auxiliary
 *   signal, and the page_view / lp_click / scroll_up_signal events.
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
    CONFIG: ORIGIN + '/banner/config',
    IMG_BASE: ORIGIN + '/banner/img',
    APP_URL: ORIGIN + '/app',
    CHECK_B: ORIGIN + '/banner/check/b',       /* no .html: avoids the 308 redirect Pages adds */
    CHECK_C: ORIGIN + '/banner/check/c'        /* no .html: avoids the 308 redirect Pages adds */
  };

  /* The 6 creatives. v is the version identifier recorded with every event.
     A1/A2/A3 carry one flat image (img). B/C and A7 carry layers + pre instead: the file for
     each layer is pre + <layer> + '.webp' and <layer> is also its CSS class, so the class and
     the file can never drift apart. The order is the paint order (base first). */
  var CREATIVES = [
    { id: 'A1', v: 'banner-20260928-A1', img: 'banner_A1.webp', dest: 'app',     alt: '1\u65e53\u5206\u306e\u76ee\u306e\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0' },
    { id: 'A2', v: 'banner-20260928-A2', img: 'banner_A2.webp', dest: 'app',     alt: '\u904b\u8ee2\u4e2d\u306b\u6a19\u8b58\u304c\u307c\u3084\u3051\u308b\u65b9\u3078' },
    { id: 'A3', v: 'banner-20260928-A3', img: 'banner_A3.webp', dest: 'app',     alt: '\u30b9\u30de\u30db\u306e\u5b57\u3092\u96e2\u3057\u3066\u8aad\u3080\u65b9\u3078' },
    { id: 'B',  v: 'banner-20260928-B',  pre: 'banner_BC_20261005_', dest: 'check_b',
      layers: ['base', 'num'],
      alt: '\u70b9\u306e\u4e2d\u306e4\u3051\u305f\u306e\u6570\u5b57\u3001\u898b\u3048\u307e\u3059\u304b' },
    { id: 'C',  v: 'banner-20260928-C',  pre: 'banner_BC_20261005_', dest: 'check_c',
      layers: ['base', 'num'],
      alt: '\u70b9\u306e\u4e2d\u306e4\u3051\u305f\u306e\u6570\u5b57\u3001\u898b\u3048\u307e\u3059\u304b' },
    { id: 'A7', v: 'banner-20261008-A7', pre: 'banner_A7_20261008_', dest: 'app',
      layers: ['base', 'head', 'ring', 'stamps', 'coin', 'picture'],
      alt: '\u30a2\u30b5\u30a4\u30d9\u30ea\u30fc\u30d7\u30e9\u30c1\u30ca\u30a2\u30a41\u3064\u7121\u6599\u30027\u65e5\u9023\u7d9a\u30671\u65e51\u56de\u30b2\u30fc\u30e0\u3092\u30af\u30ea\u30a2\u3059\u308b\u3068\uff081\u65e53\u5206\uff09\u3001\u3075\u304f\u3075\u304f\u30dd\u30a4\u30f3\u30c81000\u30dd\u30a4\u30f3\u30c8\u30021000\u30dd\u30a4\u30f3\u30c8\u3067\u30a2\u30b5\u30a4\u30d9\u30ea\u30fc\u30d7\u30e9\u30c1\u30ca\u30a2\u30a41\u3064\u30015,280\u5186(\u7a0e\u8fbc)\u304c\u7121\u6599\u3002\u7121\u6599\u30a2\u30d7\u30ea\u3067\u3001\u306f\u3058\u3081\u308b' }
  ];

  var QS = (function () {
    var p; try { p = new URLSearchParams(location.search); } catch (e) { p = null; }
    return {
      debug: !!(p && p.get('mtr_debug') === '1'),
      cw: (p && p.get('mtr_cw')) || null,
      hybrid: (p && p.get('mtr_hybrid')) || null,
      navboost: (p && p.get('mtr_navboost')) || null,
      reset: !!(p && p.get('mtr_reset') === '1')
    };
  })();

  /* ---------- on-screen log (?mtr_debug=1 only) ----------
     TikTok and LINE release builds expose no console and cannot be inspected remotely, so
     the state has to be readable on the page itself. Without mtr_debug=1 no element is
     created at all. Shadow DOM keeps the host LP's CSS out; pointer-events:none keeps taps
     and scrolling untouched. Nothing here identifies a visitor. */
  var dbgBox = null;
  function dbg(line) {
    if (!QS.debug) return;
    try {
      if (!dbgBox) {
        var h = document.createElement('div');
        h.id = 'mtrb-dbg';
        var sr = h.attachShadow ? h.attachShadow({ mode: 'open' }) : null;
        var r = sr || h;
        var st = document.createElement('style');
        st.textContent = ':host{all:initial}' +
          '.p{position:fixed;left:0;bottom:0;max-width:100vw;max-height:40vh;overflow:hidden;' +
          'z-index:2147483001;pointer-events:none;background:rgba(0,0,0,.72);color:#4f4;' +
          'font:11px/1.35 ui-monospace,monospace;padding:4px 6px;white-space:pre-wrap;' +
          'word-break:break-all}';
        r.appendChild(st);
        var b = document.createElement('div');
        b.className = 'p';
        r.appendChild(b);
        document.body.appendChild(h);
        dbgBox = b;
      }
      var d = document.createElement('div');
      d.textContent = line;
      dbgBox.appendChild(d);
      while (dbgBox.childNodes.length > 24) dbgBox.removeChild(dbgBox.firstChild);
    } catch (e) {}
    try { console.log('[mtrb]', line); } catch (e) {}
  }

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

  function byId(id) {
    for (var i = 0; i < CREATIVES.length; i++) if (CREATIVES[i].id === id) return CREATIVES[i];
    return null;
  }

  /* Pick 1 of the creatives the config says are active, evenly. Derived from the sid so the
     assignment can be rechecked from the D1 rows. A saved pick that is no longer active is
     replaced. Returns null when none of the active v are known here, in which case nothing
     is registered. The demo page (sid 9909xxxx) keeps its own switch bar and is not limited
     to the active list; it still obeys a stopped or unreadable config, because this function
     is only reached once the config says the banner runs. */
  function creative(active) {
    var saved = null;
    try { saved = sessionStorage.getItem('mtrb_creative'); } catch (e) {}
    if (saved && /^9909\d{4}$/.test(sid())) {
      var demo = byId(saved);
      if (demo) return demo;
    }
    var pool = [];
    for (var i = 0; i < active.length; i++) {
      for (var j = 0; j < CREATIVES.length; j++) {
        if (CREATIVES[j].v === active[i] && pool.indexOf(CREATIVES[j]) < 0) pool.push(CREATIVES[j]);
      }
    }
    if (!pool.length) return null;
    if (saved) {
      for (var k = 0; k < pool.length; k++) if (pool[k].id === saved) return pool[k];
    }
    var s = sid(), h = 0;
    for (var m = 0; m < s.length; m++) h = (h * 31 + s.charCodeAt(m)) % 100000;
    var c = pool[h % pool.length];
    try { sessionStorage.setItem('mtrb_creative', c.id); } catch (e) {}
    return c;
  }

  /* Set by start() once the config has been read. Nothing sends an event before that. */
  var CRE = null;

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
  /* UA-detectable in-app browser. Chrome Custom Tabs and SFSafariViewController report the
     same UA as the real browser and cannot be told apart here (DEC-20260728-001). */
  function isInAppBrowser() { return uaFamily() !== 'browser'; }
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
    '.x:focus-visible,.tap:focus-visible{outline:3px solid #f0a500;outline-offset:2px}' +
    /* Layered creatives only (.pop.lyr). Everything above is left exactly as it was, so
       A1/A2/A3 are drawn by the same rules as before.
       First the rules shared by every layered creative and the A7 layers.
       The layer positions and the keyframes are copied from the 2026-10-08 prototype in the
       EC repo (banner-haishin / banner-shisaku_20261008/v2: layers_2.css and index_2.html)
       with the same percentages and the same times.
       Two differences from the prototype, both deliberate:
         - the selectors are prefixed with .pop.lyr, because `.tap img{width:100%;height:100%}`
           above would otherwise beat a bare `.head{width:...}` and stretch every layer;
         - the prototype's `:root:not(.force-motion)` escape hatch is dropped: it is a capture
           aid, it matches nothing inside a shadow root, and it would disable the
           reduced-motion rules here.
       `.x` needs a stacking order here because the layers are absolutely positioned and would
       otherwise be painted over the close button. */
    '.pop.lyr .tap{position:relative}' +
    '.pop.lyr .tap img{position:absolute;display:block;height:auto;object-fit:fill}' +
    '.pop.lyr .x{z-index:2}' +
    '.pop.lyr .base{left:0;top:0;width:100%;height:100%}' +
    '.pop.lyr .head{left:5.185%;top:10.677%;width:89.815%}' +
    '.pop.lyr .ring{left:0.000%;top:29.427%;width:100.000%}' +
    '.pop.lyr .stamps{left:28.889%;top:41.771%;width:45.556%}' +
    '.pop.lyr .coin{left:12.593%;top:49.219%;width:18.519%}' +
    '.pop.lyr .picture{left:70.926%;top:62.083%;width:27.778%}' +
    /* 6s loop, repeating: 0-2s ring on row 1 and the 7 stamps fill one day at a time
       (0-1.5s), 2-4s ring on row 2 and the coin hops, 4-6s ring on row 3 and the picture
       hops. @keyframes inside a shadow root cannot collide with the host LP's own names. */
    '.pop.lyr .ring{animation:ring 6s steps(1,end) infinite}' +
    '.pop.lyr .stamps{animation:stamp 6s infinite}' +
    '.pop.lyr .coin{animation:hopC 6s ease-out infinite}' +
    '.pop.lyr .picture{animation:hopB 6s ease-out infinite}' +
    '@keyframes ring{0%{top:29.427%}33.333%{top:45.260%}66.667%{top:61.094%}100%{top:61.094%}}' +
    '@keyframes stamp{0%{clip-path:inset(0 100% 0 0);animation-timing-function:steps(7,end)}' +
    '25%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 0 0 0)}}' +
    '@keyframes hopC{0%,33.333%{transform:none}38%{transform:translateY(-8%) scale(1.12)}44%,100%{transform:none}}' +
    '@keyframes hopB{0%,66.667%{transform:none}71%{transform:translateY(-6%) scale(1.1)}77%,100%{transform:none}}' +
    /* Reduce motion: no ring at all, and the stamps stay as all 7 filled.
       The ring rule is written as `.tap img.ring` on purpose: `.pop.lyr .tap img{display:block}`
       above is (0,3,1) and would beat a plain `.pop.lyr .ring{display:none}` (0,3,0), which
       would leave the ring drawn on row 1 for a visitor who asked for less motion. */
    '@media (prefers-reduced-motion:reduce){' +
    '.pop.lyr .tap img.ring{display:none}' +
    '.pop.lyr .stamps,.pop.lyr .coin,.pop.lyr .picture{animation:none;clip-path:none}}' +
    /* B/C only (.pop.lyr .num). The digits layer fades in over 2.5s and then breathes.
       The position and the keyframes are copied from the 2026-10-05 prototype in the EC repo
       (banner-haishin / banner-shisaku_20261005: index.html with lv=strong2) with the same
       percentages and the same times: strong2 sits at [13,874,1029,297] in the 1080x1920
       banner, which is 13/1080, 874/1920 and 1029/1080 here. The same two changes as A7 are
       made: the selectors are prefixed with .pop.lyr, and the prototype's
       :root:not(.force-motion) capture aid is dropped. */
    '.pop.lyr .num{left:1.2037%;top:45.5208%;width:95.2778%;opacity:0;' +
    'animation:numRise 2.5s cubic-bezier(.2,.5,.35,1) both,' +
    'numBreath 1.5s ease-in-out 2.5s infinite alternate}' +
    '@keyframes numRise{from{opacity:0}to{opacity:1}}' +
    '@keyframes numBreath{from{opacity:1}to{opacity:.93}}' +
    /* Reduce motion: the digits are drawn at full strength from the first frame.
       This block has to stay after the .num rule above: both are (0,3,0), so the later one
       wins. Put inside the A7 @media block it would lose and leave the digits invisible. */
    '@media (prefers-reduced-motion:reduce){.pop.lyr .num{animation:none;opacity:1}}';

  var host = null;
  function close(how) {
    if (!host) return;
    track('banner_close', how);
    try { host.remove(); } catch (e) {}
    host = null;
  }

  /* ---------- layer preload (layered creatives: B/C and A7) ----------
     A layered creative has to appear with its animation already in step, so every layer is
     loaded (and decoded where the browser offers decode()) before the banner is drawn, the
     same way the prototype does it. Started by start() once the config has picked a layered
     creative and the exit triggers are about to be registered, so a session that can never
     show the banner never downloads the layers. Nothing here is a timer: the only thing that
     moves the layers is CSS.
       pending -> ok    draw on exit, or draw now if the exit already happened
       pending -> fail  never draw, and send no banner_view (a half-loaded banner would show
                        a white frame, a stamp row frozen at day 0, or a dots face with no
                        digits in it at all) */
  var layerState = 'none';          /* none | pending | ok | fail */
  var layerWaiters = [];
  function layerSrc(name) { return CFG.IMG_BASE + '/' + CRE.pre + name + '.webp'; }
  function settleLayers(next) {
    if (layerState !== 'pending') return;
    layerState = next;
    dbg('layers: ' + next);
    var ws = layerWaiters;
    layerWaiters = [];
    for (var i = 0; i < ws.length; i++) { try { ws[i](); } catch (e) {} }
  }
  function preloadLayers() {
    var left = CRE.layers.length, bad = false;
    layerState = 'pending';
    dbg('layers: loading ' + left);
    CRE.layers.forEach(function (name) {
      var im = new Image();
      function done() {
        if (--left > 0) return;
        settleLayers(bad ? 'fail' : 'ok');
      }
      im.onload = function () {
        /* A decode() failure is not a load failure: the bytes arrived. Treat it as loaded,
           as the prototype does, so one odd browser cannot suppress the banner. */
        if (typeof im.decode === 'function') im.decode().then(done, done);
        else done();
      };
      im.onerror = function () { bad = true; done(); };
      im.src = layerSrc(name);
    });
  }

  function layerImgs() {
    var h = '';
    for (var i = 0; i < CRE.layers.length; i++) {
      /* alt="" on every layer: the whole banner is one button and its aria-label carries
         the text, so a screen reader must not read the picture 6 times. */
      h += '<img class="' + CRE.layers[i] + '" src="' + layerSrc(CRE.layers[i]) + '" alt="">';
    }
    return h;
  }

  /* Draw and send banner_view. Only show() calls this, and only once. */
  function render(source) {
    host = document.createElement('div');
    host.id = 'mtrb-root';
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    var root = sr || host;
    var st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
    var bg = document.createElement('div'); bg.className = 'bg';
    bg.innerHTML = '<div class="pop' + (CRE.layers ? ' lyr' : '') + '">' +
      '<button class="x" type="button" aria-label="\u9589\u3058\u308b">\u00d7</button>' +
      '<button class="tap" type="button" aria-label="' + CRE.alt + '">' +
      (CRE.layers ? layerImgs()
        : '<img src="' + CFG.IMG_BASE + '/' + CRE.img + '" alt="' + CRE.alt + '">') +
      '</button></div>';
    root.appendChild(bg);
    document.body.appendChild(host);
    lastSource = source;
    root.querySelector('.x').addEventListener('click', function () { close('x'); });
    root.querySelector('.tap').addEventListener('click', function () {
      track('banner_tap', CRE.dest);
      location.href = destUrl();
    });
    track('banner_view', source);
  }

  /* Returns true when this exit has been claimed: either the banner is on screen now, or it
     will be as soon as the layers finish loading. false means nothing was shown and nothing
     was sent, and the caller lets the real navigation through.
     For a layered creative the layers are usually ready long before the visitor leaves (they
     start downloading at config time). The two other cases:
       loading  claim the exit and draw when the layers arrive. A second back press goes
                through the existing `popped` path, so the visitor is never stuck.
       failed   do not claim it: the visitor leaves as if no banner existed. */
  function show(source) {
    if (shown || seen()) return false;
    if (CRE.layers) {
      if (layerState === 'fail') { dbg('show: skipped, layers failed'); return false; }
      if (layerState === 'pending') {
        shown = true;
        markSeen();
        dbg('show: waiting for layers (' + source + ')');
        layerWaiters.push(function () {
          if (layerState === 'ok') render(source);
          else dbg('show: dropped, layers failed');
        });
        return true;
      }
    }
    shown = true;
    markSeen();
    render(source);
    return true;
  }

  /* ---------- exit detection (same approach as the original MtrExitTrigger) ---------- */
  var armed = false, popped = false, cwActive = false;
  /* True once this document's session history holds an entry of ours. Unlike `armed` it is
     never cleared by pageshow (bfcache), and it starts true after a plain reload that lands
     on an entry we pushed, so a back press is never swallowed without either showing the
     banner or letting the navigation through. */
  var marked = false;
  try { marked = typeof (history.state && history.state.mtrb) === 'number'; } catch (e) {}
  /* True only when arm() managed to tag the origin entry in this page life. While it is true
     the guard can recognise the origin entry by its marker; while it is false the guard falls
     back to "we pushed something and did not land on a marker of ours", which can misfire on a
     native in-page link but never swallows a back press. */
  var b0 = false;

  function hasActivation() {
    var ua = navigator.userActivation;
    if (!ua) return true;
    return ua.hasBeenActive === true;
  }
  /* Tag the entry we are standing on when we arm (the origin entry), keeping whatever the host
     page already stored there. A browser's own in-page link fires popstate with a null state
     when it moves FORWARD, exactly like a real back to the origin, so the state alone cannot
     tell them apart; a marker on the origin can. Returns false when the existing state cannot
     carry a key (a string, a number, an array, a Date), in which case nothing is written and
     the guard falls back. replaceState is called without a URL so the address does not change. */
  function markOrigin() {
    var st;
    try { st = history.state; } catch (e) { return false; }
    var next;
    if (st === null || st === undefined) {
      next = { mtrb: 0 };
    } else if (Object.prototype.toString.call(st) === '[object Object]') {
      next = {};
      try {
        for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) next[k] = st[k];
      } catch (e) { return false; }
      next.mtrb = 0;
    } else {
      return false;
    }
    try { history.replaceState(next, ''); } catch (e) { return false; }
    return true;
  }

  function arm() {
    if (armed) return true;
    if (history.state && history.state.mtrb) {
      /* A plain reload can land on an entry we pushed in an earlier page life. Do not push
         again, and do not claim the origin marker: the guard falls back, which still lets a
         back press through. */
      armed = true; marked = true;
      dbg('arm: reused (fallback guard)');
      return true;
    }
    armed = true;
    b0 = markOrigin();
    history.pushState({ mtrb: 1 }, '');
    marked = true;
    dbg(b0 ? 'arm: pushState (origin tagged)' : 'arm: pushState (origin not taggable, fallback guard)');
    return true;
  }

  /* navboost: in-app browsers only, on by default, once, after the first tap.
     LINE recalculates whether its back control is usable only on navigation-type events, so
     one replaceState after user activation makes the entry we pushed actually reachable
     (DEC-20260727-005 / DEC-20260727-006). Firing it before the tap is useless because the
     entry stays skippable. Only the repush variant is carried over: fukufuku keeps repush2
     and reload for testing. replaceState(history.state) preserves our mtrb marker. */
  var navboosted = false;
  function navboostMode() {
    var m = QS.navboost || 'repush';
    return (m && m !== 'off') ? m : null;
  }
  function maybeNavboost() {
    if (navboosted) return;
    if (navboostMode() !== 'repush' || !isInAppBrowser()) return;
    if (!hasActivation()) return;
    navboosted = true;
    try { history.replaceState(history.state, ''); } catch (e) {}
    dbg('navboost: repush');
  }
  function cwSupported() {
    if (QS.cw === 'off') return false;
    return typeof window.CloseWatcher === 'function';
  }
  function setupCloseWatcher() {
    try {
      var w = new CloseWatcher();
      w.onclose = function () {
        cwActive = false;
        dbg('cw: fired');
        if (show('back_cw')) dbg('show: back_cw');
      };
      cwActive = true;
      dbg('cw: armed');
      return true;
    } catch (e) { dbg('cw: error'); return false; }
  }
  var lastSource = null;
  /* Leaving the LP, as opposed to an in-page move. With the origin tagged, only a popstate that
     lands on that marker counts. Without it (the state could not carry a key, or a reload landed
     on one of our entries), fall back to "we pushed something and did not land on a marker of
     ours": that can misfire on a native in-page link but never swallows a back press. */
  function isExit() {
    var st = history.state;
    if (b0) return !!(st && st.mtrb === 0);
    return marked && !(st && st.mtrb);
  }
  function onPopState() {
    var m = history.state && history.state.mtrb;
    dbg('popstate: mtrb=' + (typeof m === 'number' ? m : '-'));
    /* If back arrives while the popup is open, do not swallow it: close the popup and let the
       real navigation continue (same shape as onPopState in mietore-popup_mailmag.js).
       Otherwise the pushed history entry makes the back button appear dead once. */
    if (host) {
      close('back');
      if (lastSource === 'back') history.back();
      return;
    }
    /* Anything that is not a landing on the origin entry is an in-page move (a native anchor
       moving forward, a tab, or undoing either of those): do nothing, neither show nor
       history.back(), and let the visitor keep reading. Where CloseWatcher runs alone we never
       arm, so every popstate is an in-page move; on such a browser the device back arrives as a
       close request instead and the CloseWatcher path handles it, exactly as fukufuku does. */
    if (!isExit()) { dbg('guard: in-page back'); return; }
    if (popped) { dbg('pass: history.back'); history.back(); return; }
    popped = true;
    if (!show('back')) { dbg('pass: history.back'); history.back(); return; }   /* cannot show: let the real navigation continue */
    dbg('show: back');
    history.pushState({ mtrb: 2 }, '');
    marked = true;
  }

  /* Record, once, how a session ended that never saw the banner. Judged top down:
     seen          = an earlier page of this same sid already showed it
     cw_alive      = CloseWatcher was still armed and no history entry of ours exists
     armed_no_back = our entry exists and there was a tap, but no back operation came
     no_activation = none of the above: no tap, and back never reached the page
     Sent on whichever of visibilitychange(hidden) and pagehide comes first. pagehide is not
     guaranteed to fire, which is why both are used. Nothing here identifies a visitor. */
  var exitReported = false;
  function exitParam() {
    if (seen()) return 'seen';
    if (cwActive && !marked) return 'cw_alive';
    if (marked && hasActivation()) return 'armed_no_back';
    return 'no_activation';
  }
  function reportExitOutcome() {
    if (exitReported || shown) return;
    exitReported = true;
    var p = exitParam();
    dbg('exit_no_popup: ' + p);
    track('exit_no_popup', p);
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

  /* ---------- config (GET /banner/config) ----------
     Read once per page load with no store, so the D1 row takes effect on the next LP open.
     Unreadable means any of: no answer within CONFIG_TIMEOUT, a status other than 200, a body
     that is not JSON, or a shape that is not { stopped: boolean, active: string[] }. A browser
     without fetch is unreadable too. done() is called exactly once; a late answer is dropped. */
  var CONFIG_TIMEOUT = 2000;
  function isStringArray(a) {
    if (!a || Object.prototype.toString.call(a) !== '[object Array]') return false;
    for (var i = 0; i < a.length; i++) if (typeof a[i] !== 'string') return false;
    return true;
  }
  function loadConfig(done) {
    var settled = false;
    function finish(cfg) {
      if (settled) return;
      settled = true;
      done(cfg);
    }
    var ctl = null;
    try { if (typeof AbortController === 'function') ctl = new AbortController(); } catch (e) {}
    /* The timer runs even when abort is available: it also covers a body that arrives late. */
    setTimeout(function () {
      if (settled) return;
      dbg('config: timeout');
      try { if (ctl) ctl.abort(); } catch (e) {}
      finish(null);
    }, CONFIG_TIMEOUT);
    if (typeof fetch !== 'function') { dbg('config: no fetch'); finish(null); return; }
    var p;
    try {
      var opt = { cache: 'no-store', credentials: 'omit', mode: 'cors' };
      if (ctl) opt.signal = ctl.signal;
      p = fetch(CFG.CONFIG, opt);
    } catch (e) { dbg('config: fetch threw'); finish(null); return; }
    if (!p || !p.then) { dbg('config: no promise'); finish(null); return; }
    p.then(function (res) {
      if (!res || res.status !== 200) { dbg('config: status ' + (res && res.status)); finish(null); return null; }
      return res.json().then(function (j) {
        if (!j || typeof j.stopped !== 'boolean' || !isStringArray(j.active)) {
          dbg('config: shape');
          finish(null);
          return;
        }
        dbg('config: stopped=' + j.stopped + ' active=' + j.active.join(','));
        finish({ stopped: j.stopped, active: j.active });
      });
    })['catch'](function () { dbg('config: error'); finish(null); });
  }

  /* Everything below ran at load time before TASK-I16-20261002-002; it now runs only after the
     config says the banner runs, in the same order and with the same contents. When the config
     is unreadable, stopped, or leaves no eligible creative, nothing at all is registered: no
     popstate / pagehide / visibilitychange / pageshow / tap listener, no setTimeout(arm), no
     CloseWatcher, no navboost, no pushState / replaceState, no layer download, and no event
     is sent. */
  function start(cfg) {
    if (!cfg) { dbg('config: unreadable, nothing registered'); return; }
    if (cfg.stopped) { dbg('config: stopped, nothing registered'); return; }
    CRE = creative(cfg.active);
    if (!CRE) { dbg('config: no eligible creative, nothing registered'); return; }
    dbg('creative: ' + CRE.id);

    /* Registered before the seen() return below, so a session that cannot show the banner any
       more still reports how it ended. */
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pagehide', function () {
      reportExitOutcome();
      if (host) close('leave');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) reportExitOutcome();
    });
    window.addEventListener('pageshow', function (e) {
      /* marked and b0 are deliberately NOT reset: the origin marker survives in the session
         history, so a visitor coming back through bfcache must still be able to leave. */
      if (e.persisted) { dbg('pageshow: bfcache'); armed = false; popped = false; }
    });

    if (seen()) { dbg('seen: skip'); return; }   /* never show twice within the same sid */

    /* Only after seen(): a session that can no longer show the banner must not download
       150KB of layers. */
    if (CRE.layers) preloadLayers();

    if (navboostMode()) {
      ['touchend', 'pointerup', 'click'].forEach(function (t) {
        window.addEventListener(t, maybeNavboost, { passive: true });
      });
    }

    if (cwSupported()) {
      /* In a UA-detectable in-app browser (LINE / TikTok / a generic `; wv)` WebView) the host
         app keeps the back gesture for itself and never delivers the close request to the page,
         so push a history entry as well: the app's back then becomes a history traversal and
         popstate arrives (DEC-20260727-005, DEC-20260728-001). In a plain browser CloseWatcher
         runs alone and the history stays clean. ?mtr_hybrid=off turns the pairing off. Both
         paths firing cannot show twice: show() returns early once `shown` is set. */
      setTimeout(function () {
        var ok = setupCloseWatcher();
        var hybrid = ok && isInAppBrowser() && QS.hybrid !== 'off';
        if (hybrid) dbg('hybrid: cw+history');
        if (!ok || hybrid) registerHistoryTriggers();
      }, 0);
    } else {
      dbg('cw: unsupported');
      registerHistoryTriggers();
    }
  }

  loadConfig(start);
})();
