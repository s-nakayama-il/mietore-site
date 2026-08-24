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

## /mm メルマガ即スタート版

メルマガ施策A/B用の単体ページ。ダミー記事なしで即キャッチ会話アニメ→ガボールパッチゲームへ進む。

- URL: A版 = `/mm/` ／ B版 = `/mm/b/`。両方とも noindex。
- 計測: `POST /mm/track` → Cloudflare D1 `mietore-mm` に保存（旧PHP版 `track.php` の Functions 移植）。許可イベント14種は `src/lib/mm/validate.ts` の `ALLOWED_EVENTS` を参照。
- 集計: `/mm/stats?key=<STATS_KEY>` にブラウザでアクセス（key は本READMEに書かない）。`&month=YYYYMM` で月絞り込み、`&export=csv` でCSVダウンロード。
- STATS_KEYの管理: 本番は Cloudflare Pages の Secret（`wrangler pages secret put STATS_KEY` で設定済み）。ローカルは `.dev.vars`（`.dev.vars.example` を参照してコピー）。
- STATS_KEYは2026-08-24にローテーション済み（値は `.dev.vars` とPages Secretのみ・EC側旧PHPのキーとは別物になった）。
- 追加3イベント（`exit_no_popup`/`scroll_up_signal`/`lp_click`）を計測対象に含めた（B版が送信するため。旧PHP版では捨てられていた）。
- 推奨: Cloudflare WAF の Rate limiting rule を `/mm/track` に設定（画面操作・任意）。
- 設定は `wrangler.toml` でファイル管理。D1バインディング（`DB` → `mietore-mm`）もここに記載済みのため、Cloudflareダッシュボードの Bindings 画面から追加しても無効化される（file-managed config優先）。変更する場合は `wrangler.toml` を編集すること。
- ローカル確認:
  ```bash
  npm run build && npx wrangler pages dev dist
  curl -s -X POST http://localhost:8788/mm/track -H 'Content-Type: application/json' \
    -d '{"ts":"2026-08-24T12:00:00+09:00","sid":"local-test","event":"page_view","param":"","url":"http://localhost:8788/mm/","os":"iOS","v":"mailmag-1.0.0","ua_family":"browser"}'
  ```
  ローカルD1の掃除: `npx wrangler d1 execute mietore-mm --local --command "DELETE FROM events"`
- 配信回識別: 配信リンクに `?mm=◯◯` などのクエリを付与すると `url` 列にそのまま残り、配信回別の集計が可能。
- `?mtr_debug=1` を付けると計測イベントを送信せずコンソールに出力する（既存挙動のまま）。
- 元PHP原本: `ecommerce-project/20_実行/新規獲得/メルマガ即スタート版_20260818/`（`php/track.php`・`php/stats.php` など、無改変で保存）。

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
