import { validateAndClean, cleanHints, clean } from '../../src/lib/mm/validate';

interface Env { DB: D1Database }

function jstNow(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

// 受け取った側（Cloudflare）で分かる値。request.cf が無いとき（ローカル・テスト）は全部 null（2026-10-28）
function serverSide(request: Request) {
  const cf = (request as { cf?: Record<string, unknown> }).cf;
  const text = (v: unknown, max: number) => {
    const s = clean(v, max);
    return s || null;
  };
  const asn = Number(cf?.asn);
  return {
    ua: text(request.headers.get('user-agent'), 400),
    asn: Number.isInteger(asn) && asn > 0 ? asn : null,
    as_org: text(cf?.asOrganization, 200),
    region: text(cf?.region, 100),
    city: text(cf?.city, 100),
    postal: text(cf?.postalCode, 20),
    // 2026-10-30 追加（TASK-I16-20261030-001）。国の 2 文字（XX＝不明・T1＝Tor も Cloudflare の値のまま残す）
    country: text(cf?.country, 2),
  };
}

const INSERT_9 = 'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)';
const INSERT_17 = 'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family, ua, asn, as_org, region, city, postal, model, os_version)'
  + ' VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)';
const INSERT_18 = 'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family, ua, asn, as_org, region, city, postal, model, os_version, country)'
  + ' VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)';

// POST /mm/track: 計測イベントを検証してD1へINSERT。結果によらず常に204（track.php準拠）
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') return new Response(null, { status: 204 }); // GET等は204（track.php準拠）

  const len = Number(request.headers.get('content-length') ?? '0');
  if (!len || len > 4096) return new Response(null, { status: 204 }); // 巨大/不定長ボディは破棄

  let payload: unknown = null;
  try { payload = await request.json(); } catch { /* 不正JSONは捨てる */ }
  const row = payload ? validateAndClean(payload) : null;
  if (row) {
    const received = jstNow();
    const base = [received, row.ts, row.sid, row.event, row.param, row.url, row.os, row.v, row.ua_family];
    // 列がまだ無い D1（ALTER 前）などで失敗したら、18 列 → 17 列 → 9 列の順に入れ直す。記録は落とさない
    let cols17: unknown[] | null = null;
    try {
      const s = serverSide(request);
      const h = cleanHints(payload);
      cols17 = [...base, s.ua, s.asn, s.as_org, s.region, s.city, s.postal, h.model, h.os_version];
      await env.DB.prepare(INSERT_18).bind(...cols17, s.country).run();
    } catch {
      try {
        if (!cols17) throw new Error('no extra columns');
        await env.DB.prepare(INSERT_17).bind(...cols17).run();
      } catch {
        try {
          await env.DB.prepare(INSERT_9).bind(...base).run();
        } catch { /* 保存失敗でもクライアントには影響させない */ }
      }
    }
  }
  return new Response(null, { status: 204 });
};
