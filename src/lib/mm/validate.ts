// /mm 計測イベントのバリデーション純関数
// $SRC/php/track.php の検証ロジックを1:1移植したもの

export const ALLOWED_EVENTS = [
  'page_view', 'popup_view', 'anime_end', 'play_start', 'stage_clear', 'all_clear',
  'cta_search', 'cta_ios', 'cta_android', 'replay', 'popup_close',
];

const ALLOWED_ANIME_END = ['complete', 'skip_talk', 'skip_bridge'];
const ALLOWED_UA = ['tiktok', 'line', 'instagram', 'facebook', 'wv', 'browser'];

export interface CleanRow {
  ts: string;
  sid: string;
  event: string;
  param: string;
  url: string;
  os: string;
  v: string;
  ua_family: string;
}

function clean(value: unknown, maxLen: number): string {
  let s = (typeof value === 'string' || typeof value === 'number') ? String(value) : '';
  s = s.replace(/[\r\n]/g, ' ');
  s = s.slice(0, maxLen);
  // CSVインジェクション対策: 先頭が =+-@ の場合はシングルクォートを付与してエスケープ
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  // クォート付加で maxLen を超えうるため、最終長を再度 maxLen に揃える
  return s.slice(0, maxLen);
}

export function validateAndClean(payload: unknown): CleanRow | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;

  const event = typeof p.event === 'string' ? p.event : '';
  if (!ALLOWED_EVENTS.includes(event)) return null;

  if (event === 'anime_end') {
    const ap = typeof p.param === 'string' ? p.param : '';
    if (!ALLOWED_ANIME_END.includes(ap)) return null;
  }

  let ua = typeof p.ua_family === 'string' ? p.ua_family : '';
  if (!ALLOWED_UA.includes(ua)) ua = 'browser';

  // lp_click の param（リンク先URL先頭150文字）は他イベントの param（64文字上限）より長いため専用の上限を使う
  const paramMaxLen = event === 'lp_click' ? 150 : 64;

  return {
    ts: clean(p.ts, 64),
    sid: clean(p.sid, 64),
    event: clean(event, 64),
    param: clean(p.param, paramMaxLen),
    url: clean(p.url, 500),
    os: clean(p.os, 64),
    v: clean(p.v, 64),
    ua_family: ua,
  };
}
