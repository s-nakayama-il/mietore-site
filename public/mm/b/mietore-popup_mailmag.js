/* mietore-popup.js
 * version: v3d-2.4.0
 * generated from: config.js, tracker.js, frequency.js, exit-trigger.js, popup.css, popup.html, game.js, main.js
 * このファイルは tools/assemble.mjs による自動生成物です。直接編集しないでください。
 * メルマガ即スタート版: dist-test/mietore-popup.js (v3d-2.4.0) のコピーに、TRACK_URL差替・常時即表示化・×リロード化の3点をパッチした派生物。
 */
(function(){
'use strict';
/* 設定定数 */
var MTR_CONFIG = {
  /* アップロード先確定後に要確認（仮パス） */
  /* 相対パス指定: index_b.html・本ファイル・track.php を同一ディレクトリに置けば設置先サーバー・ドメインを問わず動作する */
  TRACK_URL: '/mm/track',
  SUPPRESS_DAYS: 7,
  VERSION: 'v3d-2.4.0-mailmag',

  /* 補助シグナル（scroll_up）の有効範囲。
     'mobile'（既定）: タッチ可能なモバイル端末なら常に有効
     'inapp'         : isInAppBrowser() の UA 判定に従う（従来動作）
     'always'        : 常に有効
     'count'         : mobile相当のゲーティングで検知はするがポップアップは出さず、
                       scroll_up_signal を計測送信のみ行う（シャドウ計測）
     'off'           : 無効
     既定を 'mobile' にした理由: Google Chat 等の Chrome Custom Tabs は UA が本物のChromeと
     同一のため UA トークンでは原理的にアプリ内ブラウザと判別できない。実測で in_app:false となり
     補助シグナルが登録されていなかった（2026-07-27）。DEC-20260727-002 参照
     2026-07-29 ユーザー判断で 'off' に変更（読み返しスクロールでの表示は不要）。
     アプリ内ブラウザのタップなし訪問者の受け皿が無くなる点は stats⑨ の exit_no_popup で本番計測して再判断
     2026-07-30 社内決定で 'count' に変更。AUXのポップアップ発火はoff維持のまま、
     実態人数だけをシャドウ計測（scroll_up_signal）して後日判断する */
  AUX_MODE: 'count',
  AUX_MIN_DEPTH: 300,
  AUX_UP_DISTANCE: 250,
  AUX_UP_WINDOW_MS: 400,
  AUX_TOP_ZONE: 400,
  /* 補助シグナル発火前の確認待ち時間（ms）。待機中に下方向スクロールを検知したら発火を中止する */
  AUX_CONFIRM_MS: 1200,
  /* 確認待ちを中止する下方向スクロールの最小量（px）。
     iOSのラバーバンド（最上部でのオーバースクロールからの戻り）や慣性の揺り戻しで
     数pxだけyが増えるのを「読み返し」と誤判定しないための下限 */
  AUX_CANCEL_DOWN_PX: 40,

  /* trueならスクリプト読み込み直後に即arm（pushState）する。既定true。
     Chromiumの介入（History Manipulation Intervention）は「documentに user gesture が
     pushState の前後どちらかにあれば」発動しない（公式docs明記）。つまり先に積んでおき、
     後からタップが来れば履歴エントリは有効になる。activationを待ってからarmする方式は
     LP側の stopPropagation でタップを検知し損ねるリスクがあるため、先積みの方が堅い。
     falseにすると activation を待ってから arm する（比較検証用。?mtr_arm=gated でも切替可）。
     なお「一度もタップしない訪問者」はどちらの方式でも◀で発火しない（スクロールは
     gesture に数えられない・Chromium の意図的設計）。その層は scroll_up が補完する */
  ARM_IMMEDIATELY: true,

  /* navboostの既定モード。LINE等のアプリ内ブラウザは ‹/◀ の有効状態をナビゲーション系
     イベントの時しか再計算しないため、タップでactivationが付いた後に再計算のきっかけを
     1回だけ起こす（in-app限定・初回タップ後に発動）。
     'repush'（既定）: history.replaceStateで履歴更新イベントのみ起こす。画面変化なし。
                       LINE実機で ‹ アクティブ化＋‹/◀両方での発火を確認済み
     'off'           : 無効
     URLの ?mtr_navboost= が指定されていればそちらが優先される。DEC-20260727-006 参照 */
  NAVBOOST_MODE: 'repush',

  /* 配信率（0.0〜1.0）。1.0で全量配信 */
  ROLLOUT_RATE: 1.0,
  /* 配信対象URLの前方一致文字列の配列。空配列なら全ページ対象 */
  TARGET_URL_PATTERNS: []
};

var MTR_QUERY = (function(){
  var params;
  try { params = new URLSearchParams(location.search); } catch(e) { params = null; }
  return {
    debug: !!(params && params.get('mtr_debug') === '1'),
    preview: true, /* メルマガ版: 常時即表示（抑制・離脱トリガーを全て素通し） */
    reset: !!(params && params.get('mtr_reset') === '1'),
    /* AUX_MODE のURL上書き。?mtr_aux=off で補助シグナルを切り、◀単独の検証ができる */
    aux: (params && params.get('mtr_aux')) || null,
    /* arm方式のURL上書き。'immediate'=読込直後に積む / 'gated'=activationを待つ（比較検証用） */
    arm: (params && params.get('mtr_arm')) || null,
    /* ?mtr_cw=off でCloseWatcherを無効化しhistory方式に強制する（比較検証用） */
    cw: (params && params.get('mtr_cw')) || null,
    /* ?mtr_hybrid=off でアプリ内ブラウザでのCW+history併用を無効化する（切り分け用） */
    hybrid: (params && params.get('mtr_hybrid')) || null,
    /* navboostモードのURL上書き（既定は MTR_CONFIG.NAVBOOST_MODE='repush'）。
       'repush'=replaceStateで履歴更新イベントを起こす / 'repush2'=pushState版 /
       'reload'=1回だけ自動リロード（sticky activationをリロード後へ引き継がせる） /
       'off'=無効化 */
    navboost: (params && params.get('mtr_navboost')) || null
  };
})();

/* 計測送信 */
function mtrGetSid(){
  var sid;
  try {
    sid = sessionStorage.getItem('mtr_sid');
    if(!sid){
      sid = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      sessionStorage.setItem('mtr_sid', sid);
    }
  } catch(e) {
    sid = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  }
  return sid;
}

function mtrGetOS(){
  var ua = navigator.userAgent || '';
  /* 新しいiPadOSはUAがMacと同一のため、タッチ点数で判別する */
  if(/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iOS';
  if(/Android/.test(ua)) return 'Android';
  return 'PC';
}

function mtrDebugLog(payload){
  var panel = document.getElementById('mtr-debug-panel');
  if(!panel) return;
  var line = document.createElement('div');
  line.textContent = payload.ts + ' ' + payload.event + (payload.param !== undefined && payload.param !== null ? '(' + payload.param + ')' : '');
  panel.appendChild(line);
}

window.__mtrTrack = function(event, param){
  if(event === 'popup_view' && param === undefined && window.__mtrTriggerSource){
    param = window.__mtrTriggerSource;
  }
  var payload = {
    ts: new Date().toISOString(),
    sid: mtrGetSid(),
    event: event,
    param: param,
    url: location.href,
    os: mtrGetOS(),
    v: MTR_CONFIG.VERSION,
    /* モジュール読込順（config→tracker→frequency→exit-trigger）に依存しないよう、
       送信時点で遅延参照する */
    ua_family: (typeof MtrExitTrigger !== 'undefined') ? MtrExitTrigger.uaFamily() : 'browser'
  };

  if(!MTR_CONFIG.TRACK_URL || MTR_QUERY.debug){
    console.log('[mtr]', payload);
    mtrDebugLog(payload);
    return;
  }

  var body = JSON.stringify(payload);
  /* sendBeacon はキューに積めなかったとき false を返す。その場合は fetch に
     フォールバックして離脱時イベントの取りこぼしを減らす（2026-07-29 Codexレビュー指摘対応） */
  try {
    if(navigator.sendBeacon &&
       navigator.sendBeacon(MTR_CONFIG.TRACK_URL, new Blob([body], { type: 'text/plain' })) === true){
      return;
    }
  } catch(e) {}
  try {
    var p = fetch(MTR_CONFIG.TRACK_URL, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
    if(p && p.catch) p.catch(function(){});
  } catch(e) {}
};

/* 表示頻度制御 */
var MtrFrequency = {
  canShow: function(){
    if(MTR_QUERY.preview) return true;
    try {
      if(localStorage.getItem('mtr_never')) return false;
      var suppressUntil = parseInt(localStorage.getItem('mtr_suppress_until'), 10);
      if(suppressUntil && Date.now() < suppressUntil) return false;
      if(sessionStorage.getItem('mtr_shown')) return false;
    } catch(e) {
      return true;
    }
    return true;
  },
  /* preview はテスト専用のため、本番の抑制状態（7日抑制・恒久抑制・セッション表示済み）を
     汚さないよう mark系は書き込まない（2026-07-29 Codexレビュー指摘対応） */
  markShown: function(){
    if(MTR_QUERY.preview) return;
    try { sessionStorage.setItem('mtr_shown', '1'); } catch(e) {}
  },
  markClosed: function(){
    if(MTR_QUERY.preview) return;
    try {
      var until = Date.now() + MTR_CONFIG.SUPPRESS_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem('mtr_suppress_until', String(until));
    } catch(e) {}
  },
  markConverted: function(){
    if(MTR_QUERY.preview) return;
    try { localStorage.setItem('mtr_never', '1'); } catch(e) {}
  },
  reset: function(){
    try { localStorage.removeItem('mtr_never'); } catch(e) {}
    try { localStorage.removeItem('mtr_suppress_until'); } catch(e) {}
    try { sessionStorage.removeItem('mtr_shown'); } catch(e) {}
  }
};

/* 離脱検知（案A: 戻るボタン検知 + アプリ内ブラウザ向け補助シグナル） */
var MtrExitTrigger = (function(){
  var armed = false;
  var popupShown = false;
  var shownEver = false;
  var exitReported = false;
  var inScope = false;
  var cwActive = false;
  var onShow = null;
  var onClose = null;

  /* Chromiumは user activation を伴わない pushState の履歴エントリを skippable にし、
     戻るボタンがそれを読み飛ばす。読み飛ばされると popstate が発火しない。
     APIが無いブラウザ（Safari等）はこの介入自体が無いので従来どおり扱う */
  function hasUserActivation(){
    var ua = navigator.userActivation;
    if(!ua) return true;
    return ua.hasBeenActive === true;
  }

  function reportActivation(){
    var ua = navigator.userActivation;
    window.__mtrDebugStat && window.__mtrDebugStat('activation',
      'activation: ' + (ua ? ua.hasBeenActive : 'n/a'));
  }

  /* navboost（LINE等のアプリ内ブラウザ限定・既定ON。?mtr_navboost=で上書き、offで無効）。
     LINEは◀/‹の有効状態をナビゲーション系イベントの時しか再計算しないため、
     タップでactivationが付いた「後」に再計算のきっかけを起こす。
     タップ前に起こしてもエントリがskippableのままで無意味（実測済み）。
     repush=replaceStateで履歴更新イベントのみ / repush2=pushState版 /
     reload=1回だけ自動リロード（sticky activationが同一オリジンのリロード後へ
     引き継がれ、手動の「タップ→更新」と同じ状態を再現する） */
  var navboosted = false;
  /* 有効なnavboostモードを解決する。URLパラメータ優先、無指定なら設定既定。'off'は無効 */
  function navboostMode(){
    var mode = MTR_QUERY.navboost || MTR_CONFIG.NAVBOOST_MODE;
    return (mode && mode !== 'off') ? mode : null;
  }
  function maybeNavboost(){
    if(navboosted) return;
    var mode = navboostMode();
    if(!mode || !isInAppBrowser()) return;
    if(!hasUserActivation()) return;
    navboosted = true;
    if(mode === 'repush'){
      try { history.replaceState(history.state, ''); } catch(e) {}
      window.__mtrDebugLine && window.__mtrDebugLine('navboost: repush');
    } else if(mode === 'repush2'){
      try { history.pushState({ mtr: 1 }, ''); } catch(e) {}
      window.__mtrDebugLine && window.__mtrDebugLine('navboost: repush2');
    } else if(mode === 'reload'){
      try {
        if(!sessionStorage.getItem('mtr_navboosted')){
          sessionStorage.setItem('mtr_navboosted', '1');
          window.__mtrDebugLine && window.__mtrDebugLine('navboost: reloading');
          location.reload();
        }
      } catch(e) {}
    }
  }

  /* CloseWatcher: Androidの◀やEscを「閉じる要求」として捕まえる標準API（Chrome120+/Safari18.4+）。
     user activationなしで1つ作成でき、close requestは履歴traversalの代わりにcloseイベントを発火する。
     activationなしで作ったwatcherは1回のclose requestで消費される（グループ化ルール）ため、
     1回目の◀は捕まえ、2回目は普通に離脱できる。pushStateを使わないので履歴も汚さない。
     これによりタップしない訪問者でも◀でポップアップを出せる。DEC-20260727-004参照 */
  function cwSupported(){
    if(MTR_QUERY.cw === 'off') return false;
    return typeof window.CloseWatcher === 'function';
  }

  function setupCloseWatcher(){
    try {
      var w = new CloseWatcher();
      w.onclose = function(){
        cwActive = false;
        window.__mtrDebugLine && window.__mtrDebugLine('cw: fired');
        triggerShow('back_cw');
      };
      cwActive = true;
      window.__mtrDebugLine && window.__mtrDebugLine('cw: armed');
      return true;
    } catch(e) {
      window.__mtrDebugLine && window.__mtrDebugLine('cw: error');
      return false;
    }
  }

  /* gated=trueのときだけ activation を待つ（比較検証用）。既定は immediate（先積み）。
     介入は「gestureがpushStateの前後どちらかにあれば」発動しないため、先に積んでよい */
  function isArmGated(){
    if(MTR_QUERY.arm === 'gated') return true;
    if(MTR_QUERY.arm === 'immediate') return false;
    return !MTR_CONFIG.ARM_IMMEDIATELY;
  }

  /* 成功したらtrueを返す。gated時にactivation待ちでarmできなかった場合はarmedを立てず
     falseを返し、呼び出し側が次の機会に再試行できるようにする */
  function arm(){
    if(armed) return true;
    if(history.state && history.state.mtr) { armed = true; return true; }
    if(isArmGated() && !hasUserActivation()){
      /* スクロール毎に呼ばれうるため固定行を更新する（行を増やすとパネルが溢れる） */
      window.__mtrDebugStat && window.__mtrDebugStat('arm', 'arm skipped: no activation');
      return false;
    }
    armed = true;
    history.pushState({ mtr: 1 }, '');
    window.__mtrDebugStat && window.__mtrDebugStat('arm', 'arm: ok');
    window.__mtrDebugLine && window.__mtrDebugLine('armed: state=' + JSON.stringify(history.state) + ' len=' + history.length);
    return true;
  }

  function registerTrigger(fn){
    fn(arm);
  }

  /* armに失敗した場合はリスナを外さず、次のスクロールで再試行する */
  function armOnScroll(cb){
    function handler(){ if(cb()) window.removeEventListener('scroll', handler); }
    window.addEventListener('scroll', handler, { passive: true });
  }

  function armOnTimeout(cb){
    setTimeout(cb, 3000);
  }

  /* Chromiumでタッチ操作の user activation を付与するのは touchend / pointerup であり、
     touchstart / pointerdown では付かない。armに失敗した場合はリスナを残して再試行する */
  function armOnFirstInteraction(cb){
    function handler(){
      if(!cb()) return;
      window.removeEventListener('touchend', handler);
      window.removeEventListener('pointerup', handler);
      window.removeEventListener('click', handler);
    }
    window.addEventListener('touchend', handler, { passive: true });
    window.addEventListener('pointerup', handler, { passive: true });
    window.addEventListener('click', handler, { passive: true });
  }

  /* UAトークンからアプリ内ブラウザの種別を判定する（上から先勝ち）。
     '; wv)' はAndroid汎用WebViewのトークンで、ゲームアプリ内ブラウザ等の個別UA検出が
     できない環境も拾うために追加した（DEC-20260728-001）。カスタムUAを設定しているアプリは
     このトークンを削っている場合があり、その場合は拾えない。
     日本のTikTok Androidは trill_XXXXXX / AppName/trill を名乗る（2026-07-29 実機確認） */
  function uaFamily(){
    var ua = navigator.userAgent || '';
    if(/musical_ly|trill|Bytedance|TTWebView/.test(ua)) return 'tiktok';
    if(/ Line\//.test(ua)) return 'line';
    if(/Instagram/.test(ua)) return 'instagram';
    if(/FBAN|FBAV/.test(ua)) return 'facebook';
    if(/; wv\)/.test(ua)) return 'wv';
    return 'browser';
  }

  function isInAppBrowser(){
    return uaFamily() !== 'browser';
  }

  /* 補助シグナルの有効範囲。UAトークンによるアプリ内ブラウザ判定はChrome Custom Tabsを
     検出できないため、既定の 'mobile' ではUAを使わずタッチ可否とOSで決める */
  /* 適用されるAUX_MODEと、その出所（url指定かconfig既定か） */
  function auxMode(){
    if(MTR_QUERY.aux) return { mode: MTR_QUERY.aux, from: 'url' };
    return { mode: MTR_CONFIG.AUX_MODE, from: 'config' };
  }

  function shouldEnableAux(){
    var mode = auxMode().mode;
    if(mode === 'off') return false;
    if(mode === 'always') return true;
    if(mode === 'inapp') return isInAppBrowser();
    /* 'mobile' と 'count'（シャドウ計測）は同じゲーティング（タッチ+iOS/Android）を使う */
    var touch = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    var os = mtrGetOS();
    return touch && (os === 'iOS' || os === 'Android');
  }

  function triggerShow(source){
    if(popupShown){
      window.__mtrDebugLine && window.__mtrDebugLine('triggerShow(' + source + ') blocked: already shown');
      return false;
    }
    if(!MtrFrequency.canShow()){
      window.__mtrDebugLine && window.__mtrDebugLine('triggerShow(' + source + ') blocked: suppressed');
      return false;
    }
    popupShown = true;
    shownEver = true;
    window.__mtrTriggerSource = source;
    if(onShow) onShow();
    return true;
  }

  /* ポップアップを出せないまま離脱したセッションの結末を1回だけ記録する。
     no_activation = 一度もタップが無く、◀が原理的に取れなかった層（残存穴の実測値）
     armed_no_back = タップはあったが戻る操作をせずに離脱（タブ閉じ・別リンク遷移等）
     suppressed    = 頻度制御で表示できなかった */
  function reportExitOutcome(){
    if(!inScope || exitReported || shownEver) return;
    exitReported = true;
    var param;
    if(!MtrFrequency.canShow()){
      param = 'suppressed';
    } else if(!hasUserActivation() && !cwActive){
      /* CloseWatcherが生きている間は◀を捕まえられたはずなので no_activation にしない。
         no_activation = backが本当に届かない状態のまま離脱した層のみ */
      param = 'no_activation';
    } else {
      param = 'armed_no_back';
    }
    window.__mtrDebugLine && window.__mtrDebugLine('exit_no_popup: ' + param);
    window.__mtrTrack && window.__mtrTrack('exit_no_popup', param);
  }

  /* アプリ内ブラウザ向け補助シグナル: 一定深さまで読み進めた後、短時間で上端側へ戻る動きを検知 */
  function setupAuxScrollUpTrigger(){
    var maxDepth = 0;
    var samples = [];
    var confirmTimer = null;
    var lastY = 0;

    function stat(y, upDistance){
      window.__mtrDebugStat && window.__mtrDebugStat('aux',
        'aux: depth=' + maxDepth + ' y=' + y + ' up=' + upDistance);
    }

    function handler(){
      /* iOSのラバーバンドでscrollYが負値になることがあるため0で下限を切る */
      var y = Math.max(0, window.scrollY || window.pageYOffset || 0);
      var t = Date.now();
      if(y > maxDepth) maxDepth = y;

      if(confirmTimer){
        /* 微小な揺り戻しではなく、明確に読み返しへ向かった場合のみ中止する */
        if(y - lastY >= MTR_CONFIG.AUX_CANCEL_DOWN_PX){
          clearTimeout(confirmTimer);
          confirmTimer = null;
          lastY = y;
          window.__mtrDebugLine && window.__mtrDebugLine('aux: canceled');
          stat(y, 0);
          return;
        }
        if(y < lastY) lastY = y;
        return;
      }
      lastY = y;

      samples.push({ y: y, t: t });
      while(samples.length && t - samples[0].t > MTR_CONFIG.AUX_UP_WINDOW_MS) samples.shift();

      if(maxDepth < MTR_CONFIG.AUX_MIN_DEPTH) { stat(y, 0); return; }
      if(y > MTR_CONFIG.AUX_TOP_ZONE) { stat(y, 0); return; }

      var upDistance = samples[0].y - y;
      stat(y, upDistance);
      if(upDistance >= MTR_CONFIG.AUX_UP_DISTANCE){
        window.__mtrDebugLine && window.__mtrDebugLine('aux: fire pending');
        confirmTimer = setTimeout(function(){
          confirmTimer = null;
          window.removeEventListener('scroll', handler);
          /* countモード（2026-07-30社内決定）: ポップアップは出さず、実態人数の
             シャドウ計測として scroll_up_signal のみ送信する。frequency（表示済み等）
             には一切書き込まないため、exit_no_popup の判定（shownEver）にも影響しない */
          if(auxMode().mode === 'count'){
            window.__mtrDebugLine && window.__mtrDebugLine('aux: fired (count)');
            window.__mtrTrack && window.__mtrTrack('scroll_up_signal', 'count');
            return;
          }
          window.__mtrDebugLine && window.__mtrDebugLine('aux: fired');
          triggerShow('scroll_up');
        }, MTR_CONFIG.AUX_CONFIRM_MS);
      }
    }
    window.addEventListener('scroll', handler, { passive: true });
    window.__mtrDebugLine && window.__mtrDebugLine('aux: armed');
  }

  function onPopState(){
    /* この行が出るかどうかが「戻る操作がページに届いているか」の唯一の判定基準。
       Chromiumが履歴エントリを読み飛ばした場合、popstateは発火せずこの行も出ない */
    window.__mtrDebugLine && window.__mtrDebugLine('popstate: state=' + JSON.stringify(history.state) + ' len=' + history.length);
    if(popupShown){
      window.__mtrTrack && window.__mtrTrack('popup_close', 'back');
      MtrFrequency.markClosed();
      popupShown = false;
      if(onClose) onClose();
      /* pushState({mtr:2})を積んだ back 経路でのみ history.back() が正しい。
         scroll_up/preview経路は history 操作をしていないため呼んではいけない */
      if(window.__mtrTriggerSource === 'back'){
        history.back();
      }
      return;
    }
    if(!triggerShow('back')){
      /* 抑制中などで表示できないときに素通りすると、armで積んだ履歴の分だけ
         戻る操作を握り潰すことになる（ユーザーには「◀が効かない」と見える）。
         そのまま本来の離脱を続行させる */
      window.__mtrDebugLine && window.__mtrDebugLine('back: 表示不可のため素通し');
      history.back();
      return;
    }
    history.pushState({ mtr: 2 }, '');
  }

  window.addEventListener('popstate', onPopState);
  window.addEventListener('pageshow', function(e){
    if(e.persisted){
      window.__mtrDebugLine && window.__mtrDebugLine('pageshow: bfcache');
      armed = false;
      popupShown = false;
    }
  });
  /* ◀でページを離れる直前に必ず走る。popstateが来なかった場合でも
     「戻る操作でページを離れた」ことの証跡になる */
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      window.__mtrDebugLine && window.__mtrDebugLine('visibilitychange: hidden');
      reportExitOutcome();
    }
  });
  window.addEventListener('pagehide', function(){
    window.__mtrDebugLine && window.__mtrDebugLine('pagehide');
    reportExitOutcome();
    if(popupShown){
      window.__mtrTrack && window.__mtrTrack('popup_close', 'leave');
      MtrFrequency.markClosed();
      popupShown = false;
    }
  });

  function isOutOfScope(){
    if(MTR_QUERY.preview) return false;

    var patterns = MTR_CONFIG.TARGET_URL_PATTERNS;
    if(patterns && patterns.length){
      var matched = false;
      for(var i = 0; i < patterns.length; i++){
        if(location.href.indexOf(patterns[i]) === 0){ matched = true; break; }
      }
      if(!matched) return true;
    }

    if(MTR_CONFIG.ROLLOUT_RATE < 1.0){
      var sid = mtrGetSid();
      var hash = 0;
      for(var j = 0; j < sid.length; j++) hash = (hash * 31 + sid.charCodeAt(j)) % 100;
      if(hash / 100 >= MTR_CONFIG.ROLLOUT_RATE) return true;
    }

    return false;
  }

  /* history方式（pushState/popstate）のトリガー登録。CloseWatcher非対応環境のフォールバック */
  function registerHistoryTriggers(){
    registerTrigger(armOnScroll);
    registerTrigger(armOnTimeout);
    registerTrigger(armOnFirstInteraction);

    if(!isArmGated()){
      /* 読込直後に先積みする（既定）。setTimeout(cb, 0)で次tickに回すのは、main.js側の
         デバッグパネル構築（window.__mtrDebugLine登録）を先に完了させてログを出すため */
      registerTrigger(function(cb){ setTimeout(cb, 0); });
    }
  }

  if(!MTR_QUERY.preview && !isOutOfScope()){
    inScope = true;

    /* loaderはタグ挿入のたびにpopup scriptを追加しうるため（src/loader.js）、
       page_view送信とlp_clickリスナー登録が多重実行されないようsentinelで防止する */
    if(!window.__mtrLpMetricsInit){
      window.__mtrLpMetricsInit = true;

      /* page_view: 配信対象ページのPV計測。isOutOfScope() 通過後に1回だけ送信する */
      setTimeout(function(){
        window.__mtrTrack && window.__mtrTrack('page_view', '');
      }, 0);

      /* lp_click: 配信対象ページ内のリンククリックを計測する。document への capture-phase
         委譲リスナーを1つだけ登録する。#mtr-popup-root 内（ポップアップのCTA等）は
         既存イベントで計測済みのため除外し、二重計上を防ぐ。dedupeはせず全クリックを計上する */
      document.addEventListener('click', function(e){
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if(!a || a.closest('#mtr-popup-root')) return;
        var rawHref = (a.getAttribute('href') || '').trim();
        if(!rawHref || rawHref === '#' || /^javascript:/i.test(rawHref)) return;
        window.__mtrTrack && window.__mtrTrack('lp_click', a.href.slice(0, 150));
      }, true);
    }

    /* activationの取得状況を実況表示する。スクロールだけでactivationが付くのかを
       実機で判別するために必要（付かなければhistory方式では◀が効かない） */
    /* main.js がデバッグパネル（__mtrDebugStat）を作るより先に走るため次tickに回す */
    setTimeout(reportActivation, 0);
    ['scroll', 'touchend', 'pointerup', 'click'].forEach(function(t){
      window.addEventListener(t, reportActivation, { passive: true });
    });

    if(navboostMode()){
      ['touchend', 'pointerup', 'click'].forEach(function(t){
        window.addEventListener(t, maybeNavboost, { passive: true });
      });
      /* reload変種のリロード後セッションでは、目視確認用に done を表示する */
      try {
        if(navboostMode() === 'reload' && sessionStorage.getItem('mtr_navboosted')){
          navboosted = true;
          setTimeout(function(){
            window.__mtrDebugLine && window.__mtrDebugLine('navboost: done');
          }, 0);
        }
      } catch(e) {}
    }

    if(cwSupported()){
      /* 対応環境ではCloseWatcherを第一手段とし、通常ブラウザではpushStateを行わない
         （履歴を汚さず、CW消費後の◀が自前の履歴エントリに当たる二重処理も避ける）。
         ただしUAで判定できるアプリ内ブラウザ（LINE/TikTok等）はホストアプリが◀を握り
         close requestをページへ届けないことが実測で判明（2026-07-27 LINE、DEC-20260727-005）。
         履歴を積んでおけばアプリの◀/‹が「クローズ」でなく「履歴戻り」になりpopstateが
         届く可能性があるため、in-appではhistory方式を併用する（?mtr_hybrid=off で無効化可）。
         CWとpopstateが両方動いてもpopupShownガードで二重表示はしない。
         次tickに回すのはデバッグパネル構築を待つため。CW作成失敗時はhistory方式へフォールバック */
      setTimeout(function(){
        var ok = setupCloseWatcher();
        var hybrid = ok && isInAppBrowser() && MTR_QUERY.hybrid !== 'off';
        if(hybrid) window.__mtrDebugLine && window.__mtrDebugLine('hybrid: cw+history');
        if(!ok || hybrid) registerHistoryTriggers();
      }, 0);
    } else {
      setTimeout(function(){
        window.__mtrDebugLine && window.__mtrDebugLine('cw: unsupported');
      }, 0);
      registerHistoryTriggers();
    }

    if(shouldEnableAux()){
      /* main.js のデバッグパネル構築より先に走ると 'aux: armed' が出せないため次tickに回す */
      setTimeout(setupAuxScrollUpTrigger, 0);
    }
  }

  return {
    setShowCallback: function(fn){ onShow = fn; },
    setCloseCallback: function(fn){ onClose = fn; },
    notifyClosed: function(){ popupShown = false; },
    registerTrigger: registerTrigger,
    isInAppBrowser: isInAppBrowser,
    uaFamily: uaFamily,
    hasUserActivation: hasUserActivation,
    auxMode: auxMode,
    armMode: function(){ return isArmGated() ? 'gated' : 'immediate'; }
  };
})();

var MTR_CSS_TEXT = `/* TETORI CSS欄用: styleタグは不要。リセットは #mtr-app に限定し、各クラスは mtr- 接頭辞にしています。 */
#mtr-app{
    --mtr-mint:#dcefe6; --mtr-mint-deep:#cfe9dd; --mtr-mint-light:#e3f4ec;
    --mtr-teal:#5bb9bd; --mtr-teal-light:#a9dbdc; --mtr-teal-dark:#4a9ea2;
    --mtr-orange:#f5a623; --mtr-green:#8ed64a; --mtr-green-dark:#79c23a;
    --mtr-cyan:#29b6e8; --mtr-blue:#3aa0e0;
    --mtr-tile-bg:linear-gradient(180deg,#f0f2f1,#e2e5e3);
    --mtr-tile-border:#cdd1ce;
    --mtr-text-dark:#2b6b78; --mtr-text-muted:#7c8c85; --mtr-text-light:#aab6b0;
  }
  #mtr-app,#mtr-app *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%;}
  #mtr-app{position:relative;width:100%;max-width:420px;min-height:100vh;margin:0 auto;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif;
    background:linear-gradient(180deg,var(--mtr-mint) 0%,var(--mtr-mint-deep) 40%,var(--mtr-mint-light) 100%);
    overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 24px rgba(0,0,0,.06);}

  /* ==================== 背景装飾 ==================== */
  .mtr-clouds{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
  .mtr-cloud{position:absolute;background:#fff;border-radius:50px;box-shadow:0 6px 0 rgba(255,255,255,.4);}
  .mtr-cloud::before,.mtr-cloud::after{content:"";position:absolute;background:#fff;border-radius:50%;}
  .mtr-c1{width:120px;height:38px;top:88px;left:-40px;opacity:.92;animation:mtr-drift1 78s ease-in-out infinite alternate;}
  .mtr-c1::before{width:60px;height:60px;top:-26px;left:18px;}
  .mtr-c1::after{width:46px;height:46px;top:-18px;left:62px;}
  .mtr-c2{width:140px;height:40px;top:140px;right:-50px;opacity:.9;animation:mtr-drift2 92s ease-in-out infinite alternate;}
  .mtr-c2::before{width:64px;height:64px;top:-30px;left:30px;}
  .mtr-c2::after{width:48px;height:48px;top:-18px;left:78px;}
  .mtr-c3{width:90px;height:30px;top:198px;left:56px;opacity:.85;animation:mtr-drift3 64s ease-in-out infinite alternate;}
  .mtr-c3::before{width:46px;height:46px;top:-20px;left:14px;}
  .mtr-c3::after{width:34px;height:34px;top:-12px;left:46px;}
  @keyframes mtr-drift1{from{transform:translateX(0)}to{transform:translateX(46px)}}
  @keyframes mtr-drift2{from{transform:translateX(0)}to{transform:translateX(-46px)}}
  @keyframes mtr-drift3{from{transform:translateX(0)}to{transform:translateX(34px)}}

  .mtr-ground{position:absolute;left:0;right:0;bottom:0;height:140px;pointer-events:none;z-index:1;}
  .mtr-ground svg{width:100%;height:100%;display:block;}

  .mtr-owl-bg{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:210px;
    opacity:0;transition:opacity .5s ease;pointer-events:none;z-index:1;}

  /* ==================== ヘッダー ==================== */
  header.mtr-header{position:relative;z-index:3;padding:14px 18px 4px;}
  .mtr-top-row{display:flex;align-items:center;gap:12px;}
  .mtr-close{font-size:24px;color:var(--mtr-text-muted);cursor:pointer;line-height:1;width:26px;}
  .mtr-stage-label{font-size:13px;font-weight:800;color:var(--mtr-text-dark);white-space:nowrap;}
  .mtr-bar{flex:1;height:14px;border-radius:8px;background:#cdd8d2;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.08);}
  .mtr-bar > i{display:block;height:100%;width:0;border-radius:8px;
    background:linear-gradient(90deg,var(--mtr-cyan),var(--mtr-teal));transition:width .35s ease;}
  .mtr-xp{text-align:right;color:var(--mtr-cyan);font-weight:800;margin-top:8px;font-size:18px;letter-spacing:.02em;}
  .mtr-title{text-align:center;color:var(--mtr-blue);font-weight:800;font-size:30px;margin:14px 0 6px;
    text-shadow:0 2px 0 rgba(255,255,255,.6);min-height:38px;}

  /* ==================== 盤面 ==================== */
  .mtr-board-wrap{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;align-items:center;padding:6px 16px 0;}
  .mtr-board{display:grid;gap:10px;width:100%;}
  .mtr-tile{
    position:relative;
    aspect-ratio:1/1;
    border-radius:14px;
    background:var(--mtr-tile-bg);
    border:1.5px solid var(--mtr-tile-border);
    box-shadow:0 3px 6px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.7) inset;
    cursor:pointer;
    overflow:hidden;
    transition:transform 0.15s ease, opacity 0.3s ease, box-shadow 0.15s ease;
  }
  .mtr-tile canvas{width:100%;height:100%;display:block;image-rendering:auto;}
  .mtr-tile.mtr-empty{background:transparent;border:none;box-shadow:none;cursor:default;}
  .mtr-tile.mtr-sel{
    border-color:#f5a623;
    box-shadow:0 0 0 3px #f5a623, 0 4px 12px rgba(245,166,35,0.3);
    transform:scale(1.06);
    z-index:2;
  }
  .mtr-tile.mtr-cleared{
    opacity:0;
    transform:scale(0.5) rotate(10deg);
    pointer-events:none;
  }
  /* ステージ1チュートリアル: 消せるペア2枚をオレンジ枠+呼吸グローで示す。
     点滅ではなくease-in-outの緩やかな往復にして煩さを避ける（2026-07-29） */
  .mtr-tile.mtr-tut{
    border-color:var(--mtr-orange);
    animation:mtr-tut-pulse 1.8s ease-in-out infinite;
  }
  @keyframes mtr-tut-pulse{
    0%,100%{box-shadow:0 0 0 2px rgba(245,166,35,.35), 0 3px 6px rgba(0,0,0,0.10);}
    50%{box-shadow:0 0 0 4px rgba(245,166,35,.85), 0 0 18px 4px rgba(245,166,35,.45);}
  }
  /* 選択中は既存のmtr-sel表示を優先しパルス停止 */
  .mtr-tile.mtr-tut.mtr-sel{animation:none;}
  @media (prefers-reduced-motion: reduce){
    .mtr-tile.mtr-tut{animation:none;box-shadow:0 0 0 3px rgba(245,166,35,.7), 0 3px 6px rgba(0,0,0,0.10);}
  }
  .mtr-tile.mtr-bad{animation:mtr-shake .32s;}
  @keyframes mtr-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}

  .mtr-stage1-prompt{position:relative;z-index:3;display:flex;align-items:center;justify-content:center;gap:8px;
    margin:4px 0 0;opacity:1;transition:opacity .3s ease;pointer-events:none;}
  .mtr-stage1-prompt.mtr-hidden{opacity:0;}
  .mtr-professor-img{width:80px;height:80px;}
  .mtr-stage1-prompt span{color:var(--mtr-blue);font-weight:900;font-size:36px;letter-spacing:.06em;}

  .mtr-hint{position:absolute;z-index:3;bottom:10px;left:0;right:0;text-align:center;color:#8aa;font-size:12px;pointer-events:none;}

  /* ステージクリア トースト */
  .mtr-toast{position:absolute;z-index:15;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none;}
  .mtr-toast.mtr-show{display:flex;animation:mtr-fade .3s ease;}
  .mtr-toast .mtr-pill{background:rgba(255,255,255,.95);color:var(--mtr-orange);font-weight:900;font-size:28px;
    padding:18px 34px;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,.12);}
  @keyframes mtr-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

  /* ==================== 初動: オーバーレイ（v3d） ==================== */
  .mtr-overlay{
    position:absolute;inset:0;z-index:30;
    background:transparent;
    display:flex;align-items:center;justify-content:center;padding:24px;
    opacity:0;pointer-events:none;
    transition:opacity .4s ease;
  }
  .mtr-overlay.mtr-show{opacity:1;pointer-events:auto;}

  .mtr-ov-card{
    width:100%;max-width:340px;
    background:#f7faf8;
    border-radius:22px;padding:38px 28px 30px;text-align:center;
    box-shadow:0 28px 70px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.14) inset;
    animation:mtr-card-in .45s cubic-bezier(.22,.61,.36,1) both;
  }
  @keyframes mtr-card-in{
    from{opacity:0;transform:scale(.88) translateY(20px);}
    to{opacity:1;transform:none;}
  }
  .mtr-fv-kv-sub{
    margin:0 0 10px;font-size:14px;font-weight:600;letter-spacing:.06em;
    color:var(--mtr-text-muted);
    animation:mtr-blur-in 1.1s ease .1s both;
  }
  @keyframes mtr-blur-in{
    from{filter:blur(8px);opacity:.15;}
    to{filter:blur(0);opacity:1;}
  }
  .mtr-fv-kv-main{
    margin:0;font-size:54px;font-weight:900;line-height:1.08;
    color:var(--mtr-text-dark);
    animation:mtr-fade-up .5s ease .45s both;
  }
  .mtr-fv-kv-main .accent{color:var(--mtr-green);display:block;font-size:46px;}
  @keyframes mtr-fade-up{
    from{opacity:0;transform:translateY(12px);}
    to{opacity:1;transform:none;}
  }
  .mtr-fv-copy{
    margin:18px 0 22px;font-size:15px;line-height:1.75;color:var(--mtr-text-muted);
    animation:mtr-fade-up .5s ease .75s both;
  }
  .mtr-fv-divider{border:none;border-top:1px solid #dde8e2;margin:0 0 14px;}
  .mtr-fv-badge{margin:0 0 20px;font-size:11px;color:var(--mtr-text-light);letter-spacing:.04em;}
  .mtr-ov-cta{
    width:100%;border:none;cursor:pointer;
    background:var(--mtr-green);color:#fff;font-family:inherit;font-weight:800;font-size:18px;
    padding:17px;border-radius:14px;
    box-shadow:0 5px 0 var(--mtr-green-dark);
    display:flex;align-items:center;justify-content:center;gap:10px;
    animation:mtr-fade-up .5s ease .95s both;
  }
  .mtr-ov-cta:active{transform:translateY(3px);box-shadow:0 2px 0 var(--mtr-green-dark);}
  .mtr-play-icon{
    flex-shrink:0;width:0;height:0;border-style:solid;
    border-width:8px 0 8px 14px;border-color:transparent transparent transparent #fff;
  }

  /* ==================== 最終CTA（結果画面） ==================== */
  .mtr-result{position:absolute;inset:0;z-index:20;background:linear-gradient(180deg,var(--mtr-mint),#eaf6ef);
    display:none;flex-direction:column;align-items:center;justify-content:center;padding:30px 26px;text-align:center;overflow:auto;}
  .mtr-result.mtr-show{display:flex;animation:mtr-fade .4s ease;}
  .mtr-result-owl{width:120px;margin-bottom:8px;}
  .mtr-heading{margin:0 0 18px;color:var(--mtr-text-dark);font-size:24px;font-weight:800;line-height:1.4;}
  .mtr-btn-green{width:100%;max-width:330px;border:none;cursor:pointer;background:var(--mtr-green);color:#fff;
    font-weight:800;font-size:18px;padding:16px;border-radius:14px;box-shadow:0 4px 0 var(--mtr-green-dark);margin-top:16px;
    display:block;text-align:center;text-decoration:none;box-sizing:border-box;}
  .mtr-btn-green:active{transform:translateY(2px);box-shadow:0 2px 0 var(--mtr-green-dark);}
  .mtr-applist{background:#fff;border-radius:16px;padding:14px 16px;width:100%;max-width:330px;text-align:left;
    box-shadow:0 4px 12px rgba(0,0,0,.06);margin-top:16px;}
  .mtr-applist .mtr-applist-title{font-weight:800;color:var(--mtr-teal-dark);font-size:13px;margin-bottom:8px;}
  .mtr-applist ul{margin:0;padding:0;list-style:none;}
  .mtr-applist li{display:flex;align-items:center;gap:8px;color:#5a6b62;font-size:14px;padding:4px 0;}
  .mtr-applist li::before{content:"・";color:var(--mtr-text-muted);font-weight:900;}
  .mtr-store-buttons{display:flex;gap:10px;width:100%;max-width:330px;margin-top:14px;}
  .mtr-store-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
    border:none;cursor:pointer;padding:14px 10px;border-radius:12px;font-weight:700;font-size:14px;color:#fff;
    box-shadow:0 3px 8px rgba(0,0,0,.15);text-decoration:none;}
  .mtr-store-btn:active{transform:translateY(1px);box-shadow:0 1px 4px rgba(0,0,0,.15);}
  .mtr-store-ios{background:#1a1a1a;}
  .mtr-store-android{background:#01875f;}
  .mtr-link{display:block;margin-top:14px;color:var(--mtr-text-light);font-size:12px;cursor:pointer;text-decoration:underline;}
  .mtr-open-note{margin-top:10px;font-size:11px;color:var(--mtr-text-light);line-height:1.6;}

  /* ==================== ここから追記: ポップアップラッパー ==================== */
  #mtr-popup-root{
    position:fixed;inset:0;z-index:2147483000;overflow:auto;
    background:rgba(0,0,0,.45);
    backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
    display:flex;flex-direction:column;
  }
  /* main.js が innerHTML 用に挟む中間div。高さがautoのままだと
     #mtr-app の min-height:100% が解決できず（親の高さが不定）コンテンツ分しか伸びない */
  /* カード余白。zoom補正コンテナ内なので端末実寸で一定（rootに置くとno-metaページで縮む） */
  #mtr-popup-root > div{
    display:flex;flex-direction:column;flex:1 0 auto;width:100%;
    padding:24px 14px;box-sizing:border-box;
  }
  #mtr-popup-root #mtr-app{
    /* 100%は上のflexで担保。加えてviewport基準の下限を持たせる。
       dvhは動的ツールバーを除いた実表示高さ。非対応webview用にvhをフォールバックに残す */
    min-height:calc(100vh - 48px);
    min-height:calc(100dvh - 48px);
    flex:1 0 auto;
    margin:0 auto;
    border-radius:22px;box-shadow:0 12px 40px rgba(0,0,0,.35);
  }
  /* 初動オーバーレイ(z-index:30)が全面を覆い、ヘッダー内の×(z-index:3)が押せなくなるため
     ポップアップ配信時のみ×ボタンだけをオーバーレイより上に出す。
     ヘッダー全体を上げると低身長画面でヘッダー文字がカードに重なるため×単体に限定（2026-07-29 レビュー指摘対応）。
     ヘッダーの z-index:3 が作るスタッキングコンテキストに×が閉じ込められないよう auto に戻す */
  #mtr-popup-root header.mtr-header{z-index:auto;}
  #mtr-popup-root .mtr-close{position:relative;z-index:31;}

  /* ==================== キャッチ会話アニメ ==================== */
  /* 旧初動カードは文言・DOMを保ったまま非表示にし、キャッチアニメと共存させる。 */
  #mtr-popup-root #mtr-overlay{display:none;}

  #mtr-catch-overlay{
    position:absolute;inset:0;z-index:29;
    background:radial-gradient(circle at 50% 32%, #fffdf7 0%, #fff6e9 55%, #fbefdd 100%);
    overflow:hidden;cursor:pointer;
    opacity:1;transition:opacity .25s ease;
  }
  #mtr-catch-overlay .cc-shadow{
    position:absolute;bottom:17%;width:30%;height:3.2%;border-radius:50%;
    background:radial-gradient(ellipse at center, rgba(74,63,53,.35) 0%, rgba(74,63,53,.14) 55%, rgba(74,63,53,0) 100%);
    opacity:0;
  }
  #mtr-catch-overlay .cc-fukuta-shadow{left:8%;}
  #mtr-catch-overlay .cc-aibou-shadow{right:8%;}

  #mtr-catch-overlay .cc-char{
    /* 注記とキャラ足元が重ならないよう、カード下部に余白を確保する。 */
    position:absolute;bottom:14%;width:clamp(120px,42vw,190px);
    opacity:0;transform-origin:50% 90%;
  }
  #mtr-catch-overlay .cc-fukuta{width:clamp(147px,51.6vw,233px);}
  #mtr-catch-overlay .cc-fukuta{left:2%;}
  #mtr-catch-overlay .cc-aibou{right:2%;}
  #mtr-catch-overlay .cc-char img{width:100%;height:auto;display:block;}

  #mtr-catch-overlay .cc-notes{position:absolute;inset:0;pointer-events:none;z-index:3;}
  #mtr-catch-overlay .cc-note{
    position:absolute;font-size:clamp(22px,7vw,32px);font-weight:900;opacity:0;
  }

  #mtr-catch-overlay .cc-bubble{
    position:absolute;top:9%;left:50%;transform:translateX(-50%) scale(.6);
    width:84%;max-width:340px;box-sizing:border-box;
    background:#fffdf7;border:3px solid #4a3f35;border-radius:22px;
    padding:clamp(14px,4.6vw,22px) clamp(14px,4.8vw,20px);
    font-size:clamp(16px,5vw,20.5px);font-weight:900;color:#4a3f35;
    line-height:1.5;text-align:center;
    word-break:keep-all;line-break:strict;overflow-wrap:normal;
    opacity:0;z-index:5;
    box-shadow:0 6px 18px rgba(0,0,0,.18);
    transition:opacity .2s ease, transform .28s cubic-bezier(.34,1.56,.64,1);
  }
  #mtr-catch-overlay .cc-bubble.show{opacity:1;transform:translateX(-50%) scale(1);}
  #mtr-catch-overlay #cc-bubble1, #mtr-catch-overlay #cc-bubble3{border:2px solid #7cb8ff;}
  #mtr-catch-overlay #cc-bubble2, #mtr-catch-overlay #cc-bubble4{border:2px solid #ff9fc0;}
  #mtr-catch-overlay .cc-bubble .cc-tail{
    position:absolute;bottom:-12px;width:22px;height:22px;background:#fffdf7;
    border-right:3px solid #4a3f35;border-bottom:3px solid #4a3f35;
    border-radius:0 0 6px 0;transform:rotate(45deg);z-index:-1;
  }
  #mtr-catch-overlay .cc-tail-left{left:14%;}
  #mtr-catch-overlay .cc-tail-right{right:14%;}

  #mtr-catch-overlay .cc-note-disclaimer{
    position:absolute;bottom:2%;left:50%;transform:translateX(-50%);
    width:84%;text-align:center;font-size:clamp(9.5px,2.8vw,12px);color:#6b5e52;
    line-height:1.4;word-break:keep-all;line-break:strict;overflow-wrap:normal;
    opacity:0;transition:opacity .3s ease;z-index:5;
  }
  #mtr-catch-overlay .cc-note-disclaimer.show{opacity:1;}

  #mtr-catch-overlay .cc-skiphint{
    position:absolute;top:2%;left:50%;transform:translateX(-50%);
    font-size:11px;color:#a9998a;opacity:.85;z-index:8;
  }

  #mtr-catch-overlay.cc-gate-mode{cursor:default;}
  #mtr-catch-overlay.cc-gate-mode > *:not(#cc-note-disclaimer):not(.cc-gate-copy):not(.cc-gate){display:none;}
  #mtr-catch-overlay .cc-gate-copy{
    position:absolute;left:50%;z-index:10;transform:translateX(-50%);
    width:min(88vw,340px);text-align:center;color:#4a3f35;line-height:1.5;
  }
  #mtr-catch-overlay .cc-gate-copy-top{
    bottom:calc(50% + 60px);font-size:clamp(20px,6vw,24px);font-weight:900;
  }
  #mtr-catch-overlay .cc-gate-copy-btm{
    top:50%;transform:translate(-50%,-50%);
    font-size:clamp(16px,4.8vw,19px);font-weight:700;
  }
  #mtr-catch-overlay .cc-gate-copy span{
    opacity:0;display:inline-block;
    animation:cc-type-in .18s ease-out both;
  }
  @keyframes cc-type-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  #mtr-catch-overlay .cc-gate{
    position:absolute;left:50%;bottom:14%;top:auto;z-index:10;
    min-width:190px;padding:16px 26px;border:0;border-radius:999px;
    background:var(--mtr-green);color:#fff;font-family:inherit;font-size:24px;font-weight:900;line-height:1.2;
    box-shadow:0 6px 0 var(--mtr-green-dark),0 10px 22px rgba(71,126,45,.28);
    transform:translateX(-50%);cursor:pointer;pointer-events:none;
    opacity:0;
    animation:cc-gate-pop .5s cubic-bezier(.34,1.56,.64,1) 2.8s both, cc-gate-poyon 2.6s ease-in-out 3.6s infinite;
  }
  #mtr-catch-overlay .cc-gate:active{
    transform:translateX(-50%) translateY(4px);
    box-shadow:0 2px 0 var(--mtr-green-dark),0 6px 14px rgba(71,126,45,.24);
  }
  @keyframes cc-gate-pop{
    from{opacity:0;transform:translateX(-50%) scale(.3);}
    60%{opacity:1;transform:translateX(-50%) scale(1.12);}
    to{opacity:1;transform:translateX(-50%) scale(1);}
  }
  @keyframes cc-gate-poyon{
    0%,100%{transform:translateX(-50%) scale(1);}
    10%{transform:translateX(-50%) scale(1.08,.92);}
    20%{transform:translateX(-50%) scale(.95,1.06);}
    30%{transform:translateX(-50%) scale(1.03,.98);}
    40%{transform:translateX(-50%) scale(1);}
  }
  @media (prefers-reduced-motion: reduce){
    #mtr-catch-overlay .cc-gate{animation:none;opacity:1;transition:none;}
    #mtr-catch-overlay .cc-gate-copy span{animation:none;opacity:1;}
  }

  /* キャラの演技クラス（純CSS） */
  #mtr-catch-overlay .cc-char.cc-visible{opacity:1;}
  .cc-char.cc-enter-left{animation:cc-pop-in-left .35s cubic-bezier(.34,1.56,.64,1) both;}
  .cc-char.cc-enter-right{animation:cc-pop-in-right .35s cubic-bezier(.34,1.56,.64,1) both;}
  @keyframes cc-pop-in-left{from{opacity:0;transform:translateX(-18%) scale(.6);}to{opacity:1;transform:translateX(0) scale(1);}}
  @keyframes cc-pop-in-right{from{opacity:0;transform:translateX(18%) scale(.6);}to{opacity:1;transform:translateX(0) scale(1);}}
  .cc-shadow.cc-enter{animation:cc-fade-in .3s ease both;}
  @keyframes cc-fade-in{from{opacity:0;}to{opacity:1;}}

  .cc-fukuta.cc-swing{animation:cc-swing .36s ease-in-out infinite;}
  @keyframes cc-swing{0%,100%{transform:rotate(-6deg) translateY(0);}25%{transform:rotate(-2deg) translateY(-2%);}50%{transform:rotate(6deg) translateY(0);}75%{transform:rotate(2deg) translateY(-2%);}}

  .cc-fukuta.cc-tilt-toward{transform:rotate(5deg);transition:transform .4s ease-out;}
  .cc-fukuta.cc-puzzled{animation:cc-puzzle .45s cubic-bezier(.34,1.56,.64,1) both;}
  @keyframes cc-puzzle{0%{transform:rotate(0deg);}60%{transform:rotate(-7deg);}100%{transform:rotate(-5deg);}}
  .cc-fukuta.cc-neutral{transform:rotate(0deg);transition:transform .3s ease;}

  .cc-aibou.cc-lean{animation:cc-lean .35s ease-out forwards, cc-bounce-talk .2s ease-in-out .35s infinite;}
  @keyframes cc-lean{from{transform:translateX(0) scale(1);}to{transform:translateX(4%) scale(1.06);}}
  @keyframes cc-bounce-talk{0%,100%{transform:translateX(4%) scale(1.06,1);}50%{transform:translateX(4%) scale(1.092,.996);}}
  .cc-aibou.cc-settle{animation:cc-settle .3s ease-in-out forwards;}
  @keyframes cc-settle{from{transform:translateX(4%) scale(1.06);}to{transform:translateX(0) scale(1);}}
  .cc-aibou.cc-nod{animation:cc-nod .55s ease-in-out both;}
  @keyframes cc-nod{0%{transform:rotate(0);}30%{transform:rotate(7deg);}55%{transform:rotate(-2deg);}75%{transform:rotate(4deg);}100%{transform:rotate(0);}}
  .cc-aibou.cc-hop{animation:cc-hop .3s ease-out .5s 2;}
  @keyframes cc-hop{0%,100%{transform:translateY(0) scale(1,1);}40%{transform:translateY(-12%) scale(.96,1.06);}75%{transform:translateY(0) scale(1.05,.94);}}

  .cc-note.cc-float1{animation:cc-note-rise1 1.2s ease-out both;}
  .cc-note.cc-float2{animation:cc-note-rise2 1.2s ease-out both;}
  .cc-note.cc-float3{animation:cc-note-rise3 1.2s ease-out both;}
  @keyframes cc-note-rise1{
    0%{opacity:0;transform:translate(0,0);}
    25%{opacity:1;transform:translate(6px,-24px);}
    60%{transform:translate(-6px,-48px);}
    100%{opacity:0;transform:translate(0,-70px);}
  }
  @keyframes cc-note-rise2{
    0%{opacity:0;transform:translate(0,0);}
    25%{opacity:1;transform:translate(-6px,-24px);}
    60%{transform:translate(6px,-48px);}
    100%{opacity:0;transform:translate(0,-70px);}
  }
  @keyframes cc-note-rise3{
    0%{opacity:0;transform:translate(0,0);}
    25%{opacity:1;transform:translate(6px,-24px);}
    60%{transform:translate(-6px,-48px);}
    100%{opacity:0;transform:translate(0,-70px);}
  }

  /* ブリッジA: キャラ退避→パッチ紹介→お手本消し */
  #mtr-catch-overlay .cc-char.cc-bridge-out-left{transform:translateX(-30%) scale(.55);transition:transform .3s ease-out;}
  #mtr-catch-overlay .cc-char.cc-bridge-out-right{transform:translateX(30%) scale(.55);transition:transform .3s ease-out;}
  #mtr-catch-overlay .cc-shadow.cc-bridge-fade{opacity:0;transition:opacity .3s ease-out;}

  #mtr-catch-overlay .cc-bridge-patch{
    position:absolute;top:50%;left:50%;width:96px;z-index:6;
    transform:translate(-50%,-50%) scale(.3);opacity:0;
    transition:transform .32s cubic-bezier(.34,1.56,.64,1), opacity .25s ease;
  }
  #mtr-catch-overlay .cc-bridge-patch.show{opacity:1;}

  #mtr-catch-overlay .cc-bridge-text{
    position:absolute;top:12%;left:50%;transform:translateX(-50%);
    width:84%;box-sizing:border-box;text-align:center;
    font-size:clamp(15px,4.6vw,19px);font-weight:900;color:#4a3f35;
    line-height:1.4;word-break:keep-all;line-break:strict;overflow-wrap:normal;
    opacity:0;transition:opacity .25s ease;z-index:6;
  }
  #mtr-catch-overlay .cc-bridge-text.show{opacity:1;}
`;
var MTR_HTML_TEXT = `<!-- TETORI HTML欄用: styleタグ/scriptタグは入れず、このHTMLだけ貼り付け -->
<div id="mtr-app">
  <!-- 背景 -->
  <div class="mtr-clouds"><div class="mtr-cloud mtr-c1"></div><div class="mtr-cloud mtr-c2"></div><div class="mtr-cloud mtr-c3"></div></div>
  <img class="mtr-owl-bg" id="mtr-owl-bg" src="/images/mm/fukuta_hund.png" alt="ふくた" aria-hidden="true">
  <div class="mtr-ground">
    <svg viewBox="0 0 420 140" preserveAspectRatio="none">
      <path d="M0,70 Q60,40 120,60 T260,55 T420,68 L420,140 L0,140 Z" fill="#bfe08a"/>
      <path d="M0,95 Q80,75 180,90 T420,92 L420,140 L0,140 Z" fill="#a9d472"/>
      <g transform="translate(34,52)"><ellipse cx="0" cy="0" rx="26" ry="24" fill="#9cd06a"/><rect x="-4" y="18" width="8" height="22" fill="#cdbd8e"/></g>
      <g transform="translate(384,58)"><ellipse cx="0" cy="0" rx="22" ry="20" fill="#9cd06a"/><rect x="-4" y="14" width="8" height="20" fill="#cdbd8e"/></g>
      <g transform="translate(22,116)"><rect x="-4" y="0" width="8" height="12" rx="3" fill="#fff"/><ellipse cx="0" cy="0" rx="11" ry="8" fill="#ef8a8a"/><circle cx="-3" cy="-2" r="2" fill="#fff"/><circle cx="3" cy="1" r="1.6" fill="#fff"/></g>
      <g transform="translate(398,118)"><rect x="-4" y="0" width="8" height="12" rx="3" fill="#fff"/><ellipse cx="0" cy="0" rx="11" ry="8" fill="#ef8a8a"/><circle cx="2" cy="-2" r="2" fill="#fff"/><circle cx="-3" cy="1" r="1.6" fill="#fff"/></g>
    </svg>
  </div>

  <!-- ヘッダー -->
  <header class="mtr-header">
    <div class="mtr-top-row">
      <div class="mtr-close" id="mtr-close" title="閉じる（モック）">✕</div>
      <div class="mtr-bar"><i id="mtr-bar-fill"></i></div>
      <div class="mtr-stage-label" id="mtr-stage-label">ステージ 1/3</div>
    </div>
    <div class="mtr-xp"><span>★</span> <span id="mtr-xp-val">0</span> XP獲得</div>
    <div class="mtr-title" id="mtr-title">全消ししよう！</div>
  </header>

  <!-- 盤面 -->
  <div class="mtr-board-wrap">
    <div class="mtr-board" id="mtr-board"></div>
    <div class="mtr-stage1-prompt" id="mtr-stage1-prompt">
      <img src="/images/mm/fukuta_professor.png" alt="ふくた教授" class="mtr-professor-img">
      <span>消そう</span>
    </div>
  </div>
  <div class="mtr-hint">同じ向きの縞を2枚タップ → ペアで消える</div>

  <!-- ステージクリア トースト -->
  <div class="mtr-toast" id="mtr-toast"><div class="mtr-pill" id="mtr-toast-text">ステージクリア！</div></div>

  <!-- 初動: オーバーレイ（v3d） -->
  <div class="mtr-overlay" id="mtr-overlay">
    <div class="mtr-ov-card">
      <p class="mtr-fv-kv-sub">みえてきた？</p>
      <h2 class="mtr-fv-kv-main">
        視力改善<span class="accent">ゲーム</span>
      </h2>
      <p class="mtr-fv-copy">
        遊んでたら、<br>目が鍛えられてた。
      </p>
      <hr class="mtr-fv-divider">
      <p class="mtr-fv-badge">インストール不要・無料・その場で始められる</p>
      <button class="mtr-ov-cta" id="mtr-playbtn">
        <span class="mtr-play-icon"></span>1日3分、試してみる
      </button>
    </div>
  </div>

  <!-- 最終CTA: OS別に1つだけ表示（game.jsで出し分け）。
       in-appブラウザ対策で本物のaタグ+HTTPSストアURL必須（JS遷移だとストアアプリへの橋渡し無効・2026-07-29） -->
  <div class="mtr-result" id="mtr-result">
    <img class="mtr-result-owl" id="mtr-owl-result" src="/images/mm/fukuta_fire.png" alt="怒りふくた">
    <div class="mtr-heading">もっと続けるなら<br><b>無料</b>のミエトレ</div>
    <div class="mtr-applist">
      <div class="mtr-applist-title">こんな方におすすめ</div>
      <ul>
        <li>見えづらくてイライラする</li>
        <li>最近、急にぼやける</li>
        <li>つい、スマホを離してみてしまう</li>
      </ul>
    </div>
    <a class="mtr-btn-green" id="mtr-search-cta" href="https://www.google.com/search?q=%E3%83%9F%E3%82%A8%E3%83%88%E3%83%AC+%E3%82%A2%E3%83%97%E3%83%AA">ミエトレで検索</a>
    <div class="mtr-store-buttons">
      <a class="mtr-store-btn mtr-store-ios" id="mtr-dl-ios" href="https://apps.apple.com/jp/app/id6738352362">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        App Store で入手
      </a>
      <a class="mtr-store-btn mtr-store-android" id="mtr-dl-android" href="https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&amp;hl=ja">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M3 13.65v-3.3c0-.6.45-1.1 1.05-1.15h.1c.6 0 1.1.45 1.15 1.05v3.5c0 .6-.45 1.1-1.05 1.15h-.1c-.6 0-1.1-.45-1.15-1.05v-.2zm14.7-7.45l1.15-2.1c.05-.15 0-.3-.1-.35-.15-.05-.3 0-.35.1L17.2 6c-.9-.4-1.9-.65-3-.65h-.4c-1.1 0-2.1.25-3 .65L9.6 3.85c-.1-.15-.25-.2-.4-.1-.1.05-.15.2-.1.35l1.15 2.1c-2.05 1.1-3.4 3.15-3.5 5.5h14.5c-.1-2.35-1.5-4.4-3.55-5.5zM10.5 8.8c-.35 0-.6-.25-.6-.6s.25-.6.6-.6.6.25.6.6-.25.6-.6.6zm3.4 0c-.35 0-.6-.25-.6-.6s.25-.6.6-.6.6.25.6.6-.25.6-.6.6zM7.25 21.15V13.2c0-.2.15-.35.35-.35h8.8c.2 0 .35.15.35.35v7.95c0 .6-.45 1.1-1.05 1.15h-.1c-.6 0-1.1-.45-1.15-1.05V14.8h-1v6.45c0 .6-.45 1.1-1.05 1.15h-.1c-.6 0-1.1-.45-1.15-1.05V14.8h-1v6.45c0 .6-.45 1.1-1.05 1.15h-.1c-.6 0-1.1-.45-1.15-1.05v-.2zm12.55-7.5v-3.3c0-.6.45-1.1 1.05-1.15h.1c.6 0 1.1.45 1.15 1.05v3.5c0 .6-.45 1.1-1.05 1.15h-.1c-.6 0-1.1-.45-1.15-1.05v-.2z"/></svg>
        Google Play で入手
      </a>
    </div>
    <div class="mtr-open-note" id="mtr-open-note">開かない場合は、Safari や Chrome などのブラウザでこのページを開いてください</div>
    <div class="mtr-link" id="mtr-replay-link">もう一度あそぶ</div>
  </div>
</div>
`;
/* TETORI JavaScript欄用: scriptタグは不要。HTML挿入後に自動初期化します。 */
(function(){
  "use strict";

  function initMietoreOnramp(){
    const root = document.getElementById('mtr-app');
    if(!root || root.dataset.mtrReady === '1') return false;
    root.dataset.mtrReady = '1';

    /* ===== ステージ定義（難易度上昇） ===== */
    const STAGES = [
      { cols:2, rows:2, holeCenter:false, orientations:[0,90],            freqs:[0.05] },
      { cols:3, rows:3, holeCenter:true,  orientations:[0,45,90,135],     freqs:[0.07,0.10] },
      { cols:4, rows:4, holeCenter:false, orientations:[0,30,60,90,120,150], freqs:[0.10,0.12] },
    ];
    const XP_PER_PAIR = 3;
    const TILE_PX = 200;

    /* ===== ふくた（フクロウ）SVG ===== */
    function fukutaSVG(id, cfg){
      const bodyTop = cfg.bodyTop, bodyBottom = cfg.bodyBottom, face = cfg.face,
            wing = cfg.wing, foot = cfg.foot, beak = cfg.beak || '#f5a623',
            cheek = cfg.cheek !== false, tilt = cfg.tilt || 0;
      return `
        <defs>
          <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${bodyTop}"/>
            <stop offset="1" stop-color="${bodyBottom}"/>
          </linearGradient>
        </defs>
        <g transform="rotate(${tilt} 100 110)">
          <ellipse cx="82" cy="176" rx="12" ry="7" fill="${foot}"/>
          <ellipse cx="118" cy="176" rx="12" ry="7" fill="${foot}"/>
          <path d="M40 108 Q22 130 34 162 Q52 150 50 116 Z" fill="${wing}"/>
          <path d="M160 108 Q178 130 166 162 Q148 150 150 116 Z" fill="${wing}"/>
          <path d="M58 66 Q48 28 78 40 Q64 54 72 70 Z" fill="url(#${id}-body)"/>
          <path d="M142 66 Q152 28 122 40 Q136 54 128 70 Z" fill="url(#${id}-body)"/>
          <ellipse cx="100" cy="120" rx="62" ry="58" fill="url(#${id}-body)"/>
          <path d="M74 150 Q100 158 126 150" stroke="${bodyBottom}" stroke-width="3" fill="none" opacity="0.2" stroke-linecap="round"/>
          <path d="M78 160 Q100 167 122 160" stroke="${bodyBottom}" stroke-width="3" fill="none" opacity="0.2" stroke-linecap="round"/>
          <path d="M82 169 Q100 175 118 169" stroke="${bodyBottom}" stroke-width="3" fill="none" opacity="0.15" stroke-linecap="round"/>
          <circle cx="76" cy="106" r="28" fill="${face}"/>
          <circle cx="124" cy="106" r="28" fill="${face}"/>
          ${cheek ? `<ellipse cx="56" cy="118" rx="8" ry="5" fill="#ffb5b5" opacity="0.5"/><ellipse cx="144" cy="118" rx="8" ry="5" fill="#ffb5b5" opacity="0.5"/>` : ''}
          <circle cx="76" cy="108" r="13" fill="#2b2b2b"/>
          <circle cx="124" cy="108" r="13" fill="#2b2b2b"/>
          <circle cx="71" cy="103" r="4" fill="#fff"/>
          <circle cx="119" cy="103" r="4" fill="#fff"/>
          <circle cx="80" cy="102" r="2" fill="#fff"/>
          <circle cx="128" cy="102" r="2" fill="#fff"/>
          <path d="M62 96 Q76 88 90 96" stroke="url(#${id}-body)" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M110 96 Q124 88 138 96" stroke="url(#${id}-body)" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M100 116 Q112 124 104 136 Q100 140 96 136 Q88 124 100 116 Z" fill="${beak}"/>
        </g>`;
    }
    /* ===== ガボールパッチ描画 ===== */
    function drawGabor(canvas, orientDeg, freq, phase){
      const N = TILE_PX;
      canvas.width = N; canvas.height = N;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(N, N);
      const d = img.data;
      const theta = orientDeg * Math.PI / 180;
      const ct = Math.cos(theta), st = Math.sin(theta);
      const sigma = N * 0.28;
      const cx = N/2, cy = N/2;
      const k = 2 * Math.PI * freq;
      for(let y=0; y<N; y++){
        for(let x=0; x<N; x++){
          const dx = x - cx, dy = y - cy;
          const gauss = Math.exp(-(dx*dx + dy*dy) / (2*sigma*sigma));
          const xt = dx*ct + dy*st;
          const lum = 0.5 + 0.5 * gauss * Math.cos(k*xt + phase);
          const v = Math.round(lum * 255);
          const i = (y*N + x) * 4;
          d[i]=v; d[i+1]=v; d[i+2]=v; d[i+3]=255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    /* ===== オーバーレイ: サンプルパッチ ===== */
    function buildOverlayPatches(){
      const wrap = document.getElementById('mtr-ov-patches');
      [{orient:0,freq:0.10},{orient:90,freq:0.10},{orient:45,freq:0.11}].forEach(s => {
        const div = document.createElement('div');
        div.className = 'mtr-ov-patch';
        const cv = document.createElement('canvas');
        drawGabor(cv, s.orient, s.freq, Math.random()*Math.PI*2);
        div.appendChild(cv);
        wrap.appendChild(div);
      });
    }
    /* ===== 要素参照 ===== */
    const boardEl    = document.getElementById('mtr-board');
    const barFill    = document.getElementById('mtr-bar-fill');
    const xpValEl    = document.getElementById('mtr-xp-val');
    const titleEl    = document.getElementById('mtr-title');
    const stageLbl   = document.getElementById('mtr-stage-label');
    const owlBgEl    = document.getElementById('mtr-owl-bg');
    const resultEl   = document.getElementById('mtr-result');
    const overlayEl  = document.getElementById('mtr-overlay');
    const toastEl    = document.getElementById('mtr-toast');
    const toastText  = document.getElementById('mtr-toast-text');

    /* ===== 状態 ===== */
    let tiles = [];
    let selectedIdx = -1;
    let lock = false;
    let totalPairs = 0;
    let clearedPairs = 0;
    let stageIndex = 0;
    let totalXP = 0;

    function shuffle(a){
      for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
      return a;
    }

    function buildKinds(stage, pairCount){
      const combos = [];
      for(const f of stage.freqs) for(const o of stage.orientations) combos.push({orient:o, freq:f});
      shuffle(combos);
      const out = [];
      for(let i=0;i<pairCount;i++) out.push(combos[i % combos.length]);
      return out;
    }

    function loadStage(idx){
      stageIndex = idx;
      const stage = STAGES[idx];
      const cells = stage.cols * stage.rows;
      const holeAt = stage.holeCenter ? Math.floor(cells/2) : -1;
      const playable = cells - (holeAt >= 0 ? 1 : 0);
      totalPairs = playable / 2;
      clearedPairs = 0; selectedIdx = -1; lock = false;

      boardEl.style.gridTemplateColumns = `repeat(${stage.cols}, 1fr)`;
      boardEl.style.maxWidth = Math.min(360, stage.cols * 92) + 'px';
      boardEl.innerHTML = '';
      tiles = [];

      const kinds = buildKinds(stage, totalPairs);
      let deck = [];
      kinds.forEach((k, key) => {
        const phaseA = Math.random()*Math.PI*2;
        deck.push({key, orient:k.orient, freq:k.freq, phase:phaseA});
        deck.push({key, orient:k.orient, freq:k.freq, phase:phaseA});
      });
      shuffle(deck);

      let di = 0;
      for(let c=0; c<cells; c++){
        const el = document.createElement('div');
        if(c === holeAt){
          el.className = 'mtr-tile mtr-empty';
          boardEl.appendChild(el);
          continue;
        }
        el.className = 'mtr-tile';
        const cv = document.createElement('canvas');
        const card = deck[di++];
        drawGabor(cv, card.orient, card.freq, card.phase);
        el.appendChild(cv);
        const idx2 = tiles.length;
        const t = {...card, cleared:false, el, idx:idx2};
        el.addEventListener('click', () => onTap(idx2));
        boardEl.appendChild(el);
        tiles.push(t);
      }

      /* ステージ1のみ: チュートリアルとして消せるペア1組をハイライトする（2026-07-29） */
      if(idx === 0 && tiles.length){
        const tutKey = tiles[0].key;
        tiles.forEach(t => { if(t.key === tutKey) t.el.classList.add('mtr-tut'); });
      }

      stageLbl.textContent = `ステージ ${idx+1}/${STAGES.length}`;
      owlBgEl.style.opacity = 0;
      const promptEl = document.getElementById('mtr-stage1-prompt');
      if(promptEl){ idx === 0 ? promptEl.classList.remove('mtr-hidden') : promptEl.classList.add('mtr-hidden'); }
      updateHUD();
    }

    function onTap(i){
      if(lock) return;
      const t = tiles[i];
      if(t.cleared) return;
      if(selectedIdx === i){ t.el.classList.remove('mtr-sel'); selectedIdx = -1; return; }
      if(selectedIdx === -1){ t.el.classList.add('mtr-sel'); selectedIdx = i; return; }
      const a = tiles[selectedIdx];
      if(a.key === t.key){
        lock = true;
        t.el.classList.add('mtr-sel');
        setTimeout(() => {
          a.el.classList.remove('mtr-sel'); t.el.classList.remove('mtr-sel');
          a.el.classList.add('mtr-cleared'); t.el.classList.add('mtr-cleared');
          a.el.classList.remove('mtr-tut'); t.el.classList.remove('mtr-tut');
          a.cleared = t.cleared = true;
          selectedIdx = -1;
          clearedPairs++; totalXP += XP_PER_PAIR;
          updateHUD();
          lock = false;
          if(clearedPairs === totalPairs) setTimeout(stageCleared, 420);
        }, 160);
      } else {
        lock = true;
        t.el.classList.add('mtr-bad');
        setTimeout(() => {
          a.el.classList.remove('mtr-sel'); t.el.classList.remove('mtr-bad');
          selectedIdx = -1; lock = false;
        }, 340);
      }
    }

    function updateHUD(){
      const ratio = totalPairs ? clearedPairs / totalPairs : 0;
      barFill.style.width = (ratio*100) + '%';
      xpValEl.textContent = totalXP;
      owlBgEl.style.opacity = Math.min(0.85, ratio);
      if(ratio >= 1)        titleEl.textContent = 'クリア！';
      else if(ratio >= 0.7) titleEl.textContent = 'あと少し！';
      else                  titleEl.textContent = '全消ししよう！';
    }

    function showToast(text, ms, cb){
      toastText.textContent = text;
      toastEl.classList.add('mtr-show');
      setTimeout(() => { toastEl.classList.remove('mtr-show'); if(cb) cb(); }, ms);
    }

    function stageCleared(){
      if(stageIndex < STAGES.length - 1){
        window.__mtrTrack && window.__mtrTrack('stage_clear', stageIndex + 1);
        showToast('ステージクリア！', 900, () => loadStage(stageIndex + 1));
      } else {
        window.__mtrTrack && window.__mtrTrack('all_clear');
        showToast('ぜんぶクリア！', 900, () => resultEl.classList.add('mtr-show'));
      }
    }

    /* ===== フロー制御 ===== */
    function startGame(){
      totalXP = 0;
      loadStage(0);
    }
    function showOverlay(){ overlayEl.classList.add('mtr-show'); window.__mtrTrack && window.__mtrTrack('popup_view'); }
    function hideOverlay(){ overlayEl.classList.remove('mtr-show'); }

    document.getElementById('mtr-playbtn').addEventListener('click', () => {
      window.__mtrTrack && window.__mtrTrack('play_start');
      hideOverlay();
      startGame();
    });
    document.getElementById('mtr-close').addEventListener('click', () => {
      window.__mtrClose && window.__mtrClose('x');
    });
    /* CTAは本物のaタグの素の遷移に任せる（in-appブラウザではJS遷移だと
       ストアアプリへの橋渡しが無効になるため）。ここでは計測と抑制記録のみ */
    document.getElementById('mtr-search-cta').addEventListener('click', () => {
      window.__mtrTrack && window.__mtrTrack('cta_search');
    });
    document.getElementById('mtr-dl-ios').addEventListener('click', () => {
      window.__mtrTrack && window.__mtrTrack('cta_ios');
      window.__mtrConverted && window.__mtrConverted();
    });
    document.getElementById('mtr-dl-android').addEventListener('click', () => {
      window.__mtrTrack && window.__mtrTrack('cta_android');
      window.__mtrConverted && window.__mtrConverted();
    });
    document.getElementById('mtr-replay-link').addEventListener('click', () => {
      window.__mtrTrack && window.__mtrTrack('replay');
      resultEl.classList.remove('mtr-show');
      startGame();
    });

    /* 最終CTAはOS別に1つだけ表示する。iOSはApp Store・AndroidはGoogle Play・
       その他(PC/判別不能)は検索（2026-07-29） */
    const os = mtrGetOS();
    const searchCta = document.getElementById('mtr-search-cta');
    const iosBtn = document.getElementById('mtr-dl-ios');
    const androidBtn = document.getElementById('mtr-dl-android');
    if(os === 'iOS'){
      searchCta.style.display = 'none';
      androidBtn.style.display = 'none';
    } else if(os === 'Android'){
      searchCta.style.display = 'none';
      iosBtn.style.display = 'none';
    } else {
      document.querySelector('.mtr-store-buttons').style.display = 'none';
    }
    /* 「開かない場合はブラウザで」注記はアプリ内ブラウザのときだけ表示 */
    const noteEl = document.getElementById('mtr-open-note');
    if(noteEl){
      const inApp = (typeof MtrExitTrigger !== 'undefined') && MtrExitTrigger.uaFamily() !== 'browser';
      if(!inApp) noteEl.style.display = 'none';
    }

    /* 初期表示：裏で盤面S1を組んでおき、オーバーレイを表示 */
    loadStage(0);
    showOverlay();

    return true;
  }

  window.__mtrInitGame = initMietoreOnramp;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initMietoreOnramp, { once:true });
  } else if(!initMietoreOnramp()){
    const observer = new MutationObserver(() => {
      if(initMietoreOnramp()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => observer.disconnect(), 10000);
  }
})();

/* オーケストレーション */
(function(){
  var popupRoot = null;
  var popupContainer = null;

  function buildDebugPanel(){
    if(!MTR_QUERY.debug) return;
    var panel = document.createElement('div');
    panel.id = 'mtr-debug-panel';
    panel.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:2147483647;' +
      'max-width:70vw;max-height:30vh;overflow:auto;background:rgba(0,0,0,.75);color:#0f0;' +
      'font:10px/1.4 monospace;padding:6px;border-radius:4px;pointer-events:none;word-break:break-all;';
    document.body.appendChild(panel);

    /* トリガーと表示のどちらが壊れているかを実機で切り分けるためのボタン。
       パネル全体は pointer-events:none なのでボタンだけ有効化する */
    var testBtn = document.createElement('button');
    testBtn.textContent = '表示テスト';
    testBtn.style.cssText = 'pointer-events:auto;margin-bottom:4px;font:11px/1.4 monospace;' +
      'padding:4px 8px;border:1px solid #0f0;background:#000;color:#0f0;border-radius:3px;';
    testBtn.addEventListener('click', function(){
      window.__mtrTriggerSource = 'debug';
      showPopup();
    });
    panel.appendChild(testBtn);

    /* ◀でページを離れるとパネルごと消えるため、出力をlocalStorageにも積んでおき
       次回起動時に「前回ログ」として読めるようにする。popstateが来たのか
       pagehideだけだったのかを後から確認できる */
    var LOG_KEY = 'mtr_debug_log';
    var LOG_MAX = 30;
    function persist(text){
      try {
        var arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
        arr.push(text);
        while(arr.length > LOG_MAX) arr.shift();
        localStorage.setItem(LOG_KEY, JSON.stringify(arr));
      } catch(e) {}
    }

    /* 今回分より先に前回ログを出す。色を変えて区別する */
    var prev = [];
    try { prev = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch(e) {}
    if(prev.length){
      var head = document.createElement('div');
      head.textContent = '--- 前回ログ（' + prev.length + '行）---';
      head.style.color = '#888';
      panel.appendChild(head);
      for(var pi = 0; pi < prev.length; pi++){
        var pl = document.createElement('div');
        pl.textContent = prev[pi];
        pl.style.color = '#888';
        panel.appendChild(pl);
      }
      var tail = document.createElement('div');
      tail.textContent = '--- 今回 ---';
      tail.style.color = '#888';
      panel.appendChild(tail);
    }
    try { localStorage.removeItem(LOG_KEY); } catch(e) {}

    function appendLine(text){
      var line = document.createElement('div');
      line.textContent = text;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
    }

    window.__mtrDebugLine = function(text){ appendLine(text); persist(text); };

    /* 同じkeyで呼ばれたら同じ行を書き換える。スクロール毎の状態表示でパネルが溢れるのを防ぐ */
    var statLines = {};
    window.__mtrDebugStat = function(key, text){
      if(!statLines[key]){
        statLines[key] = document.createElement('div');
        statLines[key].style.color = '#ff0';
        panel.appendChild(statLines[key]);
      }
      if(statLines[key].textContent !== text){
        statLines[key].textContent = text;
        /* auxはスクロール毎に変わるため保存しない（リングバッファを埋め尽くしてしまう） */
        if(key !== 'aux') persist(text);
      }
    };

    var neverVal = null;
    try { neverVal = localStorage.getItem('mtr_never'); } catch(e) {}

    var suppressUntilRaw = null;
    try { suppressUntilRaw = localStorage.getItem('mtr_suppress_until'); } catch(e) {}
    var suppressUntilText = 'なし';
    if(suppressUntilRaw){
      var suppressUntil = parseInt(suppressUntilRaw, 10);
      if(suppressUntil){
        suppressUntilText = new Date(suppressUntil).toLocaleString();
        if(Date.now() < suppressUntil) suppressUntilText += '（抑制中）';
      }
    }

    var shownVal = null;
    try { shownVal = sessionStorage.getItem('mtr_shown'); } catch(e) {}

    appendLine('canShow: ' + MtrFrequency.canShow());
    appendLine('mtr_never: ' + (neverVal ? 'あり' : 'なし'));
    appendLine('suppress_until: ' + suppressUntilText);
    appendLine('mtr_shown: ' + (shownVal ? 'あり' : 'なし'));
    appendLine('in_app: ' + MtrExitTrigger.isInAppBrowser());
    /* activation の現在値は固定行（exit-trigger.js の reportActivation）で実況表示する。
       false の間は pushState しても戻るボタンに読み飛ばされる */
    var am = MtrExitTrigger.auxMode();
    appendLine('aux_mode: ' + am.mode + ' (' + am.from + ')');
    appendLine('arm_mode: ' + MtrExitTrigger.armMode());
    appendLine('os: ' + mtrGetOS());
    appendLine('ua: ' + navigator.userAgent);
    appendLine('history.state: ' + JSON.stringify(history.state));
  }

  /* 挿入先ページに viewport meta が無い（またはPC版サイト表示）と
     レイアウトビューポートが980px等になり、420px上限のポップアップが細長い柱になる
     （2026-07-29 OPPO A5 5G Chromeで発生）。visualViewport.width×scale は
     meta有無やピンチズームに依存せず端末の実表示幅(dips)を返すため、
     レイアウト幅との比を zoom に適用して端末基準サイズで描画する */
  function fitPopupToDevice(){
    /* 上下余白の合計。popup.css の #mtr-popup-root > div の padding(24px×2)と同期 */
    var CARD_MARGIN_V = 48;
    if(!popupContainer || !('zoom' in popupContainer.style)) return;
    var app = popupContainer.querySelector('#mtr-app');
    if(!app) return;
    var layoutW = document.documentElement.clientWidth || window.innerWidth;
    var vv = window.visualViewport;
    var deviceW = vv ? vv.width * vv.scale : (screen.width || layoutW);
    var deviceH = vv ? vv.height * vv.scale : window.innerHeight;
    var f = deviceW ? layoutW / deviceW : 1;
    /* 発動は「明らかに viewport meta 未適用の広幅レイアウト」に限定する。
       TikTok の iOS WebView は meta 適用済みページ（layoutW=390等）でも
       visualViewport.scale に 1 未満を返し f≈1.3 になるため、
       f の閾値だけでは誤発動する（2026-07-29 iPhone14 TikTok 実機で発生）。
       no-meta 時の layoutW はモバイルで 980px 前後・固定幅LPでも 600px 以上が通例 */
    if(!isFinite(f) || f < 1.3 || f > 5 || layoutW < 560){
      /* 通常ページ（viewport meta あり）は何もしない。min-height はCSSの100dvhに任せる */
      popupContainer.style.zoom = '';
      app.style.minHeight = '';
      window.__mtrDebugStat && window.__mtrDebugStat('vp',
        'vp: layout_w=' + Math.round(layoutW) + ' device=' + Math.round(deviceW) + 'x' + Math.round(deviceH) + ' zoom=なし');
      return;
    }
    f = Math.round(f * 1000) / 1000;
    popupContainer.style.zoom = String(f);
    /* zoom 配下では 100vh がレイアウトビューポート基準のまま拡大されてズレるため実測値で上書き */
    app.style.minHeight = Math.round(deviceH - CARD_MARGIN_V) + 'px';
    window.__mtrDebugStat && window.__mtrDebugStat('vp',
      'vp: layout_w=' + Math.round(layoutW) + ' device=' + Math.round(deviceW) + 'x' + Math.round(deviceH) + ' zoom=' + f);
  }

  function onViewportChange(){ fitPopupToDevice(); }

  /* demo.html v5で確定したキャラクター画像（自己完結配信用のdata URL）。 */
  var CHAR_FUKUTA_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAALbCAMAAAARnA6YAAADAFBMVEWxb5/ec3DppWP54FldpaJkut5mrnFgx+Dzm4yLpJLhoiLpritfX6+2cJ+2b5+84O/btW88oKBrYF9fp5RV/6p80YGxsRWeul3IcKc9obN0xHhgwd+2b5+oyLz1k3/Um4vlyyH/1mDQwZUgDxIAf/8/v/9/AAB/AH9OP0BLQD9Vf397o2Vq1H+2bW2RkZGBpKHMZjPfc3Pfc3P/5QAAAABNqK3C08n68er7zgASAwWBzvNBjZDwmIVSsrf07eZSqaq80cn+1gDrojZxvnXldnZFlZhvyeu4caGsy8NvtbUA///xl03//wB/f39NqKxNqa2I0fNNqa1NqK3wxFj9fn4/v79Nqa1Nqa3l5NyTwr13x3uFvbp/////AAD////+oo1InaE/f3/c4dgmFxlVSEf/qqr/vgA1KCkAf3/DeKv/qVQ/f7//qgCcxcDj2tR7vXvTycRGODmFeHb7zgBmWFizqKVkusylmZX8olK/f391aGf/fwD5yQD7zQCUiIX7zQD7zgBVqlWpVanymYZMtLTwl4TxmIXxmIT7zQDwl4f7ywAA/wDxmIX10Vhqq5SqVVXEurVq0vN//3/91AD90QB/f//KxDBxvnW4caHqnjjxmIX/VVXu0DCs2u/I0rLulUzwl0zR5e05nJzjdXXtlk390QCroZzymE380ABNnK9dtMLLxLnldXXzmU3//39yvnVxsIlzwnhvwtuckI28sq3kdXUAAP9VVVVVqv9zwnaqqlWqqqr/fz/yl0380wAeEBJ9cW9kx+WQt2u5caHTo0jjdXX80gBxvXRxvnVxvnVyvnVywXdixeNixOK6cqKtvU3/AP/ic3PkdXXxl01zwXe4caHb0XLR0pLxsyLvw1dV//9jxuSMgX65caGqpGfumH/wxFjvxFjxxVj90AD/4AB/fwB0xHVkyOX/vz8uHiA9MDBeUVBrqqp7zoBkxuSSpXq4wELwxVg7jJdIkZFzwndkyc+2bp61cJ66cqKq/6r/f//yxliyZ5S2b5+/fz+7pFryfSCLAAABAHRSTlMbFQwKDhIJGAz0CP8Dovv//wv//wP/A/8N/7xNXf9c//////8CBAIC//8G/wwHB5sFaIAKAP7///7////+/v8H//3//f3//v3//wH8AQIv0P+uTv0DBI5w///9/wIBAf7/BP///wME/wL+AwQD//8H////zv////7+BP8CFHD/TbADA8wLLZCtjhctAU3+/wP//gIQMAL/jrD/cAP///8wcP8HThZL/0xtDv//084CU//M////kAEDAzIDAwSw0v//zf+M/26sLXGqyUwvTtD/ATKvimpU////LAOy/y//FEpukJH/AhCQBP//////cf//sv8HiglQVG4DAs8RdAT/nMkfDQAAQkBJREFUeNrtnQd8G8eV/2nZTrtcL//r/7v7994GJCULu0BkUMAKRaTBJgIgKVEiRUqUqGKJkiwXtchqVmTFPjfJvdtxL3E997ica/LPOY7j+BKn53Ipl0u7m10AxALbZnZndmeB9z6xI8kQscR8+Xu/efNmpg1BQHCINvgIIAAsCAALAsCCgACwIAAsCAALAgLAggCwIAAsCAgACwLAggCwICAALAgACwLAgoAAsCAALAgACwICwIIAsCAALAgIAAsCwIIAsCAgACwIAAsCwIKAALAgACwIAAvCRTxYUHoVAAuCcZS0f98PYEEwDQX9ydtPfnA6UgAsCIYho5e7jnYdfft0RQGwIBgmQuXJLhxHX0Z/B2BBMIv70ce7NLC+h04HsCDYRQG9fVQl6yX8KwALgh1YyktdR48e/QBlwLzz9RyzK9Mon8+30Kzw9O998HKrTwp5g1WaAypfCuT7K6bTfr9lpowXgMVTrRDaf3Dfrl379u7BaPn/3aV/pSI96TdZvb0PIgCL3+e7EmN12cLh4YXqP/ve9Z8sTNTk5HWBIA1gcVMrFau9CzFV5RheuMfnAcZYXffG7UuWPHojkNU8YN1Rj5UW+/208Nsn0X88uWTrEjVOosthpJsDrEkjVguH9/k3vmksVzfeXsZqyZKtN6JJGOpmACuP/rwRKzX2FH2SLIzRiUeX1OL2U9Iw1E0AVh7tWWgSw3vRSl/kaju6rpoFKxFaySqWSgBW7cP4yK6FprEn7YNkFfVZsJILT6JHwkjVSu3jms0AWBXBumx4YWCSlU5f92g9VmEFS6XqFG3CczmApf2gFS0EC08M+busPDJwtWTJiRBWHC5H/+OZ188888zb7jslhE/fxmNk37XiygfJehidMGC19dH89tCNzBF0ym1nVuIZ/DsAy8K6+yRZj6A3DIkwjIKVR6+dWYv/GzqyfAaLv2RN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';
  var CHAR_AIBOU_SRC = 'data:image/png;base64,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';
  var catchTimers = [];

  function clearCatchTimers(){
    catchTimers.forEach(function(id){ clearTimeout(id); });
    catchTimers = [];
  }

  function scheduleCatch(fn, ms){
    catchTimers.push(setTimeout(fn, ms));
  }

  /* demo.html v5の会話4ビート→ブリッジA→盤面遷移。アニメ固有の計測は追加しない。 */
  function buildCatchOverlay(mtrApp){
    var ov = document.createElement('div');
    ov.id = 'mtr-catch-overlay';
    ov.innerHTML =
      '<div class="cc-skiphint">タップでスキップ</div>' +
      '<div class="cc-shadow cc-fukuta-shadow" id="cc-fukuta-shadow"></div>' +
      '<div class="cc-shadow cc-aibou-shadow" id="cc-aibou-shadow"></div>' +
      '<div class="cc-char cc-fukuta" id="cc-fukuta"><img src="' + CHAR_FUKUTA_SRC + '" alt="ふくた"></div>' +
      '<div class="cc-char cc-aibou" id="cc-aibou"><img src="' + CHAR_AIBOU_SRC + '" alt="あいぼう"></div>' +
      '<div class="cc-notes" id="cc-notes">' +
        '<span class="cc-note" id="cc-note1" style="left:16%;bottom:34%;color:#ff9f6b;">♪</span>' +
        '<span class="cc-note" id="cc-note2" style="left:34%;bottom:38%;color:#ffc94a;">♪</span>' +
        '<span class="cc-note" id="cc-note3" style="left:24%;bottom:32%;color:#ff9f6b;">♪</span>' +
      '</div>' +
      '<div class="cc-bubble" id="cc-bubble1"><div class="cc-tail cc-tail-left"></div>ドライアーイ！<wbr>アイアイアアイ！</div>' +
      '<div class="cc-bubble" id="cc-bubble2"><div class="cc-tail cc-tail-right"></div>違うよ！<wbr>ミエトレは<wbr>老眼対策よ！</div>' +
      '<div class="cc-bubble" id="cc-bubble3"><div class="cc-tail cc-tail-left"></div>本当に？</div>' +
      '<div class="cc-bubble" id="cc-bubble4"><div class="cc-tail cc-tail-right"></div>うん、<wbr>実際に<wbr>3分も<wbr>かからないし、<wbr>無料だよ</div>' +
      '<div class="cc-note-disclaimer" id="cc-note-disclaimer">※ガボールパッチは<wbr>老眼への効果を示す<wbr>研究・エビデンスが<wbr>多数あります</div>';
    mtrApp.appendChild(ov);

    var els = {
      fukuta: ov.querySelector('#cc-fukuta'),
      aibou: ov.querySelector('#cc-aibou'),
      fukutaShadow: ov.querySelector('#cc-fukuta-shadow'),
      aibouShadow: ov.querySelector('#cc-aibou-shadow'),
      note1: ov.querySelector('#cc-note1'),
      note2: ov.querySelector('#cc-note2'),
      note3: ov.querySelector('#cc-note3'),
      bubble1: ov.querySelector('#cc-bubble1'),
      bubble2: ov.querySelector('#cc-bubble2'),
      bubble3: ov.querySelector('#cc-bubble3'),
      bubble4: ov.querySelector('#cc-bubble4'),
      note: ov.querySelector('#cc-note-disclaimer')
    };
    els.note.classList.add('show');

    /* game.jsが裏で描いたS1の同一ペアをそのまま移動し、再描画せずブリッジで流用する。 */
    var tutorialCanvases = mtrApp.querySelectorAll('.mtr-tile.mtr-tut canvas');
    var finished = false;
    var animeEndSent = false;
    var bridgeSkip = null;

    function finishToGame(animeEndParam){
      if(finished) return;
      finished = true;
      if(!animeEndSent){
        animeEndSent = true;
        window.__mtrTrack && window.__mtrTrack('anime_end', animeEndParam);
      }
      clearCatchTimers();

      ov.removeEventListener('click', onOverlayClick);
      ov.classList.add('cc-gate-mode');
      var gateReady = false;
      function makeGateCopy(text, cls, delayStart){
        var el = document.createElement('div');
        el.className = 'cc-gate-copy ' + cls;
        for(var i = 0; i < text.length; i++){
          if(text.charAt(i) === '\n'){
            el.appendChild(document.createElement('br'));
            continue;
          }
          var sp = document.createElement('span');
          sp.textContent = text.charAt(i);
          sp.style.animationDelay = (delayStart + i * 70) + 'ms';
          el.appendChild(sp);
        }
        return el;
      }
      ov.appendChild(makeGateCopy('老眼への効果研究、多数', 'cc-gate-copy-top', 200));
      ov.appendChild(makeGateCopy('ノーベル賞学者が生んだ\nガボールパッチ', 'cc-gate-copy-btm', 200 + 11*70 + 400));
      var gate = document.createElement('button');
      gate.type = 'button';
      gate.className = 'cc-gate';
      gate.textContent = '▶ ミエトレをためす';
      gate.addEventListener('click', function(){
        if(!gateReady || !ov.parentNode) return;
        var playBtn = mtrApp.querySelector('#mtr-playbtn');
        if(!playBtn) return;
        ov.remove();
        playBtn.click();
      });
      ov.appendChild(gate);

      scheduleCatch(function(){
        gateReady = true;
        gate.style.pointerEvents = 'auto';
      }, 300);
    }

    function playBridgeA(){
      var patch1 = null;
      var patch2 = null;
      var textEl = null;

      function cleanup(){
        if(patch1 && patch1.parentNode) patch1.remove();
        if(patch2 && patch2.parentNode) patch2.remove();
        if(textEl && textEl.parentNode) textEl.remove();
      }

      bridgeSkip = function(){
        clearCatchTimers();
        cleanup();
        finishToGame('skip_bridge');
      };

      els.fukuta.classList.remove('cc-enter-left','cc-swing','cc-tilt-toward','cc-puzzled','cc-neutral');
      els.aibou.classList.remove('cc-enter-right','cc-lean','cc-settle','cc-nod','cc-hop');
      els.fukuta.classList.add('cc-bridge-out-left');
      els.aibou.classList.add('cc-bridge-out-right');
      els.fukutaShadow.classList.add('cc-bridge-fade');
      els.aibouShadow.classList.add('cc-bridge-fade');

      textEl = document.createElement('div');
      textEl.className = 'cc-bridge-text';
      textEl.textContent = 'これがガボールパッチ';
      ov.appendChild(textEl);

      patch1 = document.createElement('div');
      patch1.className = 'cc-bridge-patch mtr-tile';
      if(tutorialCanvases[0]) patch1.appendChild(tutorialCanvases[0]);
      ov.appendChild(patch1);

      scheduleCatch(function(){
        var bigPx = Math.min(210, Math.max(150, window.innerWidth * 0.48));
        var bigScale = bigPx / 96;
        patch1.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1), opacity .25s ease';
        patch1.style.transform = 'translate(-50%,-50%) scale(' + bigScale.toFixed(4) + ')';
        patch1.classList.add('show');
        textEl.classList.add('show');
      }, 650);

      scheduleCatch(function(){
        patch1.style.transition = '';
        patch1.style.transform = 'translate(-50%,-50%) translateX(-58px) scale(1)';
        textEl.classList.remove('show');
        textEl.textContent = '同じ向きのペアを見つけてタップ！';
        textEl.classList.add('show');

        patch2 = document.createElement('div');
        patch2.className = 'cc-bridge-patch mtr-tile';
        patch2.style.transform = 'translate(-50%,-50%) translateX(58px) scale(.3)';
        if(tutorialCanvases[1]) patch2.appendChild(tutorialCanvases[1]);
        ov.appendChild(patch2);
        void patch2.offsetWidth;
        patch2.classList.add('show');
        patch2.style.transform = 'translate(-50%,-50%) translateX(58px) scale(1)';
      }, 2700);

      scheduleCatch(function(){
        patch1.classList.add('mtr-tut');
        patch2.classList.add('mtr-tut');
      }, 3000);

      scheduleCatch(function(){
        patch1.classList.remove('mtr-tut','show');
        patch2.classList.remove('mtr-tut','show');
        patch1.style.transform = 'translate(-50%,-50%) translateX(-58px) scale(0)';
        patch2.style.transform = 'translate(-50%,-50%) translateX(58px) scale(0)';
        textEl.classList.remove('show');
      }, 4600);

      scheduleCatch(function(){
        cleanup();
        bridgeSkip = null;
        finishToGame('complete');
      }, 4900);
    }

    function playSequence(){
      els.fukuta.classList.add('cc-enter-left', 'cc-visible');
      els.aibou.classList.add('cc-enter-right', 'cc-visible');
      els.fukutaShadow.classList.add('cc-enter');
      els.aibouShadow.classList.add('cc-enter');
      scheduleCatch(function(){
        els.fukuta.classList.remove('cc-enter-left');
        els.aibou.classList.remove('cc-enter-right');
      }, 400);

      scheduleCatch(function(){
        els.bubble1.classList.add('show');
        els.fukuta.classList.add('cc-swing');
      }, 500);
      scheduleCatch(function(){ els.note1.classList.add('cc-float1'); }, 600);
      scheduleCatch(function(){ els.note2.classList.add('cc-float2'); }, 1000);
      scheduleCatch(function(){ els.note3.classList.add('cc-float3'); }, 1400);
      scheduleCatch(function(){
        els.bubble1.classList.remove('show');
        els.fukuta.classList.remove('cc-swing');
      }, 2500);

      scheduleCatch(function(){
        els.bubble2.classList.add('show');
        els.aibou.classList.add('cc-lean');
        els.fukuta.classList.add('cc-tilt-toward');
      }, 2550);
      scheduleCatch(function(){
        els.aibou.classList.remove('cc-lean');
        els.aibou.classList.add('cc-settle');
      }, 4050);
      scheduleCatch(function(){
        els.bubble2.classList.remove('show');
        els.fukuta.classList.remove('cc-tilt-toward');
        els.aibou.classList.remove('cc-settle');
      }, 4400);

      scheduleCatch(function(){
        els.bubble3.classList.add('show');
        els.fukuta.classList.add('cc-puzzled');
      }, 4450);
      scheduleCatch(function(){
        els.fukuta.classList.remove('cc-puzzled');
        els.fukuta.classList.add('cc-neutral');
      }, 5300);
      scheduleCatch(function(){
        els.bubble3.classList.remove('show');
        els.fukuta.classList.remove('cc-neutral');
      }, 5500);

      scheduleCatch(function(){
        els.bubble4.classList.add('show');
        els.aibou.classList.add('cc-nod');
      }, 5550);
      scheduleCatch(function(){
        els.aibou.classList.remove('cc-nod');
        els.aibou.classList.add('cc-hop');
      }, 6100);
      scheduleCatch(function(){
        els.bubble4.classList.remove('show');
        els.aibou.classList.remove('cc-hop');
      }, 7300);
      scheduleCatch(playBridgeA, 7450);
    }

    function onOverlayClick(){
      if(bridgeSkip){
        var fn = bridgeSkip;
        bridgeSkip = null;
        fn();
        return;
      }
      finishToGame('skip_talk');
    }

    ov.addEventListener('click', onOverlayClick);

    playSequence();
  }

  function showPopup(){
    if(popupRoot) return;
    popupRoot = document.createElement('div');
    popupRoot.id = 'mtr-popup-root';

    var style = document.createElement('style');
    style.textContent = MTR_CSS_TEXT;
    popupRoot.appendChild(style);

    var container = document.createElement('div');
    container.innerHTML = MTR_HTML_TEXT;
    popupRoot.appendChild(container);

    popupContainer = container;
    document.body.appendChild(popupRoot);
    fitPopupToDevice();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    if(window.visualViewport) window.visualViewport.addEventListener('resize', onViewportChange);
    window.__mtrInitGame && window.__mtrInitGame();
    var mtrApp = container.querySelector('#mtr-app');
    if(mtrApp) buildCatchOverlay(mtrApp);
    MtrFrequency.markShown();
    window.__mtrDebugLine && window.__mtrDebugLine('popup shown');
  }

  function destroyPopup(){
    if(!popupRoot) return;
    clearCatchTimers();
    popupRoot.remove();
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);
    if(window.visualViewport) window.visualViewport.removeEventListener('resize', onViewportChange);
    popupContainer = null;
    popupRoot = null;
  }

  window.__mtrClose = function(source){
    window.__mtrTrack && window.__mtrTrack('popup_close', source);
    /* メルマガ版は単体ページのため、閉じる=リロードして最初から */
    location.reload();
  };

  window.__mtrConverted = function(){
    MtrFrequency.markConverted();
  };

  if(MTR_QUERY.reset) MtrFrequency.reset();

  buildDebugPanel();

  if(MTR_QUERY.preview){
    window.__mtrTriggerSource = 'mailmag';
    showPopup();
  } else {
    MtrExitTrigger.setShowCallback(showPopup);
    MtrExitTrigger.setCloseCallback(destroyPopup);
  }
})();

})();
