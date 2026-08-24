// /mm 計測イベント集計のHTML表示
// $SRC/php/stats.php の HTMLテンプレ（①〜⑪）を1:1移植したもの
import { mtrRate, sortedEntries, ALL_EVENTS_COLUMNS, type Stats } from './aggregate.ts';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderStatsHtml(stats: Stats, totalLabel: string): string {
  const { funnel, byUrl, bySource, funnelBySource, byClose, leaveRate, byOs, byOsSource, byExit, noActRate, byUaPopup, byUaExit, lp, anime } = stats;

  const byDayEventRows = sortedEntries(stats.byDayEvent).map(([day, counts]) => `
<tr><td>${esc(day)}</td>
${ALL_EVENTS_COLUMNS.map((ev) => `<td>${counts[ev] ?? 0}</td>`).join('')}
</tr>`).join('');

  const byUrlRows = sortedEntries(byUrl).map(([url, counts]) => `
<tr><td>${esc(url)}</td>
<td>${counts['popup_view'] ?? 0}</td>
<td>${counts['cta_search'] ?? 0}</td>
<td>${counts['cta_ios'] ?? 0}</td>
<td>${counts['cta_android'] ?? 0}</td>
</tr>`).join('');

  const bySourceRows = sortedEntries(bySource).map(([label, count]) => `
<tr><td>${esc(label)}</td><td>${count}</td></tr>`).join('');

  const funnelBySourceRows = sortedEntries(funnelBySource).map(([source, f]) => `
<tr><td>${esc(source)}</td>
<td>${f.popup_view}</td>
<td>${f.play_start}</td>
<td>${esc(mtrRate(f.play_start, f.popup_view))}</td>
<td>${f.all_clear}</td>
<td>${esc(mtrRate(f.all_clear, f.play_start))}</td>
<td>${f.cta}</td>
<td>${esc(mtrRate(f.cta, f.all_clear))}</td>
</tr>`).join('');

  const byCloseRows = sortedEntries(byClose).map(([label, count]) => `
<tr><td>${esc(label)}</td><td>${count}</td></tr>`).join('');

  const byOsRows = sortedEntries(byOs).map(([label, count]) => `
<tr><td>${esc(label)}</td><td>${count}</td></tr>`).join('');

  const byOsSourceRows = sortedEntries(byOsSource).flatMap(([os, sources]) =>
    sortedEntries(sources).map(([source, count]) => `
<tr><td>${esc(os)}</td><td>${esc(source)}</td><td>${count}</td></tr>`)
  ).join('');

  const byExitRows = sortedEntries(byExit).map(([label, count]) => `
<tr><td>exit_no_popup: ${esc(label)}</td><td>${count}</td></tr>`).join('');

  const byUaPopupRows = sortedEntries(byUaPopup).flatMap(([uaLabel, params]) =>
    sortedEntries(params).map(([paramLabel, count]) => `
<tr><td>${esc(uaLabel)}</td><td>${esc(paramLabel)}</td><td>${count}</td></tr>`)
  ).join('');

  const byUaExitRows = sortedEntries(byUaExit).flatMap(([uaLabel, params]) =>
    sortedEntries(params).map(([paramLabel, count]) => `
<tr><td>${esc(uaLabel)}</td><td>${esc(paramLabel)}</td><td>${count}</td></tr>`)
  ).join('');

  const lpDaysRows = lp.lpDays.map((day) => {
    const pv = lp.byDayPageView[day] ?? 0;
    const pop = lp.byDayPopupView[day] ?? 0;
    return `
<tr><td>${esc(day)}</td>
<td>${pv}</td>
<td>${pop}</td>
<td>${pv > 0 ? esc(mtrRate(pop, pv)) : '-'}</td>
</tr>`;
  }).join('');

  const byOsUaScrollSignalRows = sortedEntries(lp.byOsUaScrollSignal).flatMap(([osLabel, uaCounts]) =>
    sortedEntries(uaCounts).map(([uaLabel, count]) => `
<tr><td>${esc(osLabel)}</td><td>${esc(uaLabel)}</td><td>${count}</td></tr>`)
  ).join('');

  const byLpClickUrlTopRows = Object.entries(lp.byLpClickUrlTop).map(([label, count]) => `
<tr><td>${esc(label)}</td><td>${count}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>ミエトレ計測集計</title>
<style>
  body{font-family:sans-serif;padding:20px;color:#333;}
  h1{font-size:18px;} h2{font-size:15px;margin-top:32px;}
  table{border-collapse:collapse;margin-top:8px;font-size:13px;}
  th,td{border:1px solid #ccc;padding:4px 8px;text-align:right;}
  th{background:#f0f0f0;} td:first-child,th:first-child{text-align:left;}
</style>
</head>
<body>
<h1>ミエトレ計測集計（対象イベント数: ${esc(totalLabel)}件）</h1>

<h2>① 日別 × イベント別件数</h2>
<table>
<tr><th>日付</th>${ALL_EVENTS_COLUMNS.map((ev) => `<th>${esc(ev)}</th>`).join('')}</tr>
${byDayEventRows}
</table>

<h2>② ファネル（popup_view → play_start → all_clear → CTA合算）</h2>
<table>
<tr><th>段階</th><th>件数</th><th>直前比</th></tr>
<tr><td>popup_view</td><td>${funnel.view}</td><td>-</td></tr>
<tr><td>play_start</td><td>${funnel.play}</td><td>${esc(mtrRate(funnel.play, funnel.view))}</td></tr>
<tr><td>all_clear</td><td>${funnel.clear}</td><td>${esc(mtrRate(funnel.clear, funnel.play))}</td></tr>
<tr><td>cta合算(search+ios+android)</td><td>${funnel.cta}</td><td>${esc(mtrRate(funnel.cta, funnel.clear))}</td></tr>
</table>

<h2>③ ページURL別 popup_view / CTA内訳</h2>
<table>
<tr><th>URL</th><th>popup_view</th><th>cta_search</th><th>cta_ios</th><th>cta_android</th></tr>
${byUrlRows}
</table>

<h2>④ 発火元別 popup_view</h2>
<table>
<tr><th>発火元</th><th>popup_view</th></tr>
${bySourceRows}
</table>

<h2>⑤ 発火元別ファネル</h2>
<table>
<tr><th>発火元</th><th>popup_view</th><th>play_start</th><th>直前比</th><th>all_clear</th><th>直前比</th><th>cta合算</th><th>直前比</th></tr>
${funnelBySourceRows}
</table>

<h2>⑥ popup_close の内訳</h2>
<p>leave比率（表示直後の離脱＝歓迎されていない可能性の代理指標）: ${esc(leaveRate)}</p>
<table>
<tr><th>close理由</th><th>件数</th></tr>
${byCloseRows}
</table>

<h2>⑦ OS別内訳</h2>
<table>
<tr><th>OS</th><th>popup_view</th></tr>
${byOsRows}
</table>

<h3>OS × 発火元 クロス集計</h3>
<table>
<tr><th>OS</th><th>発火元</th><th>popup_view</th></tr>
${byOsSourceRows}
</table>

<h2>⑧ 離脱時の結末（ポップアップを出せなかったセッション）</h2>
<p>no_activation比率（backが原理的に届かなかった訪問者の割合。分母 = popup_view + exit_no_popup合計）: <b>${esc(noActRate)}</b></p>
<table>
<tr><th>結末</th><th>件数</th></tr>
<tr><td>popup_view（表示できた）</td><td>${funnel.view}</td></tr>
${byExitRows}
</table>

<h2>⑨ UA別集計</h2>
<h3>UA種別 × 発火元 popup_view</h3>
<table>
<tr><th>ua_family</th><th>発火元</th><th>popup_view</th></tr>
${byUaPopupRows}
</table>

<h3>UA種別 × exit_no_popup 内訳</h3>
<table>
<tr><th>ua_family</th><th>結末</th><th>件数</th></tr>
${byUaExitRows}
</table>

<h2>⑩ LP指標</h2>
<h3>日別 page_view件数 と表示率</h3>
<table>
<tr><th>日付</th><th>page_view</th><th>popup_view</th><th>表示率</th></tr>
${lpDaysRows}
</table>

<h3>scroll_up_signal（AUX countモードのシャドウ計測） OS × ua_family別件数</h3>
<table>
<tr><th>OS</th><th>ua_family</th><th>scroll_up_signal</th></tr>
${byOsUaScrollSignalRows}
</table>

<h3>lp_click リンク先URL別件数（上位20）</h3>
<table>
<tr><th>リンク先URL</th><th>lp_click</th></tr>
${byLpClickUrlTopRows}
</table>

<h2>⑪ アニメ指標</h2>
<p>対象は非previewセッション。アニメ表示（popup_view）を分母に、完走・スキップ経路・アニメ中離脱を表示する。</p>
<table>
<tr><th>指標</th><th>件数</th><th>popup_view比</th></tr>
<tr><td>popup_view（アニメ表示）</td><td>${anime.animePopupCount}</td><td>-</td></tr>
<tr><td>anime_end: complete</td><td>${anime.animeEndCounts.complete}</td><td>${esc(mtrRate(anime.animeEndCounts.complete, anime.animePopupCount))}</td></tr>
<tr><td>anime_end: skip_talk</td><td>${anime.animeEndCounts.skip_talk}</td><td>${esc(mtrRate(anime.animeEndCounts.skip_talk, anime.animePopupCount))}</td></tr>
<tr><td>anime_end: skip_bridge</td><td>${anime.animeEndCounts.skip_bridge}</td><td>${esc(mtrRate(anime.animeEndCounts.skip_bridge, anime.animePopupCount))}</td></tr>
<tr><td>アニメ中離脱</td><td>${anime.animeLeaveCount}</td><td>${esc(mtrRate(anime.animeLeaveCount, anime.animePopupCount))}</td></tr>
<tr><td>ブリッジ到達（complete + skip_bridge）</td><td>${anime.animeBridgeReached}</td><td>${esc(mtrRate(anime.animeBridgeReached, anime.animePopupCount))}</td></tr>
</table>

</body>
</html>
`;
}
