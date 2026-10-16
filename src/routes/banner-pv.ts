// POST /banner/pv: LP を開いた回数を +1 する（src/lib/banner/pv.ts）。
// /mm/track と同じく、結果によらず常に 204。保存の失敗はページに影響させない。
import { PV_SQL, pvBinds, toPvKey } from '../lib/banner/pv.ts';

export interface BannerPvEnv {
  DB: D1Database;
}

export async function handleBannerPv(request: Request, env: BannerPvEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 204 });
  const len = Number(request.headers.get('content-length') ?? '0');
  if (!len || len > 4096) return new Response(null, { status: 204 });

  let payload: unknown = null;
  try { payload = JSON.parse(await request.text()); } catch { /* 不正な本文は捨てる */ }
  const key = payload ? toPvKey(payload, Date.now()) : null;
  if (key) {
    try {
      await env.DB.prepare(PV_SQL).bind(...pvBinds(key)).run();
    } catch { /* 表が無い・D1 が落ちている */ }
  }
  return new Response(null, { status: 204 });
}
