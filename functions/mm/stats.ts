import { aggregate } from '../../src/lib/mm/aggregate';
import type { EventRow } from '../../src/lib/mm/aggregate';
import { renderStatsHtml } from '../../src/lib/mm/render';

interface Env { DB: D1Database; STATS_KEY: string }

// GET /mm/stats: key認証済みの計測集計表示。month絞り込み・CSVエクスポート対応
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const u = new URL(request.url);
  if (!env.STATS_KEY || u.searchParams.get('key') !== env.STATS_KEY) {
    return new Response('Forbidden', { status: 403 });
  }
  const month = u.searchParams.get('month'); // YYYYMM
  let sql = 'SELECT received_at, ts, sid, event, param, url, os, v, ua_family FROM events';
  const binds: string[] = [];
  if (month && /^\d{6}$/.test(month)) {
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
  const html = renderStatsHtml(aggregate(rows), String(rows.length));
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
