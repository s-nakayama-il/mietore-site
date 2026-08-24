import { validateAndClean } from '../../src/lib/mm/validate';

interface Env { DB: D1Database }

function jstNow(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

// POST /mm/track: 計測イベントを検証してD1へINSERT。結果によらず常に204（track.php準拠）
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') return new Response(null, { status: 204 }); // GET等は204（track.php準拠）

  let payload: unknown = null;
  try { payload = await request.json(); } catch { /* 不正JSONは捨てる */ }
  const row = payload ? validateAndClean(payload) : null;
  if (row) {
    try {
      await env.DB.prepare(
        'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)'
      ).bind(jstNow(), row.ts, row.sid, row.event, row.param, row.url, row.os, row.v, row.ua_family).run();
    } catch { /* 保存失敗でもクライアントには影響させない */ }
  }
  return new Response(null, { status: 204 });
};
