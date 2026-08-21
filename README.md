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

## Cloudflare初期設定（2026-08-21 実施済み・再現用メモ）
1. GitHub: private リポジトリ `s-nakayama-il/mietore-site`。WSL の SSH 鍵（`~/.ssh/id_ed25519.pub`）を GitHub → Settings → SSH and GPG keys に登録し `git@github.com:s-nakayama-il/mietore-site.git` へ push
2. Cloudflare → Workers & Pages → Create → **Pages タブ** → Git に接続 → GitHub 認可（Only select repositories: mietore-site）→ `mietore-site` → セットアップ開始
   - フレームワークプリセット Astro／ビルドコマンド `npm run build`／ビルド出力ディレクトリ `dist`／環境変数 `NODE_VERSION=24` → 保存してデプロイ
   - ※ Workers タブから入ると「デプロイコマンド npx wrangler deploy」の画面になる。それは別物なので戻って Pages タブを選ぶ
3. 本番URL: https://mietore-site.pages.dev （`main` push で自動デプロイ。他ブランチ push でプレビューURL）
4. Web Analytics: Analytics & Logs → Web Analytics → サイトを追加（hostname = mietore-site.pages.dev）→ 発行 token を `src/layouts/Base.astro` の beacon タグに設定済み
5. 動作確認コマンド:
   ```bash
   U=https://mietore-site.pages.dev
   curl -sL -o /dev/null -w '%{http_code}\n' $U/
   curl -s -o /dev/null -D - -A "Mozilla/5.0 (iPhone)" $U/app | grep -i location   # App Store
   curl -s -o /dev/null -D - -A "Mozilla/5.0 (Linux; Android 14)" $U/app | grep -i location   # Google Play
   curl -s -o /dev/null -D - $U/app | grep -i location   # /download
   ```
