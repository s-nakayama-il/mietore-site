# mietore.site 公式サイト 設計仕様（初版）

- 日付: 2026-08-21
- ステータス: ドラフト（中山レビュー待ち）
- 戦略上の位置づけ: `../../../ecommerce-project/00_戦略/公式サイト受け口_考察メモ_20260821.md`
- 承認済みの判断: 初版スコープ=B（小規模サイト）、Cloudflare=Pages+Functions少し、ビルド=Astro、GitHub連携あり、コンテンツ=既存資産で骨格→要所新規、計測=Cloudflare Web Analyticsのみ、アカウント=会社メールの既存個人アカウント、ドメイン取得は後、法務チェック=中山

---

## 1. 目的と役割

「ミエトレ」の公式サイト。広告・インフルエンサー・メディア掲載・大学共同研究の報道を見て「ミエトレ」で検索した人の**受け口**。

役割は3つ。

1. 指名検索の受け口（取りこぼし防止）。Web検索の正面玄関。
2. 信頼の置き場。ガボールパッチの外部エビデンス、大学共同研究の成果（着手後に追記）、メディア掲載実績。
3. アプリの中身を伝える。ゲームのルール・XPとリーグ戦・続けるしくみ・ふく多くん。検索して来た人の「何ができるの？楽しいの？」に答える。

出口はアプリDL（`/app` でストア振り分け）。サプリECへの導線はフッタのリンク1本に留める（初版）。

### 初版でやらないこと

- ポイント制度の説明（スモールテスト中・制度未確定）
- ブルーライト設定・スマホ疲れヒント（アプリ内Tips。第2弾で `/tips` 候補）
- GA4、問い合わせフォーム、お知らせのCMS化、多言語
- `mietore.site` ドメインの取得・紐付け（後日。設計上は設定値1か所）

---

## 2. 技術構成

| 項目 | 採用 | 理由 |
|---|---|---|
| 静的サイト生成 | Astro（静的出力） | 共通レイアウト、Markdownコンテンツ、Cloudflare公式対応 |
| CSS | 素CSS＋CSS変数（Tailwind等なし） | `design_concept_v3.md` のトンマナを変数化。学習対象をCloudflareに絞る |
| ホスティング | Cloudflare Pages（GitHub連携） | `main`=本番、他ブランチ=プレビューURL |
| 動的処理 | Pages Functions 1本（`/app`） | UA判定でApp Store / Google Playへ302 |
| 計測 | Cloudflare Web Analytics | タグ1行・Cookieレス・同意バナー不要 |
| ドメイン | 当面 `mietore-site.pages.dev`。後日 Cloudflare Registrar で `mietore.site` | Pages カスタムドメイン追加で切替 |
| リポジトリ | GitHub private `mietore-site`（`s-nakayama` アカウント、会社メール） | 後で会社Orgへ Transfer 可能 |
| 実行環境 | Node 24 / npm 11（確認済み）。wrangler は `npx wrangler` | — |

---

## 3. ページ構成（13ルート）

| パス | 役割 | 主素材（ecommerce-project 内） |
|---|---|---|
| `/` | FV（新規執筆）・ミエトレとは（1日3分・ながめて消すだけ）・ふく多くん・あそびかたへの導線・エビデンス要約・DLボタン | `40_資料/アプリLP/index.html`・`assets/` |
| `/play` | あそびかたハブ。4つの入口カード（game / xp-league / streak / fukuta） | 新規（短文） |
| `/play/game` | ゲームのルール: ガボール縞を見つけて消す・クラシックモード・ゲーム設定 | `40_資料/アプリ内モック/images/各種説明_プレイガイド_ゲームついて_01〜09.png`・`クラシックモード.png`・`ゲーム設定.png` |
| `/play/xp-league` | XP（経験値）とリーグ戦。ブロンズ→シルバー→ゴールド、20人グループ、週替わり（月曜0時）、昇格/降格、FAQ | `40_資料/リーグ説明素材/リーグ制_お客様向け説明文.md`（ほぼそのまま）・`リーグ制バナー.png`・`XP(経験値)とは.png` |
| `/play/streak` | 続けるしくみ: 連続記録・ライフ・救済措置・クエスト | `各種説明_プレイガイド_連続記録とは.png`・`ライフとは.png`・`救済措置とは.png`・`クエスト.png` |
| `/play/fukuta` | ふく多くん紹介（目守りの森の相棒・表情集） | `10_基盤/ブランド素材/ふく多くん_キャラクターブランドガイドライン_Ver0.2.md`・`アプリLP/assets/fukuta-*.png` |
| `/evidence` | ガボールパッチとは・外部エビデンス・大学共同研究（追記枠）・出典一覧 | `各種説明_root_01_ガボールパッチってなに.png`・`10_基盤/ブランド素材/`（エビデンスコンテンツ） |
| `/faq` | 無料？対象年齢？サプリ必須？データの扱い？リーグはいつから？ | リーグFAQ＋新規 |
| `/news` | お知らせ・メディア掲載（`src/content/news/*.md` 追加で更新） | 初版1件 |
| `/privacy` | プライバシーポリシー | アプリ既存文面（中山確認） |
| `/terms` | 利用規約 | アプリ既存文面（中山確認） |
| `/app` | Pages Function。UA→ストアへ302 | — |
| `/download` | UA不明（PC等）の着地。両ストアのバッジを並べる | 静的 |
| `/404` | 404ページ（ふく多くん） | — |

共通: ヘッダ（ロゴ・ナビ・DLボタン）／フッタ（運営会社・サプリサイトへのリンク1本・プライバシー・規約）。

画面キャプチャをそのまま貼るのではなく、テキスト化＋必要な画像のみ `public/` へコピーする。画像は圧縮（WebP化を検討）。

---

## 4. リポジトリ構造

```
mietore-site/
  src/
    layouts/Base.astro          共通ヘッダ・フッタ・<head>（meta/OGP/Web Analyticsタグ）
    components/                 DownloadButton / FukutaSay（吹き出し）/ Card / SectionTitle
    pages/
      index.astro
      play/index.astro, game.astro, xp-league.astro, streak.astro, fukuta.astro
      evidence.astro, faq.astro, news/index.astro, news/[slug].astro
      privacy.astro, terms.astro, 404.astro
    content/news/*.md           Content Collections（title, date, body）
    styles/global.css           トンマナ変数・リセット・共通部品
  public/                       画像・favicon・robots.txt・OGP画像
  functions/app.ts              /app UA振り分け
  astro.config.mjs              site（当面 pages.dev URL）
  package.json
  docs/superpowers/specs/       本spec
  docs/superpowers/plans/       実装計画
  README.md                     ローカル起動・デプロイ・ドメイン切替手順
```

---

## 5. `/app` Function の仕様

- 入力: `GET /app?src=<string>`（`src` は任意。例: `top`, `play`, `evidence`, `header`）
- 判定: `User-Agent` に `iPhone|iPad|iPod` → App Store URL、`Android` → Google Play URL
- 出力: 302 リダイレクト。ストアURLに `?src=` は付けない（ストア側で無効）。
- 計測: Function は即302するため Web Analytics のタグは走らない。DLボタンのクリック数は **Cloudflare Pages のリクエスト分析（パス別リクエスト数）で `/app` を確認**する。`src` 別の内訳が必要になれば第2弾で Analytics Engine を検討。
- UA不明（PC等）: `/download` へ302。
- ストアURLは `functions/app.ts` 内の定数。環境変数にはしない（公開情報）。

---

## 6. 開発・デプロイフロー

1. ローカル: `npm run dev`（Astro）。Functions込みの確認は `npm run build && npx wrangler pages dev dist`
2. ブランチを push → Cloudflare Pages がプレビューURLを発行 → 中山がスマホで確認
3. `main` へマージ → 本番（pages.dev）へ自動デプロイ
4. ドメイン切替（後日）: Registrar で取得 → Pages「Custom domains」に追加 → `astro.config.mjs` の `site` を更新 → `main` へ

Cloudflare側の初期設定（人が画面で実施・手順はREADMEに記載）:
- Pages プロジェクト作成（GitHub連携、ビルド `npm run build`、出力 `dist`、Node 24）
- Web Analytics サイト追加 → トークン取得 → `Base.astro` へ
- アカウント 2FA 有効化（推奨）

---

## 7. エラー処理

- 404: `src/pages/404.astro`（ふく多くん＋トップ/あそびかたへのリンク）
- `/app` UA不明: `/download` へ。落とさない
- ビルド失敗: Pages がデプロイを止める（前回本番が残る）。ローカルで `npm run build` を通してから push

---

## 8. 検証（Definition of Done）

- `npm run build` 成功、全ルート生成、`astro check` エラーなし
- 内部リンク切れなし（ビルド後に `dist/` をリンクチェック）
- プレビューURLで iPhone / Android 実機から `/app` が正しいストアへ遷移、PCでは `/download` へ
- Lighthouse（モバイル）: Performance / Accessibility 90以上
- Web Analytics にプレビュー閲覧のPVが届く
- 全画像に alt、OGP画像あり、`robots.txt` と `sitemap`（`@astrojs/sitemap`）あり

---

## 9. 公開ゲート

1. プレビュー公開（pages.dev） → 中山 内容レビュー
2. 法務チェック（薬機法・景表法）: 中山。対象=`/`・`/evidence`・`/play/game` の効能・効果に関わる表現。NG箇所は修正→再確認
3. `main` マージ＝本番公開（pages.dev） → ドメイン取得・紐付け

---

## 10. EC側との接続（並行タスク・本リポジトリ外）

- DEC-EC 起案: 「公式サイトを『買って取る』『信頼で取る』両層の共通受け口として戦略に追加し、`il/projects/mietore-site/` として制作する」
- `EC_STRATEGY.md` §4「3つの層」の表に受け口行を `[提案]` ラベルで追記
- `ecommerce-project/20_実行/ミエトレサイト/README.md`（ポインタ: 本体パス・役割・関連Decision）
- 考察メモ §7 の数値化: `/app?src=` のリクエスト数を分析Capabilityへ

---

## 11. 未確定事項（実装中に確定する）

| 項目 | 確定者 | 必要時期 |
|---|---|---|
| App Store / Google Play の正式URL | 中山 | `/app` 実装時 |
| プライバシーポリシー・利用規約の文面 | 中山 | 該当ページ作成時 |
| フッタのサプリサイトURL・運営会社表記 | 中山 | レイアウト作成時 |
| `/news` 初版1件の内容 | 中山 | コンテンツ作成時 |
| 大学共同研究の記述可否（現時点は「準備中」枠） | 中山 | evidence作成時 |
