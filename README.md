# mietore-site

「ミエトレ」公式サイト。Astro + Cloudflare Pages。

## ローカル
- `npm install`
- `npm run dev` … http://localhost:4321
- `npm run verify` … check + build + test
- `npm run build && npm run pages:dev` … Functions（/app）込みの確認

## デプロイ
Cloudflare Pages（GitHub連携）。`main` → 本番、他ブランチ → プレビューURL。
設定手順は docs/superpowers/specs/2026-08-21-mietore-site-design.md §6 と本README末尾「Cloudflare初期設定」。

## ドメイン切替（後日）
1. Cloudflare Registrar で mietore.site 取得
2. Pages → Custom domains に追加
3. astro.config.mjs の `site` を https://mietore.site に変更して main へ
