// LP を開いた回数（離脱バナーの分母）。mtr-exit.js が設定を読んで配信中と分かったページで1回送る。
// 1回ずつの行は持たず、日・時・LP・広告・キャンペーン・端末・アプリ内ブラウザ・案・既表示ごとの件数を +1 する（2026-10-16 中山さん決定）。
// events を全件読む集計（毎時の判定・/mm/stats）に混ぜないため、別の表 banner_pv に置く。
// 道は src/routes/banner-pv.ts。ここは D1 を触らない純関数だけを置く。

export interface PvKey {
  day: string;       // JST の日付 YYYY-MM-DD
  hour: number;      // JST の時 0〜23
  lp: string;        // LP のホスト＋パス（クエリは持たない）
  ad: string;        // google / tiktok / meta / none
  campaign: string;  // utm_campaign、なければ gad_campaignid、なければ空
  os: string;        // iOS / Android / PC / other
  ua_family: string; // validate.ts と同じ6種
  v: string;         // 案の v。形が違えば other
  seen: number;      // 1 = 同じ sid ですでにバナーを見た（この回は出ない）
}

const ALLOWED_OS = ['iOS', 'Android', 'PC'];
const ALLOWED_UA = ['tiktok', 'line', 'instagram', 'facebook', 'wv', 'browser'];
const V_RE = /^banner-\d{8}-[A-Z0-9]{1,3}$/;

export const PV_SQL =
  'INSERT INTO banner_pv (day, hour, lp, ad, campaign, os, ua_family, v, seen, n) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1) ' +
  'ON CONFLICT (day, hour, lp, ad, campaign, os, ua_family, v, seen) DO UPDATE SET n = n + 1';

// 広告の印。ダッシュボード15の入口広告（create_banner_dashboard_cards.py）と同じ分け方
export function adOf(params: URLSearchParams): string {
  if (params.has('gclid') || params.has('gbraid') || params.has('wbraid')) return 'google';
  if (params.has('ttclid')) return 'tiktok';
  if (params.has('fbclid')) return 'meta';
  return 'none';
}

function jst(now: number): { day: string; hour: number } {
  const d = new Date(now + 9 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

// 送られてきた本文を数える鍵にする。数えないもの（形が違う・URL が読めない）は null
export function toPvKey(payload: unknown, now: number): PvKey | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.url !== 'string' || p.url.length > 2000) return null;
  let u: URL;
  try { u = new URL(p.url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const campaign = (u.searchParams.get('utm_campaign') || u.searchParams.get('gad_campaignid') || '').slice(0, 100);
  const os = typeof p.os === 'string' && ALLOWED_OS.includes(p.os) ? p.os : 'other';
  const ua = typeof p.ua_family === 'string' && ALLOWED_UA.includes(p.ua_family) ? p.ua_family : 'browser';
  const v = typeof p.v === 'string' && V_RE.test(p.v) ? p.v : 'other';
  return {
    ...jst(now),
    lp: (u.host + u.pathname).slice(0, 200),
    ad: adOf(u.searchParams),
    campaign,
    os,
    ua_family: ua,
    v,
    seen: p.seen === 1 || p.seen === true ? 1 : 0,
  };
}

export function pvBinds(k: PvKey): (string | number)[] {
  return [k.day, k.hour, k.lp, k.ad, k.campaign, k.os, k.ua_family, k.v, k.seen];
}

// /mm/stats?export=pv の CSV
export const PV_EXPORT_SQL =
  'SELECT day, hour, lp, ad, campaign, os, ua_family, v, seen, n FROM banner_pv ORDER BY day, hour';
export const PV_CSV_HEADER = 'day,hour,lp,ad,campaign,os,ua_family,v,seen,n';
