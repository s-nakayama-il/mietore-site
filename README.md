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
- `/pmm/` = ポイントキャンペーンのメルマガ用ページ（2026-08-24追加）。最新本番 v3d-2.5.0（ゲートストア直行CTA・ゲーム廃止）にメルマガパッチ（TRACK_URL=/mm/track・常時即表示・×リロード・画像ローカル化）を適用した派生物。計測識別は `v=v3d-2.5.0-pmm`・発火元 param=`pmm`。送信先は同じ `/mm/track`（D1同一テーブル・stats の URL別/発火元別/v別で分離集計）。noindex。
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

## /cp/ キャンペーンLP置き場

キャンペーンごとに `/cp/<スラッグ>/` を切る。第1号: `/cp/point202609/` = ふくふく本舗ポイントキャンペーン（2026-09-01〜09-30）のLP。単一HTML（画像はbase64埋め込み）・noindex。
原本: `ecommerce-project/20_実行/ポイント/ポイントキャンペーン_LP_20260815.html`（正はecommerce-project側。更新時はコピーし直す）。
メルマガからのリンク先。計測は行っていない（/mm/trackへの送信なし）。

## /banner 離脱バナー配信

代理店の LP に script タグ1行を入れるだけで、離脱ポップアップとして5本のバナーを出す。本体（出口 js・バナー画像・チェックページ・計測）はすべて mietore.site から配信する。広告と LP は代理店が持ち、fukufuku-honpo.jp には触らない（TASK-I16-20260929-003）。

- 代理店に渡すタグ（この1行だけ）:
  ```html
  <script src="https://mietore.site/banner/mtr-exit.js" defer></script>
  ```
- 5本と計測の版（`v`）・行き先:

  | 本 | `v` | 画像 | 行き先 |
  |---|---|---|---|
  | A1 特徴列挙 | `banner-20260928-A1` | `/banner/img/banner_A1.webp` | `/app`（UA でストアへ振り分け） |
  | A2 症状×運転 | `banner-20260928-A2` | `/banner/img/banner_A2.webp` | `/app` |
  | A3 症状×スマホ | `banner-20260928-A3` | `/banner/img/banner_A3.webp` | `/app` |
  | B 隠れ数字 | `banner-20260928-B` | `/banner/img/banner_BC.webp` | `/banner/check/b.html` |
  | C 隠れ数字 | `banner-20260928-C` | `/banner/img/banner_BC.webp` | `/banner/check/c.html` |

  B と C は同じ画像で、行き先だけが違う。出し分けはクライアント側で、sid を起点に5本から均等に決め、sessionStorage（`mtrb_creative`）に保存する。表示は sid ごとに1回（`mtrb_shown`）。
- イベント（`src/lib/mm/validate.ts` の `ALLOWED_EVENTS` に10種を追加済み）:

  | イベント | 送る場面 | `param` の形 |
  |---|---|---|
  | `banner_view` | バナーを出した | `back_cw`（CloseWatcher）／`back`（履歴） |
  | `banner_tap` | バナーをタップ | `app` ／ `check_b` ／ `check_c` |
  | `banner_close` | ×で閉じた | `x` |
  | `check_start` | チェック開始 | （空） |
  | `check_answer` | 1問ごと | `q=1;ok=1;p=0;s=3.2;t=0` |
  | `check_result` | 結果画面 | `ty=1;lv=5;pen=0;o=111;ts=7.6`（`ty` はタイプの番号1〜4） |
  | `rule_view` | ルール説明（C） | （空） |
  | `trial_start` | ゲーム開始（C） | （空） |
  | `trial_clear` | 全消し（C） | `s=7.6;in=1` |
  | `cta_store` | ストアボタン | `os=ios;ty=1;lv=5;ts=7.6` |

  `param` は D1 の64文字上限（`validate.ts`）に収まる短い形にしてある（実測の最大は28字）。タイプ名の日本語は入れず番号にする。
- 送信先は `POST /mm/track`（既存の D1 `mietore-mm` の `events` に同居）。送信先と行き先の URL は、js 自身の `src` の origin から組み立てる（本番 `https://mietore.site`、プレビューはプレビューの origin、手元は `wrangler pages dev` の origin）。`?mtr_debug=1` を付けると送信せずコンソールに出す。
- チェックページ `/banner/check/b.html`・`c.html` は、EC 側の原本から組み立てた派生物（正は EC 側。`/cp/` と同じ運用）。
  - 原本: `ecommerce-project/20_実行/新規獲得/バナー配信/チェックページ試作/template_20260928_BC_v2.html`・`build_20260928_BC_v2.py`（commit `26adcf2`）
  - 組み立て: `python3 tools/banner/build_check.py`（EC 側を読むだけ）。画像の書き出しは `python3 tools/banner/build_images.py`
  - 原本との違いは3点だけ。①画像を data URI ではなく `/banner/img/` の外部ファイルにした ②`track()` を `/mm/track` へ送る本物にした ③試作用の入口（バナーをもう一度タップさせる画面）を出さず第1問から始める。判定式（`Q[k].judge`・`ORDER`・`diagnose()`）と3問の出し方は原本のまま。
- 画像は `/banner/img/`。隠れ数字（`q1_dots.png`）は非可逆圧縮をかけない（両はしの数字のうすさが変わると問題の難しさが変わるため）。
- 出口 js は `public/mm/b/mietore-popup_mailmag.js` の離脱トリガーと送信関数を流用した派生物。保存キーとグローバルは既存（`mtr_*`）と混ざらないよう `mtrb_*` にしてある。7日間の抑制・`page_view`・`lp_click`・`exit_no_popup`・`scroll_up_signal` は持ち込んでいない。
- 打ち切りの判定（1本 1,000表示・タップ55件以上）は人が Metabase で見る。自動では止めない。

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
3. 本番URL: https://mietore.site （2026-08-25 カスタムドメイン設定済み。https://mietore-site.pages.dev も同内容で継続稼働。`main` push で自動デプロイ・他ブランチ push でプレビューURL）
4. Web Analytics: Analytics & Logs → Web Analytics → サイトを追加（hostname = mietore-site.pages.dev）→ 発行 token を `src/layouts/Base.astro` の beacon タグに設定済み
5. 動作確認コマンド:
   ```bash
   U=https://mietore.site
   curl -sL -o /dev/null -w '%{http_code}\n' $U/
   curl -s -o /dev/null -D - -A "Mozilla/5.0 (iPhone)" $U/app | grep -i location   # App Store
   curl -s -o /dev/null -D - -A "Mozilla/5.0 (Linux; Android 14)" $U/app | grep -i location   # Google Play
   curl -s -o /dev/null -D - $U/app | grep -i location   # /download
   ```
