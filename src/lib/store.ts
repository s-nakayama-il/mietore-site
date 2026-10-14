// 入口ごとのストアへのリンク（TASK-I16-20261014-002）。
// App Store は App Store Connect で作ったキャンペーンリンク（pt・ct・mt=8）。ct で入口が分かれる。
// Google Play は referrer に utm_source・utm_campaign を URL エンコードして入れる。
// ここは JS の文字列なので & はそのまま書く（HTML の属性に直接書くときだけ &amp; にする）。
export const STORE_LINKS = {
  // 離脱バナー A1〜A3・A7（/app で直接ストアへ）
  exit_banner_app: {
    ios: 'https://apps.apple.com/app/apple-store/id6738352362?pt=126888813&ct=exit_banner_app&mt=8',
    android: 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja&referrer=utm_source%3Dexit_banner%26utm_campaign%3Dapp',
  },
  // ダウンロード案内 /download（PC などで /app を開いたときの行き先）
  mietore_site_download: {
    ios: 'https://apps.apple.com/app/apple-store/id6738352362?pt=126888813&ct=mietore_site_download&mt=8',
    android: 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja&referrer=utm_source%3Dmietore_site%26utm_campaign%3Ddownload',
  },
} as const;

export function storeUrlFor(ua: string | null): string {
  if (!ua) return '/download';
  if (/iPhone|iPad|iPod/i.test(ua)) return STORE_LINKS.exit_banner_app.ios;
  if (/Android/i.test(ua)) return STORE_LINKS.exit_banner_app.android;
  return '/download';
}
