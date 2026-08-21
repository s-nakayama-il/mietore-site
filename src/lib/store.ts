export const APP_STORE_URL = 'https://apps.apple.com/jp/app/id6738352362';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja';

export function storeUrlFor(ua: string | null): string {
  if (!ua) return '/download';
  if (/iPhone|iPad|iPod/i.test(ua)) return APP_STORE_URL;
  if (/Android/i.test(ua)) return PLAY_URL;
  return '/download';
}
