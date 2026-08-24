// /mm 計測イベントの集計純関数
// $SRC/php/stats.php の集計ロジック（①〜⑪）を1:1移植したもの

export interface EventRow {
  received_at: string;
  ts: string;
  sid: string;
  event: string;
  param: string;
  url: string;
  os: string;
  v: string;
  ua_family: string;
}

const ALL_EVENTS = [
  'popup_view', 'play_start', 'stage_clear', 'all_clear',
  'cta_search', 'cta_ios', 'cta_android', 'replay', 'popup_close',
];

export interface Stats {
  total: number;
  byDayEvent: Record<string, Record<string, number>>;
  funnel: { view: number; play: number; clear: number; cta: number };
  byUrl: Record<string, Record<string, number>>;
  bySource: Record<string, number>;
  funnelBySource: Record<string, { popup_view: number; play_start: number; all_clear: number; cta: number }>;
  byClose: Record<string, number>;
  leaveRate: string;
  byOs: Record<string, number>;
  byOsSource: Record<string, Record<string, number>>;
  byExit: Record<string, number>;
  noActRate: string;
  byUaPopup: Record<string, Record<string, number>>;
  byUaExit: Record<string, Record<string, number>>;
  lp: {
    byDayPageView: Record<string, number>;
    byDayPopupView: Record<string, number>;
    lpDays: string[];
    byOsUaScrollSignal: Record<string, Record<string, number>>;
    byLpClickUrlTop: Record<string, number>;
  };
  anime: {
    animePopupCount: number;
    animeEndCounts: { complete: number; skip_talk: number; skip_bridge: number };
    animeLeaveCount: number;
    animeBridgeReached: number;
  };
}

// PHP の ksort 相当。デフォルトソート（文字列比較）でキーを並べた [key, value] を返す
export function sortedEntries<T>(obj: Record<string, T>): [string, T][] {
  return Object.keys(obj).sort().map((k) => [k, obj[k]] as [string, T]);
}

export function mtrRate(num: number, den: number): string {
  if (den <= 0) return '-';
  return (Math.round((num / den) * 1000) / 10).toFixed(1) + '%';
}

function dayOf(r: EventRow): string {
  return (r.ts || r.received_at || '').slice(0, 10);
}

export function aggregate(rows: EventRow[]): Stats {
  // ① 日別×イベント別件数
  const byDayEvent: Record<string, Record<string, number>> = {};
  const eventTotals: Record<string, number> = {};
  for (const r of rows) {
    const day = dayOf(r);
    const ev = r.event || '';
    byDayEvent[day] ??= {};
    byDayEvent[day][ev] = (byDayEvent[day][ev] ?? 0) + 1;
    eventTotals[ev] = (eventTotals[ev] ?? 0) + 1;
  }

  // ② ファネル
  const viewCount = eventTotals['popup_view'] ?? 0;
  const playCount = eventTotals['play_start'] ?? 0;
  const clearCount = eventTotals['all_clear'] ?? 0;
  const ctaCount = (eventTotals['cta_search'] ?? 0) + (eventTotals['cta_ios'] ?? 0) + (eventTotals['cta_android'] ?? 0);

  // ③ ページURL別 popup_view / cta 内訳
  const byUrl: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const url = r.url || '';
    const ev = r.event || '';
    if (ev === 'popup_view' || ev === 'cta_search' || ev === 'cta_ios' || ev === 'cta_android') {
      byUrl[url] ??= {};
      byUrl[url][ev] = (byUrl[url][ev] ?? 0) + 1;
    }
  }

  // ④ 発火元別 popup_view
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    if (r.event !== 'popup_view') continue;
    const label = r.param === '' || r.param == null ? '(なし)' : r.param;
    bySource[label] = (bySource[label] ?? 0) + 1;
  }

  // ⑤ 発火元別ファネル
  const sidToSource: Record<string, string> = {};
  for (const r of rows) {
    if (r.event !== 'popup_view') continue;
    const label = r.param === '' || r.param == null ? '(なし)' : r.param;
    sidToSource[r.sid ?? ''] = label;
  }
  const funnelBySource: Stats['funnelBySource'] = {};
  for (const r of rows) {
    const ev = r.event || '';
    if (ev !== 'popup_view' && ev !== 'play_start' && ev !== 'all_clear'
      && ev !== 'cta_search' && ev !== 'cta_ios' && ev !== 'cta_android') continue;
    const sid = r.sid ?? '';
    const source = Object.prototype.hasOwnProperty.call(sidToSource, sid) ? sidToSource[sid] : '(不明)';
    funnelBySource[source] ??= { popup_view: 0, play_start: 0, all_clear: 0, cta: 0 };
    if (ev === 'cta_search' || ev === 'cta_ios' || ev === 'cta_android') {
      funnelBySource[source].cta++;
    } else {
      funnelBySource[source][ev as 'popup_view' | 'play_start' | 'all_clear']++;
    }
  }

  // ⑥ popup_close の内訳
  const byClose: Record<string, number> = {};
  let closeTotal = 0;
  for (const r of rows) {
    if (r.event !== 'popup_close') continue;
    const label = r.param === '' || r.param == null ? '(その他)' : r.param;
    byClose[label] = (byClose[label] ?? 0) + 1;
    closeTotal++;
  }
  const leaveRate = mtrRate(byClose['leave'] ?? 0, closeTotal);

  // ⑦ OS別内訳
  const byOs: Record<string, number> = {};
  const byOsSource: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (r.event !== 'popup_view') continue;
    const osLabel = r.os === '' || r.os == null ? '(なし)' : r.os;
    byOs[osLabel] = (byOs[osLabel] ?? 0) + 1;
    const source = r.param === '' || r.param == null ? '(なし)' : r.param;
    byOsSource[osLabel] ??= {};
    byOsSource[osLabel][source] = (byOsSource[osLabel][source] ?? 0) + 1;
  }

  // ⑧ 離脱時の結末
  const byExit: Record<string, number> = {};
  let exitTotal = 0;
  for (const r of rows) {
    if (r.event !== 'exit_no_popup') continue;
    const label = r.param === '' || r.param == null ? '(なし)' : r.param;
    byExit[label] = (byExit[label] ?? 0) + 1;
    exitTotal++;
  }
  const exitDen = viewCount + exitTotal;
  const noActRate = mtrRate(byExit['no_activation'] ?? 0, exitDen);

  // ⑨ UA別集計
  const byUaPopup: Record<string, Record<string, number>> = {};
  const byUaExit: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const ev = r.event || '';
    if (ev !== 'popup_view' && ev !== 'exit_no_popup') continue;
    const uaLabel = r.ua_family === '' || r.ua_family == null ? '(不明)' : r.ua_family;
    const paramLabel = r.param === '' || r.param == null ? '(なし)' : r.param;
    const target = ev === 'popup_view' ? byUaPopup : byUaExit;
    target[uaLabel] ??= {};
    target[uaLabel][paramLabel] = (target[uaLabel][paramLabel] ?? 0) + 1;
  }

  // ⑩ LP指標
  const byDayPageView: Record<string, number> = {};
  for (const r of rows) {
    if (r.event !== 'page_view') continue;
    const day = dayOf(r);
    byDayPageView[day] = (byDayPageView[day] ?? 0) + 1;
  }
  const byDayPopupView: Record<string, number> = {};
  for (const r of rows) {
    if (r.event !== 'popup_view') continue;
    const day = dayOf(r);
    byDayPopupView[day] = (byDayPopupView[day] ?? 0) + 1;
  }
  const lpDays = Array.from(new Set([...Object.keys(byDayPageView), ...Object.keys(byDayPopupView)])).sort();

  const byOsUaScrollSignal: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (r.event !== 'scroll_up_signal') continue;
    const osLabel = r.os === '' || r.os == null ? '(なし)' : r.os;
    const uaLabel = r.ua_family === '' || r.ua_family == null ? '(不明)' : r.ua_family;
    byOsUaScrollSignal[osLabel] ??= {};
    byOsUaScrollSignal[osLabel][uaLabel] = (byOsUaScrollSignal[osLabel][uaLabel] ?? 0) + 1;
  }

  const byLpClickUrl: Record<string, number> = {};
  for (const r of rows) {
    if (r.event !== 'lp_click') continue;
    const label = r.param === '' || r.param == null ? '(なし)' : r.param;
    byLpClickUrl[label] = (byLpClickUrl[label] ?? 0) + 1;
  }
  // PHP の arsort（値降順）で上位20件
  const byLpClickUrlTop: Record<string, number> = {};
  Object.entries(byLpClickUrl)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([k, v]) => { byLpClickUrlTop[k] = v; });

  // ⑪ アニメ指標。preview sid は動作確認用のため集計対象から除外する
  const animePopupSids = new Set<string>();
  for (const r of rows) {
    if (r.event !== 'popup_view') continue;
    if (r.param === 'preview') continue;
    if (!(r.v ?? '').startsWith('v3d-2.')) continue;
    animePopupSids.add(r.sid ?? '');
  }
  const animePopupCount = animePopupSids.size;
  const animeEndCounts = { complete: 0, skip_talk: 0, skip_bridge: 0 };
  for (const r of rows) {
    if (r.event !== 'anime_end') continue;
    if (!(r.v ?? '').startsWith('v3d-2.')) continue;
    const sid = r.sid ?? '';
    const param = r.param ?? '';
    if (!animePopupSids.has(sid)) continue;
    if (!(param in animeEndCounts)) continue;
    animeEndCounts[param as 'complete' | 'skip_talk' | 'skip_bridge']++;
  }
  const animeEndTotal = animeEndCounts.complete + animeEndCounts.skip_talk + animeEndCounts.skip_bridge;
  const animeLeaveCount = Math.max(0, animePopupCount - animeEndTotal);
  const animeBridgeReached = animeEndCounts.complete + animeEndCounts.skip_bridge;

  return {
    total: rows.length,
    byDayEvent,
    funnel: { view: viewCount, play: playCount, clear: clearCount, cta: ctaCount },
    byUrl,
    bySource,
    funnelBySource,
    byClose,
    leaveRate,
    byOs,
    byOsSource,
    byExit,
    noActRate,
    byUaPopup,
    byUaExit,
    lp: { byDayPageView, byDayPopupView, lpDays, byOsUaScrollSignal, byLpClickUrlTop },
    anime: { animePopupCount, animeEndCounts, animeLeaveCount, animeBridgeReached },
  };
}

// allEvents 列定義（Task 5 の描画で使用）
export const ALL_EVENTS_COLUMNS = ALL_EVENTS;
