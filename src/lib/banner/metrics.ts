// 離脱バナーの数え方（2026-10-02 人の決定。TASK-I16-20261002-001）。
// 集計ページ（src/routes/banner-stats.ts）と定期実行（TASK-I16-20261002-003）は、このファイルの関数だけを使う。
// SQL を組み立てる関数は D1 を触らない（テストで SQLite にそのまま流せるようにするため）。

// チェックページ B/C の改修の本番反映（TASK-I16-20261001-001）
export const FIX_BOUNDARY = '2026-10-01T13:15:54+09:00';
// 改修後の check_start が付ける param
export const FIX_PARAM_AFTER = 'cv=20261001';

export type Dest = 'app' | 'check_b' | 'check_c' | 'unknown';

// 今の6本。これ以外の v は dest を引けないので、タップの param と cta_store から決める
export const DEST_BY_V: Record<string, Dest> = {
  'banner-20260928-A1': 'app',
  'banner-20260928-A2': 'app',
  'banner-20260928-A3': 'app',
  'banner-20260928-B': 'check_b',
  'banner-20260928-C': 'check_c',
  // キャンペーン説明の A7（TASK-I16-20261007-001）。ストア直行なので A1〜A3 と同じ数え方
  'banner-20261008-A7': 'app',
};

export function destOf(v: string): Dest {
  return DEST_BY_V[v] ?? 'unknown';
}

export type Period =
  | { kind: 'all' }
  | { kind: 'fix' }
  | { kind: 'day'; day: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?p=all（既定）・?p=fix・?p=day&d=YYYY-MM-DD。形が違えば null（道が 400 を返す）
export function parsePeriod(params: URLSearchParams): Period | null {
  const p = params.get('p');
  if (p === null || p === 'all') return { kind: 'all' };
  if (p === 'fix') return { kind: 'fix' };
  if (p === 'day') {
    const d = params.get('d') ?? '';
    if (!DAY_RE.test(d)) return null;
    const [y, m, day] = d.split('-').map(Number);
    if (m < 1 || m > 12 || day < 1 || day > 31) return null;
    const probe = new Date(Date.UTC(y, m - 1, day));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) return null;
    return { kind: 'day', day: d };
  }
  return null;
}

export function periodHref(period: Period): string {
  if (period.kind === 'all') return '/mm/banner-stats';
  if (period.kind === 'fix') return '/mm/banner-stats?p=fix';
  return `/mm/banner-stats?p=day&d=${period.day}`;
}

export function periodLabel(period: Period): string {
  if (period.kind === 'all') return '全期間';
  if (period.kind === 'fix') return '改修の前後';
  return `${period.day}（JST）`;
}

// 集計に使う event。索引のある event で絞って走査を1回にする
export const COUNTED_EVENTS = [
  'banner_view', 'banner_tap', 'check_start', 'check_answer',
  'check_result', 'rule_view', 'trial_start', 'trial_clear', 'cta_store',
];

// 検査用（9909 始まり）と sid 空を除く
const EXCLUDE_SID = "sid <> '' AND sid NOT LIKE '9909%'";

const EVENT_LIST = COUNTED_EVENTS.map((e) => `'${e}'`).join(', ');

// (v, sid) ごとに、最初の banner_view（received_at と id は同じ1行から取る）と、各段階の有無を作る。
// sinceParam（例 '?3'）を渡すと received_at の下限で絞る。そのときだけ `+event` にして idx_events_event を
// 使わせず、idx_events_received_at を使わせる（SQLite は1つの表で索引を1つしか選ばない）。
// 渡さないときの SQL 文字列は -001 のときと1文字も変えない。
function withEventMarks(extraEvWhere: string, sinceParam?: string): string {
  const eventCond = sinceParam === undefined ? `event IN (${EVENT_LIST})` : `+event IN (${EVENT_LIST})`;
  const sinceCond = sinceParam === undefined ? '' : ` AND received_at >= ${sinceParam}`;
  return `WITH ev AS MATERIALIZED (
  SELECT v, sid, event, param, received_at, id
  FROM events
  WHERE ${eventCond} AND ${EXCLUDE_SID}${extraEvWhere}${sinceCond}
),
fv AS (
  SELECT v, sid, received_at AS first_at, id AS first_id FROM (
    SELECT v, sid, received_at, id,
           ROW_NUMBER() OVER (PARTITION BY v, sid ORDER BY received_at, id) AS rn
    FROM ev WHERE event = 'banner_view'
  ) WHERE rn = 1
),
m AS (
  SELECT v, sid,
    MAX(CASE WHEN event = 'banner_tap' THEN 1 ELSE 0 END) AS tap,
    MAX(CASE WHEN event = 'banner_tap' AND param = 'app' THEN 1 ELSE 0 END) AS tap_app,
    MAX(CASE WHEN event = 'check_start' THEN 1 ELSE 0 END) AS cs,
    MAX(CASE WHEN event = 'check_start' AND param = '${FIX_PARAM_AFTER}' THEN 1 ELSE 0 END) AS cs_after,
    MAX(CASE WHEN event = 'check_start' AND param = '' THEN 1 ELSE 0 END) AS cs_before,
    MAX(CASE WHEN event = 'check_answer' AND param LIKE 'q=1;%' THEN 1 ELSE 0 END) AS q1,
    MAX(CASE WHEN event = 'check_answer' AND param LIKE 'q=2;%' THEN 1 ELSE 0 END) AS q2,
    MAX(CASE WHEN event = 'check_answer' AND param LIKE 'q=3;%' THEN 1 ELSE 0 END) AS q3,
    MAX(CASE WHEN event = 'rule_view' THEN 1 ELSE 0 END) AS rule_view,
    MAX(CASE WHEN event = 'trial_start' THEN 1 ELSE 0 END) AS trial_start,
    MAX(CASE WHEN event = 'trial_clear' THEN 1 ELSE 0 END) AS trial_clear,
    MAX(CASE WHEN event = 'check_result' THEN 1 ELSE 0 END) AS check_result,
    MAX(CASE WHEN event = 'cta_store' THEN 1 ELSE 0 END) AS store
  FROM ev GROUP BY v, sid
)`;
}

// 段階の列。fix では check_start 以降を check_start の param で前後に分けるため、_b・_a も出す
const STAGE_COLUMNS = ['cs', 'q1', 'q2', 'q3', 'rule_view', 'trial_start', 'trial_clear', 'check_result', 'store'];

function stageSums(): string {
  return STAGE_COLUMNS.map((c) => {
    const col = `COALESCE(m.${c}, 0)`;
    return `    SUM(${col}) AS ${c},
    SUM(CASE WHEN COALESCE(m.cs_before, 0) = 1 AND ${col} = 1 THEN 1 ELSE 0 END) AS ${c}_b,
    SUM(CASE WHEN COALESCE(m.cs_after, 0) = 1 AND ${col} = 1 THEN 1 ELSE 0 END) AS ${c}_a`;
  }).join(',\n');
}

export interface StatsSql {
  sql: string;
  binds: string[];
}

// 期間ごとの集計。1本で、案 × 日 × 改修の前後 の行を返す（表示の振り分けは最初の banner_view）。
// 行は案5本 × 日数 × 2 までなので、JS 側で足し合わせても小さい。
// 日の絞り込みは SQL では行わない（日×案の一覧も同じ1本で賄い、events の走査を増やさないため）。
// 絞り込みは toPeriodStats が period を見て行う。
// since（JST の時刻）を渡すと、その時刻以降の event だけを読む（日次の記録はこれを使う）。
// 渡さないときの SQL と binds は -001 のまま（集計ページは今の呼び方を変えない）。
export function buildStatsSql(_period: Period, since?: string): StatsSql {
  const binds: string[] = [FIX_BOUNDARY];
  let sinceParam: string | undefined;
  if (since !== undefined) {
    binds.push(since);
    sinceParam = `?${binds.length}`;
  }
  const where = '';
  const sql = `${withEventMarks('', sinceParam)}
SELECT fv.v AS v,
    substr(fv.first_at, 1, 10) AS day,
    CASE WHEN fv.first_at < ?1 THEN 'before' ELSE 'after' END AS seg,
    COUNT(*) AS views,
    SUM(COALESCE(m.tap, 0)) AS taps,
    SUM(COALESCE(m.tap_app, 0)) AS taps_app,
    SUM(CASE WHEN COALESCE(m.tap_app, 0) = 1 OR COALESCE(m.store, 0) = 1 THEN 1 ELSE 0 END) AS store_any,
${stageSums()}
FROM fv LEFT JOIN m ON m.v = fv.v AND m.sid = fv.sid${where}
GROUP BY fv.v, day, seg
ORDER BY fv.v, day, seg`;
  return { sql, binds };
}

export interface StatRow {
  v: string;
  day: string;
  seg: string;
  views: number;
  taps: number;
  taps_app: number;
  store_any: number;
  [key: string]: string | number;
}

export interface CreativeSummary {
  v: string;
  dest: Dest;
  views: number;
  taps: number;
  store: number;
  tapRate: number | null;
  storeRate: number | null;
}

export interface Stage {
  key: string;
  label: string;
  count: number;
  fromPrev: number | null;
  fromViews: number | null;
}

export interface CreativeFunnel {
  v: string;
  dest: Dest;
  views: number;
  stages: Stage[];
}

export interface DayRow {
  day: string;
  byV: Record<string, { views: number; taps: number; store: number }>;
}

export interface PeriodStats {
  summary: CreativeSummary[];
  funnels: CreativeFunnel[];
  // 改修の前後のときだけ入る
  summaryBefore?: CreativeSummary[];
  summaryAfter?: CreativeSummary[];
  funnelsBefore?: CreativeFunnel[];
  funnelsAfter?: CreativeFunnel[];
}

function num(row: StatRow, key: string): number {
  const x = row[key];
  return typeof x === 'number' ? x : Number(x ?? 0);
}

function rate(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

const STAGE_LABEL: Record<string, string> = {
  views: '表示',
  taps: 'タップ',
  cs: 'チェック開始',
  q1: '第1問',
  q2: '第2問',
  q3: '第3問',
  rule_view: 'ルール説明',
  trial_start: 'ゲーム開始',
  trial_clear: '全消し',
  check_result: '結果画面',
  store: 'ストアへ',
};

function stageKeysFor(dest: Dest): string[] {
  if (dest === 'app') return ['taps'];
  if (dest === 'check_b') return ['taps', 'cs', 'q1', 'q2', 'q3', 'check_result', 'store'];
  if (dest === 'check_c') return ['taps', 'cs', 'q1', 'q2', 'q3', 'rule_view', 'trial_start', 'trial_clear', 'check_result', 'store'];
  return ['taps', 'cs', 'q1', 'q2', 'q3', 'rule_view', 'trial_start', 'trial_clear', 'check_result', 'store'];
}

function storeCountOf(dest: Dest, acc: Record<string, number>): number {
  if (dest === 'app') return acc.taps;
  if (dest === 'unknown') return acc.store_any;
  return acc.store;
}

// seg: 'before' / 'after' / null（分けない）。suffix: 段階の列の添字（fix では '_b' / '_a'）
function accumulate(rows: StatRow[], seg: string | null, suffix: string, day?: string): Map<string, Record<string, number>> {
  const byV = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (seg !== null && r.seg !== seg) continue;
    if (day !== undefined && r.day !== day) continue;
    let acc = byV.get(r.v);
    if (!acc) {
      acc = { views: 0, taps: 0, taps_app: 0, store_any: 0 };
      for (const c of STAGE_COLUMNS) acc[c] = 0;
      byV.set(r.v, acc);
    }
    acc.views += num(r, 'views');
    acc.taps += num(r, 'taps');
    acc.taps_app += num(r, 'taps_app');
    acc.store_any += num(r, 'store_any');
    for (const c of STAGE_COLUMNS) acc[c] += num(r, c + suffix);
  }
  return byV;
}

// 段階の母数は「表示に数えた sid」。fix の check_start 以降は param で前後に分かれるため、
// 表示・タップ（最初の banner_view で分けたもの）とは分け方が違う。
function toSummaryList(byV: Map<string, Record<string, number>>): CreativeSummary[] {
  const out: CreativeSummary[] = [];
  for (const [v, acc] of byV) {
    const dest = destOf(v);
    const store = storeCountOf(dest, acc);
    out.push({
      v, dest,
      views: acc.views,
      taps: acc.taps,
      store,
      tapRate: rate(acc.taps, acc.views),
      storeRate: rate(store, acc.views),
    });
  }
  out.sort((a, b) => a.v.localeCompare(b.v));
  return out;
}

function toFunnelList(byV: Map<string, Record<string, number>>): CreativeFunnel[] {
  const out: CreativeFunnel[] = [];
  for (const [v, acc] of byV) {
    const dest = destOf(v);
    const keys = stageKeysFor(dest);
    const stages: Stage[] = [];
    let prev = acc.views;
    for (const k of keys) {
      const count = k === 'store' ? storeCountOf(dest, acc) : acc[k];
      stages.push({
        key: k,
        label: STAGE_LABEL[k] ?? k,
        count,
        fromPrev: rate(count, prev),
        fromViews: rate(count, acc.views),
      });
      prev = count;
    }
    out.push({ v, dest, views: acc.views, stages });
  }
  out.sort((a, b) => a.v.localeCompare(b.v));
  return out;
}

export function toPeriodStats(rows: StatRow[], period: Period): PeriodStats {
  if (period.kind === 'fix') {
    const before = accumulate(rows, 'before', '_b');
    const after = accumulate(rows, 'after', '_a');
    // 段階は check_start の param で分けるので、表示・タップの seg とは別に全行から集める
    const stageBefore = accumulate(rows, null, '_b');
    const stageAfter = accumulate(rows, null, '_a');
    for (const [v, acc] of before) { const s = stageBefore.get(v); if (s) for (const c of STAGE_COLUMNS) acc[c] = s[c]; }
    for (const [v, acc] of after) { const s = stageAfter.get(v); if (s) for (const c of STAGE_COLUMNS) acc[c] = s[c]; }
    return {
      summary: toSummaryList(accumulate(rows, null, '')),
      funnels: toFunnelList(accumulate(rows, null, '')),
      summaryBefore: toSummaryList(before),
      summaryAfter: toSummaryList(after),
      funnelsBefore: toFunnelList(before),
      funnelsAfter: toFunnelList(after),
    };
  }
  const day = period.kind === 'day' ? period.day : undefined;
  const byV = accumulate(rows, null, '', day);
  return { summary: toSummaryList(byV), funnels: toFunnelList(byV) };
}

// 日×案の一覧（直近 days 日。今日を含む）。buildStatsSql と同じ行から作る
export function toDaily(rows: StatRow[], today: string, days: number): DayRow[] {
  const wanted = recentDays(today, days);
  const byDay = new Map<string, DayRow>();
  for (const d of wanted) byDay.set(d, { day: d, byV: {} });
  for (const r of rows) {
    const slot = byDay.get(r.day);
    if (!slot) continue;
    const dest = destOf(r.v);
    const acc = slot.byV[r.v] ?? { views: 0, taps: 0, store: 0 };
    acc.views += num(r, 'views');
    acc.taps += num(r, 'taps');
    acc.store += dest === 'app' ? num(r, 'taps') : dest === 'unknown' ? num(r, 'store_any') : num(r, 'store');
    slot.byV[r.v] = acc;
  }
  return wanted.map((d) => byDay.get(d) as DayRow);
}

// JST の today（YYYY-MM-DD）から新しい順に days 日
export function recentDays(today: string, days: number): string[] {
  const out: string[] = [];
  const [y, m, d] = today.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  for (let i = 0; i < days; i += 1) {
    const t = new Date(base - i * 86400000);
    out.push(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`);
  }
  return out;
}

// JST の今日（YYYY-MM-DD）
export function jstToday(now: number): string {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface TrialCounts {
  views: number;
  taps: number;
  store: number;
}

export interface TrialStats {
  v: string;
  dest: Dest;
  // started_at 以降に表示があった sid の数（行き過ぎを含む全件）
  total: number;
  first300: TrialCounts;
  first1000: TrialCounts;
  // 300件目・1,000件目の sid の最初の banner_view の received_at（達していなければ空）
  at300: string;
  at1000: string;
}

// 試し中の案の進み具合。started_at 以降の最初の banner_view の早い順（同時刻は events.id 順）で
// 先頭 N 件だけを数える。並べ替えは D1 の窓関数で行い、JS では sid を並べない。
export function buildTrialSql(v: string, startedAt: string, since?: string): StatsSql {
  const dest = destOf(v);
  const storeExpr = dest === 'app'
    ? 'tap = 1'
    : dest === 'unknown'
      ? '(tap_app = 1 OR store = 1)'
      : 'store = 1';
  const binds: string[] = [v, startedAt];
  let sinceParam: string | undefined;
  if (since !== undefined) {
    binds.push(since);
    sinceParam = `?${binds.length}`;
  }
  const sql = `${withEventMarks(' AND v = ?1', sinceParam)}
,
fvs AS (
  SELECT v, sid, received_at AS first_at, id AS first_id FROM (
    SELECT v, sid, received_at, id,
           ROW_NUMBER() OVER (PARTITION BY v, sid ORDER BY received_at, id) AS rn
    FROM ev WHERE event = 'banner_view' AND received_at >= ?2
  ) WHERE rn = 1
),
ranked AS (
  SELECT fvs.sid,
    fvs.first_at,
    ROW_NUMBER() OVER (ORDER BY fvs.first_at, fvs.first_id) AS rn,
    COALESCE(m.tap, 0) AS tap,
    COALESCE(m.tap_app, 0) AS tap_app,
    COALESCE(m.store, 0) AS store
  FROM fvs LEFT JOIN m ON m.v = fvs.v AND m.sid = fvs.sid
)
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN rn <= 300 THEN 1 ELSE 0 END) AS v300,
  SUM(CASE WHEN rn <= 300 AND tap = 1 THEN 1 ELSE 0 END) AS t300,
  SUM(CASE WHEN rn <= 300 AND ${storeExpr} THEN 1 ELSE 0 END) AS s300,
  SUM(CASE WHEN rn <= 1000 THEN 1 ELSE 0 END) AS v1000,
  SUM(CASE WHEN rn <= 1000 AND tap = 1 THEN 1 ELSE 0 END) AS t1000,
  SUM(CASE WHEN rn <= 1000 AND ${storeExpr} THEN 1 ELSE 0 END) AS s1000,
  COALESCE(MAX(CASE WHEN rn = 300 THEN first_at END), '') AS at300,
  COALESCE(MAX(CASE WHEN rn = 1000 THEN first_at END), '') AS at1000
FROM ranked`;
  return { sql, binds };
}

export function toTrial(v: string, rows: Record<string, unknown>[]): TrialStats {
  const r = rows[0] ?? {};
  const n = (k: string): number => Number(r[k] ?? 0);
  const s = (k: string): string => String(r[k] ?? '');
  return {
    v,
    dest: destOf(v),
    total: n('total'),
    first300: { views: n('v300'), taps: n('t300'), store: n('s300') },
    first1000: { views: n('v1000'), taps: n('t1000'), store: n('s1000') },
    at300: s('at300'),
    at1000: s('at1000'),
  };
}
