// GET /mm/banner-stats: 離脱バナーの成績を1枚で見せる（Basic 認証）。
// 数え方は src/lib/banner/metrics.ts、HTML は src/lib/banner/render.ts。
import {
  parsePeriod, buildStatsSql, toPeriodStats, toDaily, buildTrialSql, toTrial, jstToday,
  type Period, type StatRow,
} from '../lib/banner/metrics.ts';
import {
  renderBannerStats,
  type PageData, type ConfigRow, type CreativeRow, type BannerDailyRow,
} from '../lib/banner/render.ts';

export interface BannerStatsEnv {
  DB: D1Database;
  BANNER_STATS_USER?: string;
  BANNER_STATS_PASS?: string;
}

const DAYS = 14;
const REALM = 'Basic realm="mietore-banner-stats", charset="UTF-8"';

// すべての応答に付ける（200・400・401・403・405・500）
function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', ...(extra ?? {}) };
}

function textResponse(status: number, body: string, extra?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: baseHeaders({ 'Content-Type': 'text/plain; charset=UTF-8', ...(extra ?? {}) }),
  });
}

// 長さの違いで早く返らない比べ方（両方を byte 列にして全 byte を見る）
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i) & 0xff;
    return out;
  } catch {
    return null;
  }
}

function authorized(request: Request, user: string, pass: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const m = /^basic\s+(\S+)\s*$/i.exec(header); // 'basic' の大文字・小文字は問わない
  if (!m) return false;
  const got = decodeBase64(m[1]);
  if (!got) return false; // 壊れた Base64 は 401（500 にしない）
  return bytesEqual(got, new TextEncoder().encode(`${user}:${pass}`));
}

interface TableSet {
  config: boolean;
  creatives: boolean;
  daily: boolean;
}

async function readTables(db: D1Database): Promise<TableSet | null> {
  try {
    const { results } = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('banner_config','banner_creatives','banner_daily')",
    ).all();
    const names = new Set((results as { name: string }[]).map((r) => r.name));
    return { config: names.has('banner_config'), creatives: names.has('banner_creatives'), daily: names.has('banner_daily') };
  } catch {
    return null;
  }
}

export async function handleBannerStats(
  request: Request,
  env: BannerStatsEnv,
  now: number = Date.now(),
): Promise<Response> {
  // 405 → 403 → 401 の順に見る
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  const user = env.BANNER_STATS_USER ?? '';
  const pass = env.BANNER_STATS_PASS ?? '';
  if (user === '' || pass === '') {
    return textResponse(403, 'Forbidden');
  }
  if (!authorized(request, user, pass)) {
    return textResponse(401, 'Unauthorized', { 'WWW-Authenticate': REALM });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams);
  if (!period) {
    return textResponse(400, 'Bad Request');
  }

  const today = jstToday(now);
  const html = await buildPage(env.DB, period, today);
  const headers = baseHeaders({ 'Content-Type': 'text/html; charset=UTF-8' });
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}

async function buildPage(db: D1Database, period: Period, today: string): Promise<string> {
  const data: PageData = { period, today, days: DAYS };

  // 無い表には SELECT を投げない（確かめは1回だけ）
  const tables = await readTables(db);

  const statsTask = (async () => {
    try {
      const { sql, binds } = buildStatsSql(period);
      const { results } = await db.prepare(sql).bind(...binds).all();
      const rows = results as unknown as StatRow[];
      data.stats = toPeriodStats(rows, period);
      // 日×案の一覧は、期間に関わらず直近 DAYS 日を出す（同じ1本の結果から作る）
      data.daily = toDaily(rows, today, DAYS);
    } catch {
      data.stats = null;
      data.daily = null;
    }
  })();

  const configTask = (async () => {
    if (!tables || !tables.config) return;
    try {
      const { results } = await db.prepare('SELECT stopped, active_vs, cycle_done, updated_at, updated_by FROM banner_config WHERE id = 1').all();
      data.config = (results as unknown as ConfigRow[])[0] ?? null;
    } catch {
      data.config = null;
    }
  })();

  const creativesTask = (async () => {
    if (!tables || !tables.creatives) return;
    let rows: CreativeRow[];
    try {
      const { results } = await db.prepare(
        'SELECT v, dest, trial_order, status, started_at, decided_at, decided_views, decided_taps, decided_store FROM banner_creatives ORDER BY trial_order',
      ).all();
      rows = results as unknown as CreativeRow[];
      data.creatives = rows;
    } catch {
      data.creatives = null;
      return;
    }
    const trialing = rows.find((r) => r.status === 'trialing' && r.started_at);
    if (!trialing || !trialing.started_at) return;
    try {
      const t = buildTrialSql(trialing.v, trialing.started_at);
      const { results } = await db.prepare(t.sql).bind(...t.binds).all();
      data.trial = toTrial(trialing.v, results as unknown as Record<string, unknown>[]);
      data.trialStartedAt = trialing.started_at;
    } catch {
      data.trial = null;
    }
  })();

  const dailyTask = (async () => {
    if (!tables || !tables.daily) return;
    try {
      const { results } = await db.prepare(
        'SELECT day, v, views, taps, store, status, stopped, written_at FROM banner_daily ORDER BY day DESC, v',
      ).all();
      data.bannerDaily = results as unknown as BannerDailyRow[];
    } catch {
      data.bannerDaily = null;
    }
  })();

  await Promise.all([statsTask, configTask, creativesTask, dailyTask]);
  return renderBannerStats(data);
}
