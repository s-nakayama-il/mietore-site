// 離脱バナーの設定（banner_config の1行）の読み取りと、GET /banner/config が返す形。
// 道は src/routes/banner-config.ts。ここは D1 を触らない純関数だけを置く。
// mtr-exit.js はこの2つの値だけを見る。読めなければ何も登録せずに終わる（人が決めたこと 1・2）。

// 応答の本文。JSON のキーの順は stopped → active（curl で目で追えるように固定する）。
export interface BannerConfigBody {
  stopped: boolean;
  active: string[];
}

// banner_config から読む1行。D1 の値は何が来るか分からないので unknown で受ける。
export interface BannerConfigRow {
  stopped: unknown;
  active_vs: unknown;
}

// 200・405・503 のすべてに付ける3つ
export const CONFIG_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};

export const CONFIG_SQL = 'SELECT stopped, active_vs FROM banner_config WHERE id = 1';

// 読めなかったときの本文。バナー側はこれを「読めない」とみなして出さない。
export const CONFIG_UNAVAILABLE_BODY = '{"error":"config_unavailable"}';
export const CONFIG_METHOD_BODY = '{"error":"method_not_allowed"}';

// active_vs（JSON の文字列配列）を読む。JSON でない・配列でない・文字列でない要素があれば null。
export function parseActive(text: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (const v of parsed) {
    if (typeof v !== 'string') return null;
  }
  return parsed as string[];
}

// stopped は 0 か 1 だけを認める（表の CHECK と同じ）。それ以外は読めないとみなす。
export function parseStopped(value: unknown): boolean | null {
  if (value === 0) return false;
  if (value === 1) return true;
  return null;
}

// 1行から応答の本文を組む。行が無い・形が違う場合は null（道は 503 を返す）。
export function toConfigBody(row: BannerConfigRow | null | undefined): BannerConfigBody | null {
  if (!row) return null;
  const stopped = parseStopped(row.stopped);
  if (stopped === null) return null;
  if (typeof row.active_vs !== 'string') return null;
  const active = parseActive(row.active_vs);
  if (active === null) return null;
  return { stopped, active };
}
