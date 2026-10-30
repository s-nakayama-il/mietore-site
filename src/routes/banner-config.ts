// GET /banner/config: 離脱バナーの設定を1つの JSON で返す（banner_config の id = 1 を1行読むだけ）。
// mtr-exit.js が LP を開くたびに読む。読めない応答（503）はバナーを出さない合図になる。
// 読み取りと形の組み立ては src/lib/banner/config.ts。
import {
  CONFIG_HEADERS, CONFIG_SQL, CONFIG_METHOD_BODY, CONFIG_UNAVAILABLE_BODY, toConfigBody,
  type BannerConfigRow,
} from '../lib/banner/config.ts';

export interface BannerConfigEnv {
  DB: D1Database;
}

function respond(request: Request, status: number, body: string, extra?: Record<string, string>): Response {
  // HEAD は本文を付けない
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: { ...CONFIG_HEADERS, ...(extra ?? {}) },
  });
}

// 日本以外から来た人にはバナーを出さない（2026-10-30。国内販売のため）。Cloudflare が付ける国が JP 以外なら
// D1 を読まずに「止めている」と同じ本文を返す。XX（不明）・T1（Tor）も日本以外とみなす。
// cf が無い・国が空（ローカル・テスト）はこれまでどおり D1 を読む
const STOPPED_BODY = JSON.stringify({ stopped: true, active: [] });

function isOutsideJapan(request: Request): boolean {
  const country = (request as { cf?: { country?: unknown } }).cf?.country;
  if (typeof country !== 'string' || country === '') return false;
  return country !== 'JP';
}

export async function handleBannerConfig(request: Request, env: BannerConfigEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return respond(request, 405, CONFIG_METHOD_BODY, { Allow: 'GET, HEAD' });
  }
  if (isOutsideJapan(request)) return respond(request, 200, STOPPED_BODY);
  let row: BannerConfigRow | null = null;
  try {
    const { results } = await env.DB.prepare(CONFIG_SQL).all();
    row = (results as unknown as BannerConfigRow[])[0] ?? null;
  } catch {
    // 表が無い・D1 が落ちている。どちらも「読めない」として 503 を返す
    row = null;
  }
  const body = toConfigBody(row);
  if (body === null) return respond(request, 503, CONFIG_UNAVAILABLE_BODY);
  return respond(request, 200, JSON.stringify(body));
}
