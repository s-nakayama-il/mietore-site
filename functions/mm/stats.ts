import { aggregate } from '../../src/lib/mm/aggregate';
import type { EventRow } from '../../src/lib/mm/aggregate';
import { renderStatsHtml } from '../../src/lib/mm/render';
import { PV_CSV_HEADER, PV_EXPORT_SQL } from '../../src/lib/banner/pv';

interface Env { DB: D1Database; STATS_KEY: string }

// ?export=csv の列。今までの 9 列の後ろに 8 列を足す（取込側 load_mm_events.py は両方を受ける）
const COLS_9 = ['received_at', 'ts', 'sid', 'event', 'param', 'url', 'os', 'v', 'ua_family'] as const;
const COLS_17 = [...COLS_9, 'ua', 'asn', 'as_org', 'region', 'city', 'postal', 'model', 'os_version'] as const;
// 2026-10-30 に足した国（TASK-I16-20261030-001）。17 列の後ろに置く
const COLS_18 = [...COLS_17, 'country'] as const;
const CSV_PAGE_SIZE = 1000;

function validDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function nextDay(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const csvQuote = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;

async function rangeCsv(db: D1Database, from: string, to: string): Promise<Response> {
  const lower = `${from}T00:00:00+09:00`;
  const upper = `${nextDay(to)}T00:00:00+09:00`;
  const baseWhere = 'received_at >= ?1 AND received_at < ?2';
  const firstSql = (cols: readonly string[]) =>
    `SELECT rowid AS __rowid, ${cols.join(', ')} FROM events WHERE ${baseWhere} ORDER BY received_at, rowid LIMIT ${CSV_PAGE_SIZE}`;

  // 小さい先頭ページで列の有無を判定する。全件SELECTの失敗を「列が無い」と誤判定しない。
  let cols: readonly string[] = COLS_18;
  let first: Record<string, unknown>[] = [];
  for (const c of [COLS_18, COLS_17, COLS_9]) {
    cols = c;
    try {
      const { results } = await db.prepare(firstSql(c)).bind(lower, upper).all();
      first = results as Record<string, unknown>[];
      break;
    } catch (e) {
      if (c === COLS_9) throw e;
    }
  }

  const countResult = await db.prepare(`SELECT count(*) AS n FROM events WHERE ${baseWhere}`).bind(lower, upper).all();
  const expected = Number((countResult.results[0] as { n?: unknown } | undefined)?.n ?? 0);
  const encoder = new TextEncoder();
  let page = first;
  let sent = 0;
  let cursorAt = '';
  let cursorRowid = 0;
  let finished = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(cols.join(',') + '\n'));
    },
    async pull(controller) {
      try {
        if (finished) return;
        if (page.length) {
          const body = page.map((r) => cols.map((c) => csvQuote(r[c])).join(',')).join('\n') + '\n';
          controller.enqueue(encoder.encode(body));
          sent += page.length;
          const last = page[page.length - 1];
          cursorAt = String(last.received_at ?? '');
          cursorRowid = Number(last.__rowid);
          if (!cursorAt || !Number.isFinite(cursorRowid)) throw new Error('CSV pagination cursor is missing');
        }
        if (page.length < CSV_PAGE_SIZE) {
          finished = true;
          if (sent !== expected) throw new Error(`CSV row count changed during export: expected=${expected} actual=${sent}`);
          controller.close();
          return;
        }
        const sql = `SELECT rowid AS __rowid, ${cols.join(', ')} FROM events WHERE ${baseWhere}`
          + ' AND (received_at > ?3 OR (received_at = ?3 AND rowid > ?4))'
          + ` ORDER BY received_at, rowid LIMIT ${CSV_PAGE_SIZE}`;
        const { results } = await db.prepare(sql).bind(lower, upper, cursorAt, cursorRowid).all();
        page = results as Record<string, unknown>[];
      } catch (e) {
        finished = true;
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=UTF-8',
      'Content-Disposition': 'attachment; filename="mm_events.csv"',
      'X-Export-Count': String(expected),
    },
  });
}

// GET /mm/stats: key認証済みの計測集計表示。month絞り込み・CSVエクスポート対応
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const u = new URL(request.url);
  if (!env.STATS_KEY || u.searchParams.get('key') !== env.STATS_KEY) {
    return new Response('Forbidden', { status: 403 });
  }
  // LP を開いた回数（banner_pv）の CSV。events は読まない
  if (u.searchParams.get('export') === 'pv') {
    const { results } = await env.DB.prepare(PV_EXPORT_SQL).all();
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const cols = PV_CSV_HEADER.split(',');
    const body = (results as Record<string, unknown>[]).map((r) => cols.map((c) => q(r[c])).join(',')).join('\n');
    return new Response(PV_CSV_HEADER + '\n' + body + (body ? '\n' : ''), {
      headers: { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': 'attachment; filename="banner_pv.csv"' },
    });
  }
  const month = u.searchParams.get('month'); // YYYYMM
  if (month && !/^\d{6}$/.test(month)) {
    return new Response('Bad Request', { status: 400 });
  }
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  const hasRange = from !== null || to !== null;
  if (hasRange && (u.searchParams.get('export') !== 'csv' || month !== null || !validDay(from) || !validDay(to) || from > to)) {
    return new Response('Bad Request', { status: 400 });
  }
  if (hasRange) return rangeCsv(env.DB, from as string, to as string);
  // 2026-10-28 に足した 8 列（TASK-I16-20261028-001）。D1 に列がまだ無い（ALTER 前）ときは今までの 9 列で読む
  let where = '';
  const binds: string[] = [];
  if (month) {
    where = ' WHERE received_at LIKE ?1';
    binds.push(`${month.slice(0, 4)}-${month.slice(4)}%`);
  }
  const select = (cols: readonly string[]) => `SELECT ${cols.join(', ')} FROM events${where} ORDER BY received_at`;
  // country が無い D1 は 17 列、8 列も無い D1 は 9 列で読む
  let cols: readonly string[] = COLS_18;
  let results: unknown[] = [];
  for (const c of [COLS_18, COLS_17, COLS_9]) {
    cols = c;
    try {
      ({ results } = await env.DB.prepare(select(c)).bind(...binds).all());
      break;
    } catch (e) {
      if (c === COLS_9) throw e;
    }
  }
  const rows = results as unknown as EventRow[];

  if (u.searchParams.get('export') === 'csv') {
    const headerLine = cols.join(',');
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const body = (rows as unknown as Record<string, unknown>[]).map((r) => cols.map((c) => q(r[c])).join(',')).join('\n');
    return new Response(headerLine + '\n' + body + (body ? '\n' : ''), {
      headers: { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': 'attachment; filename="mm_events.csv"' },
    });
  }
  const totalLabel = `${rows.length}件${month ? `・month=${month} 絞り込み` : ''}`;
  const html = renderStatsHtml(aggregate(rows), totalLabel);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
