import { aggregate } from '../../src/lib/mm/aggregate';
import type { EventRow } from '../../src/lib/mm/aggregate';
import { renderStatsHtml } from '../../src/lib/mm/render';
import { PV_CSV_HEADER, PV_EXPORT_SQL } from '../../src/lib/banner/pv';

interface Env { DB: D1Database; STATS_KEY: string }

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
  let sql = 'SELECT received_at, ts, sid, event, param, url, os, v, ua_family FROM events';
  const binds: string[] = [];
  if (month) {
    sql += ' WHERE received_at LIKE ?1';
    binds.push(`${month.slice(0, 4)}-${month.slice(4)}%`);
  }
  sql += ' ORDER BY received_at';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const rows = results as unknown as EventRow[];

  if (u.searchParams.get('export') === 'csv') {
    const headerLine = 'received_at,ts,sid,event,param,url,os,v,ua_family';
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const body = rows.map((r) => [r.received_at, r.ts, r.sid, r.event, r.param, r.url, r.os, r.v, r.ua_family].map(q).join(',')).join('\n');
    return new Response(headerLine + '\n' + body + (body ? '\n' : ''), {
      headers: { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': 'attachment; filename="mm_events.csv"' },
    });
  }
  const totalLabel = `${rows.length}件${month ? `・month=${month} 絞り込み` : ''}`;
  const html = renderStatsHtml(aggregate(rows), totalLabel);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
