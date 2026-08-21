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
4. public/robots.txt の Sitemap 行も https://mietore.site/sitemap-index.xml に変更

## 未確定・中山確認（spec §11）
- [ ] プライバシーポリシー・利用規約の文面（受領後 noindex を外す）
- [ ] フッタの運営会社表記・サプリサイトURL
- [ ] FAQ 3（対象年齢）・7（データ）の表現
- [ ] /evidence の出典（書誌確認）・法務チェック（薬機法・景表法）
- [ ] 大学共同研究の記述可否（現状「準備中」）
- [ ] ゲームルール表現: トップは簡略版（ならんだ縞模様→ぜんぶ消す）、/play/game は実ルール（同じ模様2つ・3直線以内）。粒度差の可否
- [ ] /play/streak クエスト説明（スクショのみから記述）の正確性
- [ ] Lighthouse 実測値: perf 84-93（変動あり） / a11y 92（2026-08-21）
