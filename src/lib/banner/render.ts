// 離脱バナーの集計ページの HTML（1枚・外部の script / CSS / フォントを読まない）
import {
  periodHref, periodLabel, recentDays, destOf,
  type Period, type PeriodStats, type CreativeSummary, type CreativeFunnel,
  type DayRow, type TrialStats,
} from './metrics.ts';

export interface ConfigRow {
  stopped: number;
  active_vs: string;
  cycle_done: number;
  updated_at: string;
  updated_by: string;
}

export interface CreativeRow {
  v: string;
  dest: string;
  trial_order: number;
  status: string;
  started_at: string | null;
  decided_at: string | null;
  decided_views: number | null;
  decided_taps: number | null;
  decided_store: number | null;
}

export interface BannerDailyRow {
  day: string;
  v: string;
  views: number;
  taps: number;
  store: number;
  status: string;
  stopped: number;
  written_at: string;
}

// null = その欄が読めなかった（D1 の例外）。undefined = 表がまだ無い（未設定）
export interface PageData {
  period: Period;
  today: string;
  days: number;
  stats?: PeriodStats | null;
  daily?: DayRow[] | null;
  trial?: TrialStats | null;
  trialStartedAt?: string;
  config?: ConfigRow | null;
  creatives?: CreativeRow[] | null;
  bannerDaily?: BannerDailyRow[] | null;
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pct(x: number | null): string {
  return x === null ? '—' : `${(x * 100).toFixed(1)}%`;
}

const UNSET = '<p class="unset">未設定</p>';
const UNREAD = '<p class="unset">読めませんでした</p>';

const STATUS_JA: Record<string, string> = {
  pending: '未判定',
  trialing: '試し中',
  cut: '打ち切り',
  pass: '合格',
  fail: '不合格',
};

const DEST_JA: Record<string, string> = {
  app: 'ストア直行',
  check_b: 'チェックB',
  check_c: 'チェックC',
  unknown: '不明',
};

function shortV(v: string): string {
  return v.replace(/^banner-\d+-/, '');
}

function summaryTable(list: CreativeSummary[]): string {
  if (list.length === 0) return '<p class="unset">この期間の表示はありません</p>';
  const rows = list.map((s) => `<tr>
<td>${esc(shortV(s.v))}<span class="sub">${esc(s.v)}</span></td>
<td>${esc(DEST_JA[s.dest] ?? s.dest)}</td>
<td class="n">${s.views}</td>
<td class="n">${s.taps}</td>
<td class="n">${pct(s.tapRate)}</td>
<td class="n">${s.store}</td>
<td class="n">${pct(s.storeRate)}</td>
</tr>`).join('');
  return `<table>
<thead><tr><th>案</th><th>行き先</th><th>表示</th><th>タップ</th><th>タップ率</th><th>ストア到達</th><th>ストア到達率</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

function funnelTables(list: CreativeFunnel[]): string {
  if (list.length === 0) return '<p class="unset">この期間の表示はありません</p>';
  return list.map((f) => {
    const rows = [`<tr><td>表示</td><td class="n">${f.views}</td><td class="n">—</td><td class="n">100.0%</td></tr>`]
      .concat(f.stages.map((s) => `<tr><td>${esc(s.label)}</td><td class="n">${s.count}</td><td class="n">${pct(s.fromPrev)}</td><td class="n">${pct(s.fromViews)}</td></tr>`))
      .join('');
    return `<h3>${esc(shortV(f.v))}（${esc(DEST_JA[f.dest] ?? f.dest)}）</h3>
<table>
<thead><tr><th>段階</th><th>人数</th><th>前の段階から</th><th>表示から</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  }).join('');
}

function dailyTable(daily: DayRow[], vs: string[]): string {
  if (vs.length === 0) return '<p class="unset">まだ表示がありません</p>';
  const head = vs.map((v) => `<th colspan="3">${esc(shortV(v))}</th>`).join('');
  const sub = vs.map(() => '<th class="n">表示</th><th class="n">タップ</th><th class="n">ストア</th>').join('');
  const rows = daily.map((d) => {
    const cells = vs.map((v) => {
      const c = d.byV[v];
      return c
        ? `<td class="n">${c.views}</td><td class="n">${c.taps}</td><td class="n">${c.store}</td>`
        : '<td class="n">0</td><td class="n">0</td><td class="n">0</td>';
    }).join('');
    return `<tr><td><a href="${esc(periodHref({ kind: 'day', day: d.day }))}">${esc(d.day)}</a></td>${cells}</tr>`;
  }).join('');
  return `<table>
<thead><tr><th rowspan="2">日（JST）</th>${head}</tr><tr>${sub}</tr></thead>
<tbody>${rows}</tbody></table>`;
}

function trialBlock(trial: TrialStats, startedAt: string): string {
  const t = trial.first1000;
  const tapRate = t.views > 0 ? pct(t.taps / t.views) : '—';
  const cut = trial.first300.views >= 300
    ? (trial.first300.taps <= 10
      ? '打ち切り判定に当たる（300件で10件以下。次の定期実行で反映）'
      : '打ち切り判定（300件で10件以下）は通過')
    : `打ち切り判定まで あと ${300 - trial.first300.views} 件`;
  return `<p class="big">${esc(shortV(trial.v))} 試し中: 表示 ${t.views}/1,000・タップ ${t.taps}件（${tapRate}）・${esc(cut)}</p>
<table>
<thead><tr><th>範囲</th><th>表示</th><th>タップ</th><th>ストア到達</th><th>その件数に達した時刻</th></tr></thead>
<tbody>
<tr><td>先頭 300件</td><td class="n">${trial.first300.views}</td><td class="n">${trial.first300.taps}</td><td class="n">${trial.first300.store}</td><td>${esc(trial.at300 || '—')}</td></tr>
<tr><td>先頭 1,000件</td><td class="n">${trial.first1000.views}</td><td class="n">${trial.first1000.taps}</td><td class="n">${trial.first1000.store}</td><td>${esc(trial.at1000 || '—')}</td></tr>
<tr><td>試し開始からの全件</td><td class="n">${trial.total}</td><td class="n">—</td><td class="n">—</td><td>開始 ${esc(startedAt)}</td></tr>
</tbody></table>
<p class="note">試しの数は、試しを始めた時刻（started_at）からの先頭の件数だけで数えるので、全期間の合計とは合いません。</p>`;
}

function creativesTable(rows: CreativeRow[], config: ConfigRow | null | undefined): string {
  const body = rows.length === 0
    ? '<tr><td colspan="9">行がありません</td></tr>'
    : rows.map((c) => `<tr>
<td>${esc(shortV(c.v))}<span class="sub">${esc(c.v)}</span></td>
<td>${esc(DEST_JA[c.dest] ?? c.dest)}</td>
<td class="n">${c.trial_order}</td>
<td>${esc(STATUS_JA[c.status] ?? c.status)}</td>
<td>${esc(c.started_at || '—')}</td>
<td>${esc(c.decided_at || '—')}</td>
<td class="n">${c.decided_views ?? '—'}</td>
<td class="n">${c.decided_taps ?? '—'}</td>
<td class="n">${c.decided_store ?? '—'}</td>
</tr>`).join('');
  const cfg = config
    ? `<p>全停止: ${config.stopped ? '<strong>している</strong>' : 'していない'}／今出している案: ${esc(config.active_vs)}／一巡: ${config.cycle_done ? 'した' : 'していない'}<span class="sub">更新 ${esc(config.updated_at)}（${esc(config.updated_by)}）</span></p>`
    : '<p class="unset">設定（banner_config）は未設定</p>';
  return `${cfg}
<table>
<thead><tr><th>案</th><th>行き先</th><th>順番</th><th>状態</th><th>started_at</th><th>判定の時刻</th><th>判定の表示</th><th>判定のタップ</th><th>判定のストア</th></tr></thead>
<tbody>${body}</tbody></table>`;
}

function bannerDailyTable(rows: BannerDailyRow[]): string {
  if (rows.length === 0) return '<p class="unset">行がありません</p>';
  const body = rows.map((r) => `<tr>
<td>${esc(r.day)}</td><td>${esc(shortV(r.v))}</td>
<td class="n">${r.views}</td><td class="n">${r.taps}</td><td class="n">${r.store}</td>
<td>${esc(STATUS_JA[r.status] ?? r.status)}</td><td>${r.stopped ? '全停止' : '—'}</td><td>${esc(r.written_at)}</td>
</tr>`).join('');
  return `<table>
<thead><tr><th>日</th><th>案</th><th>表示</th><th>タップ</th><th>ストア到達</th><th>状態</th><th>全停止</th><th>書いた時刻</th></tr></thead>
<tbody>${body}</tbody></table>`;
}

function periodLinks(period: Period, today: string, days: number): string {
  const items: string[] = [];
  const mark = (p: Period, label: string): string => {
    const same = p.kind === period.kind && (p.kind !== 'day' || (period.kind === 'day' && p.day === period.day));
    return same
      ? `<strong>${esc(label)}</strong>`
      : `<a href="${esc(periodHref(p))}">${esc(label)}</a>`;
  };
  items.push(mark({ kind: 'all' }, '全期間'));
  items.push(mark({ kind: 'fix' }, '改修の前後'));
  for (const d of recentDays(today, days)) items.push(mark({ kind: 'day', day: d }, d));
  return `<p class="links">${items.join(' ｜ ')}</p>`;
}

const STYLE = `:root{color-scheme:light dark}
body{font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;margin:16px;line-height:1.6;max-width:1100px}
h1{font-size:1.4rem;margin:0 0 4px}
h2{font-size:1.1rem;margin:28px 0 8px;border-bottom:2px solid currentColor;padding-bottom:2px}
h3{font-size:1rem;margin:16px 0 4px}
table{border-collapse:collapse;margin:8px 0;font-size:.95rem}
th,td{border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top}
th{background:rgba(127,127,127,.15)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.sub{display:block;font-size:.75rem;opacity:.6}
.note{font-size:.85rem;opacity:.75;margin:4px 0}
.unset{opacity:.7;margin:4px 0}
.links{line-height:2.2;word-break:break-word}
.big{font-size:1.05rem;font-weight:700;margin:8px 0}
.stopped{background:#b00020;color:#fff;padding:8px 12px;font-weight:700;border-radius:4px;margin:0 0 12px}
@media (max-width:600px){body{margin:8px}table{font-size:.85rem}th,td{padding:3px 5px}}`;

export function renderBannerStats(data: PageData): string {
  const { period, today, days } = data;
  const label = periodLabel(period);
  const vsSeen = new Set<string>();
  if (data.daily) for (const d of data.daily) for (const v of Object.keys(d.byV)) vsSeen.add(v);
  if (data.stats) for (const s of data.stats.summary) vsSeen.add(s.v);
  const vs = Array.from(vsSeen).sort((a, b) => a.localeCompare(b));

  const stopped = data.config && data.config.stopped === 1
    ? '<p class="stopped">全停止中（バナーは誰にも出ません）</p>'
    : '';

  let summarySection: string;
  let funnelSection: string;
  if (data.stats === null) {
    summarySection = UNREAD;
    funnelSection = UNREAD;
  } else if (!data.stats) {
    summarySection = UNSET;
    funnelSection = UNSET;
  } else if (period.kind === 'fix') {
    summarySection = `<h3>改修の前（${esc(FIX_NOTE_BEFORE)}）</h3>${summaryTable(data.stats.summaryBefore ?? [])}
<h3>改修の後</h3>${summaryTable(data.stats.summaryAfter ?? [])}
<p class="note">表示とタップは「最初にバナーが出た時刻」で前後に分け、チェック開始から先の段階は「チェック開始の印（cv=20261001）」で前後に分けています。分け方が2つあるため、同じ人が表示では前、チェックでは後に入ることがあります。</p>`;
    funnelSection = `<h3>改修の前</h3>${funnelTables(data.stats.funnelsBefore ?? [])}
<h3>改修の後</h3>${funnelTables(data.stats.funnelsAfter ?? [])}`;
  } else {
    summarySection = summaryTable(data.stats.summary);
    funnelSection = funnelTables(data.stats.funnels);
  }

  const dailySection = data.daily === null ? UNREAD : data.daily ? dailyTable(data.daily, vs) : UNSET;

  let trialSection: string;
  if (data.trial === null) trialSection = UNREAD;
  else if (data.trial === undefined) trialSection = data.creatives ? '<p class="unset">試し中の案はありません</p>' : UNSET;
  else trialSection = trialBlock(data.trial, data.trialStartedAt ?? '');

  const judgeSection = data.creatives === null
    ? UNREAD
    : data.creatives
      ? creativesTable(data.creatives, data.config)
      : UNSET;

  const bdSection = data.bannerDaily === null ? UNREAD : data.bannerDaily ? bannerDailyTable(data.bannerDaily) : UNSET;

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>離脱バナーの成績（${esc(label)}）</title>
<style>${STYLE}</style>
</head><body>
${stopped}<h1>離脱バナーの成績</h1>
<p class="big">期間: ${esc(label)}</p>
<p class="note">表示＝バナーが出た人数、タップ＝押した人数、ストア到達＝ストアへ進んだ人数。同じ人は1回、検査用（9909）は除く。</p>
<h2>期間</h2>
${periodLinks(period, today, days)}
<h2>案ごとの集計（${esc(label)}）</h2>
${summarySection}
<h2>日×案の一覧（直近${days}日）</h2>
${dailySection}
<h2>段階ごとの通過率（${esc(label)}）</h2>
${funnelSection}
<h2>試し中の案の進み具合</h2>
${trialSection}
<h2>判定の状態</h2>
${judgeSection}
<h2>日次の要約（banner_daily）</h2>
${bdSection}
</body></html>`;
}

const FIX_NOTE_BEFORE = '2026-10-01 13:15:54 より前';
