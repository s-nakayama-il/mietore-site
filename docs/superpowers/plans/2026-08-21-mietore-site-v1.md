# mietore.site 公式サイト 初版 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「ミエトレ」公式サイト初版（13ルート）を Astro で作り、Cloudflare Pages（GitHub連携）の `*.pages.dev` でプレビュー公開できる状態にする。

**Architecture:** Astro 静的出力＋共通レイアウト（Base.astro）＋Markdown（news）。`/app` だけ Pages Functions でUA判定→ストアへ302。計測は Cloudflare Web Analytics のタグ1行。ビルド済み `dist/` に対する Node 標準テスト（`node --test`）で各ページの存在・主要文言・内部リンクを検証する。

**Tech Stack:** Node 24 / npm 11、Astro（`npm view astro version` → 7.2.4 時点）、`@astrojs/sitemap`、`@astrojs/check`+`typescript`、`wrangler`（`npx`）、`node:test`

**Spec:** `docs/superpowers/specs/2026-08-21-mietore-site-design.md`

## Global Constraints

- プロジェクトルート: `/home/nakayama/work/il/projects/mietore-site/`（以下、パスはすべてここからの相対）
- Astro は静的出力（`output: 'static'`）。SSRアダプタは入れない
- CSS は素CSS＋CSS変数のみ。Tailwind等のフレームワーク禁止
- フォント: Google Fonts「Zen Maru Gothic」（既存LPと同じ）
- 配色（design_concept_v3 / 既存LP style.css から）: `--cream:#F8F9FA` `--cream-deep:#EAEFF1` `--orange:#FA9B1C` `--orange-dk:#E0850A` `--white:#FFFFFF` `--teal:#57B2BE` `--teal-dk:#3C98A3` `--blue-light:#A0E3EE` `--green:#7CDA53` `--green-soft1:#B4E89A` `--green-soft2:#D6F3C5` `--ink:#2C3E40` `--ink-soft:#5C6F70`
- NGカラー: 医療色の強いネイビー
- ふく多くん表記: 初出は `ふく<ruby>多<rt>た</rt></ruby>くん`、以降「ふく多くん」。一人称「ぼく」（ひらがな）、口調「〜だよ／〜だね／〜かな／〜してみよう」。命令・指導・否定しない
- ストアURL（既存LPより）: App Store `https://apps.apple.com/jp/app/id6738352362`、Google Play `https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja`
- 効能・効果に関わる表現は断定しない。既存LPの免責文「本コンテンツは一般的な情報提供であり、診断・治療を目的としたものではありません。効果には個人差があります。」をフッタに常時表示
- 画像は `public/images/` に置き、`alt` 必須
- 素材の正本は `/home/nakayama/work/il/projects/ecommerce-project/`（以下 `$EC`）。`$EC` 内のファイルは**読むだけ・編集しない**
- コミットは各タスク末尾で行う（本プロジェクトはGitHub連携前提。ユーザー承認済み）
- 文章は通常の日本語（原始人口調不適用）

---

## ファイル構成（最終形）

```
mietore-site/
  package.json / astro.config.mjs / tsconfig.json / .gitignore / README.md
  src/
    layouts/Base.astro              <head>・ヘッダ・フッタ・Web Analyticsタグ
    components/Header.astro         ロゴ・ナビ・DLボタン
    components/Footer.astro         免責・リンク・©
    components/DownloadButton.astro `/app?src=` へのボタン
    components/FukutaSay.astro      ふく多くん吹き出し
    components/Card.astro           リンクカード（/play ハブ等）
    lib/store.ts                    UA→ストアURL判定（純関数）
    pages/index.astro
    pages/download.astro
    pages/play/index.astro, game.astro, xp-league.astro, streak.astro, fukuta.astro
    pages/evidence.astro, faq.astro
    pages/news/index.astro, news/[slug].astro
    pages/privacy.astro, terms.astro, 404.astro
    content.config.ts               news コレクション定義
    content/news/2026-08-21-site-open.md
    styles/global.css
  public/images/*.png, favicon.svg, og.png, robots.txt
  functions/app.ts                  GET /app
  tests/pages.test.mjs              dist/ 検証
  tests/store.test.mjs              lib/store.ts 検証
  docs/superpowers/specs/..., docs/superpowers/plans/...
```

---

### Task 1: リポジトリ初期化と Astro 雛形

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `README.md`, `src/pages/index.astro`（仮）, `tests/pages.test.mjs`

**Interfaces:**
- Produces: `npm run build` → `dist/`、`npm test` → `node --test tests/`、`npm run check` → `astro check`

- [ ] **Step 1: Astro プロジェクト作成（空テンプレ・既存フォルダに展開）**

```bash
cd /home/nakayama/work/il/projects/mietore-site
npm create astro@latest -- . --template minimal --no-install --no-git --typescript strict --yes
```
既存の `docs/` は残る（上書き確認が出たら「既存ファイルを残す」を選ぶ）。

- [ ] **Step 2: 依存追加・scripts 設定**

```bash
npm install
npm install @astrojs/sitemap
npm install -D @astrojs/check typescript wrangler
```
`package.json` の `scripts` を以下に置き換える:
```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "check": "astro check",
  "test": "node --test tests/",
  "pages:dev": "wrangler pages dev dist",
  "verify": "npm run check && npm run build && npm test"
}
```

- [ ] **Step 3: astro.config.mjs**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ドメイン取得後は 'https://mietore.site' に差し替える（spec §2）
export default defineConfig({
  site: 'https://mietore-site.pages.dev',
  output: 'static',
  integrations: [sitemap()],
});
```

- [ ] **Step 4: .gitignore**

```
node_modules/
dist/
.astro/
.wrangler/
.env
.env.*
!.env.example
.DS_Store
```

- [ ] **Step 5: 失敗するテストを書く（tests/pages.test.mjs）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
export const html = (p) => readFileSync(join(DIST, p), 'utf8');

test('index.html が生成される', () => {
  assert.ok(existsSync(join(DIST, 'index.html')));
});

test('index.html に「ミエトレ」を含む', () => {
  assert.match(html('index.html'), /ミエトレ/);
});
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`dist/` が無い → ENOENT）

- [ ] **Step 7: 仮トップページ**

`src/pages/index.astro`:
```astro
---
---
<html lang="ja"><head><meta charset="utf-8" /><title>ミエトレ</title></head>
<body><h1>ミエトレ</h1></body></html>
```

- [ ] **Step 8: ビルド→テスト合格を確認**

Run: `npm run build && npm test`
Expected: 2 tests PASS

- [ ] **Step 9: README 骨子**

`README.md`:
```markdown
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
```

- [ ] **Step 10: git 初期化とコミット**

```bash
git init -b main
git add -A
git commit -m "chore: Astro雛形・テスト基盤・README"
```

---

### Task 2: グローバルCSS・共通レイアウト・ヘッダ/フッタ・DLボタン

**Files:**
- Create: `src/styles/global.css`, `src/layouts/Base.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/components/DownloadButton.astro`, `src/components/FukutaSay.astro`, `src/components/Card.astro`
- Modify: `src/pages/index.astro`（Baseを使う形に）
- Modify: `tests/pages.test.mjs`

**Interfaces:**
- Produces:
  - `Base.astro` props: `{ title: string; description: string; noindex?: boolean }`。`<slot />` に本文
  - `DownloadButton.astro` props: `{ src: string; label?: string }` → `<a href={`/app?src=${src}`}>`
  - `FukutaSay.astro` props: `{ img: 'default'|'hello'|'phone'|'celebrate'|'bow'; side?: 'left'|'right' }`、`<slot />` にセリフ
  - `Card.astro` props: `{ href: string; title: string }`、`<slot />` に説明

- [ ] **Step 1: テスト追加**

`tests/pages.test.mjs` に追記:
```js
test('共通ヘッダ・フッタ・DLボタンがトップにある', () => {
  const h = html('index.html');
  assert.match(h, /<header/);
  assert.match(h, /<footer/);
  assert.match(h, /href="\/app\?src=header"/);
  assert.match(h, /診断・治療を目的としたものではありません/);
});
```
Run: `npm run build && npm test` → 新テスト FAIL

- [ ] **Step 2: global.css**

```css
:root{
  --cream:#F8F9FA; --cream-deep:#EAEFF1; --orange:#FA9B1C; --orange-dk:#E0850A;
  --white:#FFFFFF; --teal:#57B2BE; --teal-dk:#3C98A3; --blue-light:#A0E3EE;
  --green:#7CDA53; --green-soft1:#B4E89A; --green-soft2:#D6F3C5;
  --ink:#2C3E40; --ink-soft:#5C6F70;
  --shadow:0 10px 28px rgba(40,80,85,.14); --radius:22px; --maxw:720px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Yu Gothic","Meiryo",sans-serif;color:var(--ink);background:var(--cream);line-height:1.85;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
a{color:var(--teal-dk)}
.container{max-width:var(--maxw);margin-inline:auto;padding-inline:24px}
.sec{padding-block:40px}
.sec-title{font-size:1.5rem;font-weight:900;text-align:center;margin-bottom:20px}
.btn{display:inline-block;background:var(--orange);color:#fff;font-weight:700;padding:14px 28px;border-radius:999px;text-decoration:none;box-shadow:var(--shadow)}
.btn:hover{background:var(--orange-dk)}
.card{display:block;background:var(--white);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);text-decoration:none;color:inherit}
.card h3{color:var(--teal-dk);margin-bottom:6px}
.bubble{background:var(--white);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow)}
.say{display:flex;gap:12px;align-items:flex-start;margin-block:16px}
.say--right{flex-direction:row-reverse}
.say__img{width:72px;flex:none}
.site-header{background:linear-gradient(var(--green-soft1),var(--green-soft2))}
.site-header .container{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:12px}
.site-header nav a{margin-inline:8px;color:var(--ink);text-decoration:none;font-weight:700}
.site-footer{background:var(--cream-deep);color:var(--ink-soft);font-size:.85rem;padding-block:28px;margin-top:48px}
.site-footer a{color:var(--ink-soft)}
@media (max-width:600px){.site-header nav{display:none}}
```

- [ ] **Step 3: components**

`src/components/DownloadButton.astro`:
```astro
---
interface Props { src: string; label?: string }
const { src, label = 'アプリを無料ダウンロード' } = Astro.props;
---
<a class="btn" href={`/app?src=${src}`}>{label}</a>
```

`src/components/FukutaSay.astro`:
```astro
---
interface Props { img: 'default'|'hello'|'phone'|'celebrate'|'bow'; side?: 'left'|'right' }
const { img, side = 'left' } = Astro.props;
const alt = { default:'正面を向いたふく多くん', hello:'片手をあげて挨拶するふく多くん', phone:'スマホを見るふく多くん', celebrate:'お祝いするふく多くん', bow:'お辞儀するふく多くん' }[img];
---
<div class={`say say--${side}`}>
  <img class="say__img" src={`/images/fukuta-${img}.png`} alt={alt} width="72" height="72" loading="lazy" />
  <div class="bubble"><slot /></div>
</div>
```

`src/components/Card.astro`:
```astro
---
interface Props { href: string; title: string }
const { href, title } = Astro.props;
---
<a class="card" href={href}><h3>{title}</h3><p><slot /></p></a>
```

`src/components/Header.astro`:
```astro
---
import DownloadButton from './DownloadButton.astro';
---
<header class="site-header">
  <div class="container">
    <a href="/" style="font-weight:900;font-size:1.3rem;color:var(--ink);text-decoration:none">ミエトレ</a>
    <nav>
      <a href="/play">あそびかた</a>
      <a href="/evidence">エビデンス</a>
      <a href="/faq">よくある質問</a>
      <a href="/news">お知らせ</a>
    </nav>
    <DownloadButton src="header" label="無料DL" />
  </div>
</header>
```

`src/components/Footer.astro`:
```astro
<footer class="site-footer">
  <div class="container">
    <p>本コンテンツは一般的な情報提供であり、診断・治療を目的としたものではありません。効果には個人差があります。</p>
    <p style="margin-top:12px">
      <a href="/privacy">プライバシーポリシー</a> ／ <a href="/terms">利用規約</a>
    </p>
    <p style="margin-top:12px">© ミエトレ</p>
  </div>
</footer>
```
（運営会社名・サプリサイトURLは中山から受領後に追記。spec §11）

- [ ] **Step 4: Base.astro**

```astro
---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
interface Props { title: string; description: string; noindex?: boolean }
const { title, description, noindex = false } = Astro.props;
const canonical = new URL(Astro.url.pathname, Astro.site);
---
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}｜ミエトレ</title>
  <meta name="description" content={description} />
  {noindex && <meta name="robots" content="noindex" />}
  <link rel="canonical" href={canonical} />
  <meta property="og:title" content={`${title}｜ミエトレ`} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={new URL('/og.png', Astro.site)} />
  <meta property="og:type" content="website" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&display=swap" rel="stylesheet" />
  <!-- Cloudflare Web Analytics: Task 9 でトークンを入れる -->
</head>
<body>
  <Header />
  <main><slot /></main>
  <Footer />
</body>
</html>
```

- [ ] **Step 5: index.astro を Base 利用に書き換え**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="1日3分、ながめて消すだけの目のゲーム" description="ガボールの縞模様を消すだけのかんたんゲーム「ミエトレ」。相棒のふく多くんと、スキマ時間に目で遊ぼう。">
  <section class="sec container"><h1>ミエトレ</h1></section>
</Base>
```

- [ ] **Step 6: 検証とコミット**

Run: `npm run verify`
Expected: check OK、build OK、tests PASS
```bash
git add -A && git commit -m "feat: 共通レイアウト・ヘッダ/フッタ・DLボタン・トンマナCSS"
```

---

### Task 3: `/app` ストア振り分け（Function）と `/download`

**Files:**
- Create: `src/lib/store.ts`, `tests/store.test.mjs`, `functions/app.ts`, `src/pages/download.astro`
- Modify: `tests/pages.test.mjs`

**Interfaces:**
- Produces: `src/lib/store.ts` → `export function storeUrlFor(ua: string | null): string` （iOS→App Store URL、Android→Play URL、それ以外→`/download`）。`export const APP_STORE_URL`, `export const PLAY_URL`

- [ ] **Step 1: テスト（tests/store.test.mjs）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeUrlFor, APP_STORE_URL, PLAY_URL } from '../src/lib/store.ts';

test('iPhone → App Store', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), APP_STORE_URL);
});
test('iPad → App Store', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), APP_STORE_URL);
});
test('Android → Google Play', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), PLAY_URL);
});
test('PC → /download', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), '/download');
});
test('UAなし → /download', () => {
  assert.equal(storeUrlFor(null), '/download');
});
```
Run: `npm test` → FAIL（module not found）。Node 24 は `.ts` を型注釈除去で直接実行できる（`--experimental-strip-types` が既定で有効）。もし SyntaxError になる場合は `"test": "node --experimental-strip-types --test tests/"` に変更する。

- [ ] **Step 2: 実装（src/lib/store.ts）**

```ts
export const APP_STORE_URL = 'https://apps.apple.com/jp/app/id6738352362';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja';

export function storeUrlFor(ua: string | null): string {
  if (!ua) return '/download';
  if (/iPhone|iPad|iPod/i.test(ua)) return APP_STORE_URL;
  if (/Android/i.test(ua)) return PLAY_URL;
  return '/download';
}
```
Run: `npm test` → store tests PASS

- [ ] **Step 3: Pages Function（functions/app.ts）**

```ts
import { storeUrlFor } from '../src/lib/store';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const target = storeUrlFor(request.headers.get('user-agent'));
  const location = target.startsWith('/') ? new URL(target, request.url).toString() : target;
  return Response.redirect(location, 302);
};
```
`PagesFunction` 型のため `npm i -D @cloudflare/workers-types` を追加し、`tsconfig.json` の `compilerOptions.types` に `["@cloudflare/workers-types"]` を加える。`astro check` が `functions/` を見ない場合はそのままでよい。

- [ ] **Step 4: /download ページ**

`src/pages/download.astro`:
```astro
---
import Base from '../layouts/Base.astro';
import { APP_STORE_URL, PLAY_URL } from '../lib/store';
---
<Base title="アプリをダウンロード" description="ミエトレは iPhone / Android で無料。お使いのストアからダウンロードできます。">
  <section class="sec container" style="text-align:center">
    <h1 class="sec-title">アプリをダウンロード</h1>
    <p>スマートフォンで、お使いのストアを選んでください。無料です。</p>
    <p style="margin-top:20px"><a class="btn" href={APP_STORE_URL}>App Store（iPhone）</a></p>
    <p style="margin-top:12px"><a class="btn" href={PLAY_URL}>Google Play（Android）</a></p>
  </section>
</Base>
```

- [ ] **Step 5: ページテスト追記**

```js
test('download.html に両ストアのリンク', () => {
  const h = html('download/index.html');
  assert.match(h, /apps\.apple\.com\/jp\/app\/id6738352362/);
  assert.match(h, /play\.google\.com\/store\/apps\/details\?id=com\.ilinksnet\.gabor/);
});
```

- [ ] **Step 6: Functions のローカル動作確認**

```bash
npm run build
npx wrangler pages dev dist --port 8788 &
sleep 5
curl -sI -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" http://localhost:8788/app | grep -i location
curl -sI -A "Mozilla/5.0 (Linux; Android 14)" http://localhost:8788/app | grep -i location
curl -sI http://localhost:8788/app | grep -i location
kill %1
```
Expected: 順に `apps.apple.com`、`play.google.com`、`/download` を含む Location

- [ ] **Step 7: 検証とコミット**

Run: `npm run verify`
```bash
git add -A && git commit -m "feat: /app UA振り分けFunctionと/downloadページ"
```

---

### Task 4: 画像アセット配置とトップページ

**Files:**
- Create: `public/images/fukuta-{default,hello,phone,celebrate,bow}.png`, `public/images/game.png`, `public/favicon.svg`, `public/og.png`, `public/robots.txt`
- Modify: `src/pages/index.astro`, `tests/pages.test.mjs`

- [ ] **Step 1: 画像コピー**

```bash
EC=/home/nakayama/work/il/projects/ecommerce-project
mkdir -p public/images
cp $EC/40_資料/アプリLP/assets/fukuta-*.png $EC/40_資料/アプリLP/assets/game.png public/images/
ls -la public/images
```
サイズが1枚500KBを超える場合は `npx sharp-cli`（または ImageMagick `convert -resize 800x -quality 85`）で縮小する。OGP画像 `public/og.png` は `game.png` を 1200×630 の背景 `#D6F3C5` にセンター配置して生成する（ImageMagick 例: `convert -size 1200x630 xc:'#D6F3C5' public/images/game.png -resize x560 -gravity center -composite public/og.png`）。favicon は以下のSVGで作成:

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#57B2BE"/><circle cx="32" cy="32" r="14" fill="#FFFFFF"/><circle cx="32" cy="32" r="7" fill="#2C3E40"/></svg>
```

`public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://mietore-site.pages.dev/sitemap-index.xml
```

- [ ] **Step 2: テスト追記**

```js
test('トップ: FV・遊び方・あそびかた導線・エビデンス導線・DLボタン', () => {
  const h = html('index.html');
  assert.match(h, /ながめて消すだけ/);
  assert.match(h, /href="\/play"/);
  assert.match(h, /href="\/evidence"/);
  assert.match(h, /href="\/app\?src=top"/);
  assert.match(h, /images\/fukuta-hello\.png/);
});
```

- [ ] **Step 3: index.astro 本文**

構成は既存LP（`$EC/40_資料/アプリLP/index.html`）を骨格にし、FVコピーだけ「検索して来た人」向けに新規。

```astro
---
import Base from '../layouts/Base.astro';
import DownloadButton from '../components/DownloadButton.astro';
import FukutaSay from '../components/FukutaSay.astro';
import Card from '../components/Card.astro';
---
<Base title="1日3分、ながめて消すだけの目のゲーム" description="ガボールの縞模様を消すだけのかんたんゲーム「ミエトレ」。相棒のふく多くんと、スキマ時間に目で遊ぼう。無料アプリ。">

  <section class="sec container" style="text-align:center">
    <p style="font-weight:700;color:var(--teal-dk)">目のケアを、ゲームに。</p>
    <h1 style="font-size:2rem;font-weight:900;line-height:1.4">1日3分、<br>ながめて消すだけ。</h1>
    <p style="margin-top:12px">縞模様（しまもよう）をタップして消す、それだけのかんたんなゲーム。<br>相棒の ふく<ruby>多<rt>た</rt></ruby>くん と、スキマ時間に目で遊ぼう。</p>
    <img src="/images/fukuta-hello.png" alt="片手をあげて挨拶するふく多くん" width="200" height="200" style="margin:20px auto" />
    <DownloadButton src="top" />
    <p style="font-size:.9rem;color:var(--ink-soft);margin-top:8px">無料でダウンロードできるよ</p>
  </section>

  <section class="sec container">
    <FukutaSay img="default">
      <p>やあ、ぼくは<strong>ふく多</strong>。目守りの森の相棒だよ。</p>
      <p>むずかしいことは、なんにもなし。ゲームで遊ぶだけ。ぼくと一緒に、目で遊んでみない？</p>
    </FukutaSay>
  </section>

  <section class="sec container">
    <h2 class="sec-title">遊び方は、かんたん。</h2>
    <img src="/images/game.png" alt="ミエトレのゲーム画面。縞模様のパネルが並んでいる" width="320" style="margin:0 auto 20px;border-radius:var(--radius);box-shadow:var(--shadow)" loading="lazy" />
    <ol style="padding-left:1.4em">
      <li>ならんだ<strong>縞模様（しまもよう）</strong>を見つける</li>
      <li>タップして、<strong>ぜんぶ消す</strong></li>
      <li>「全消し」できたら、その日はクリア！</li>
    </ol>
    <FukutaSay img="phone" side="right">
      <p>これは“脳”の体操でもあるんだ。目のレンズじゃなく、目から入った情報を処理する“脳の見る力”に着目して研究されている縞模様なんだよ。</p>
    </FukutaSay>
    <p style="text-align:center;margin-top:16px"><a class="btn" href="/play">あそびかたをくわしく見る</a></p>
  </section>

  <section class="sec container">
    <h2 class="sec-title">続けたくなる、しかけ。</h2>
    <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <Card href="/play/xp-league" title="XPとリーグ戦">遊ぶほどXPがたまる。毎週、同じくらいの人たちと順位を競える。</Card>
      <Card href="/play/streak" title="連続記録とクエスト">毎日続けた日数が記録される。ライフや救済措置で、うっかりも大丈夫。</Card>
      <Card href="/play/fukuta" title="相棒・ふく多くん">教えないし、いそがせない。続けるあなたをそばで応援する。</Card>
    </div>
  </section>

  <section class="sec container">
    <h2 class="sec-title">ガボールパッチって？</h2>
    <p>ミエトレのゲームに出てくる縞模様は「ガボールパッチ」と呼ばれ、目のレンズではなく“脳の視覚処理”に着目して研究されている図形です。</p>
    <p style="text-align:center;margin-top:16px"><a class="btn" href="/evidence">研究とエビデンスを見る</a></p>
  </section>

  <section class="sec container" style="text-align:center">
    <img src="/images/fukuta-bow.png" alt="お辞儀するふく多くん" width="160" height="160" style="margin:0 auto 12px" loading="lazy" />
    <h2 class="sec-title">さあ、今日から3分。</h2>
    <DownloadButton src="bottom" />
    <p style="margin-top:8px">一緒に、続けてみようよ。</p>
  </section>

</Base>
```

- [ ] **Step 4: 検証とコミット**

Run: `npm run verify`
```bash
git add -A && git commit -m "feat: トップページとアセット（ふく多くん・ゲーム画面・OGP・favicon）"
```

---

### Task 5: `/play` ハブと `/play/game`

**Files:**
- Create: `src/pages/play/index.astro`, `src/pages/play/game.astro`, `public/images/play-game-*.png`（必要分のみ）
- Modify: `tests/pages.test.mjs`

- [ ] **Step 1: 素材を読む（テキスト化のため画像を目視）**

Read ツールで以下を開き、画面内の文言をメモする（OCR不要・内容を自分の言葉で短文化）:
- `$EC/40_資料/アプリ内モック/images/各種説明_プレイガイド_ゲームついて_01.png` 〜 `_09.png`
- `$EC/40_資料/アプリ内モック/images/クラシックモード.png`
- `$EC/40_資料/アプリ内モック/images/ゲーム設定.png`
画像のうち、ページに載せるのは「ゲーム画面が写っているもの」最大3枚。`cp` で `public/images/play-game-1.png` 等にコピーし、500KB超なら縮小。

- [ ] **Step 2: テスト追記**

```js
test('/play ハブに4つの入口', () => {
  const h = html('play/index.html');
  for (const p of ['/play/game','/play/xp-league','/play/streak','/play/fukuta']) assert.match(h, new RegExp(`href="${p}"`));
});
test('/play/game にルール3ステップとクラシックモード', () => {
  const h = html('play/game/index.html');
  assert.match(h, /全消し/);
  assert.match(h, /クラシックモード/);
  assert.match(h, /href="\/app\?src=play-game"/);
});
```

- [ ] **Step 3: play/index.astro**

```astro
---
import Base from '../../layouts/Base.astro';
import Card from '../../components/Card.astro';
---
<Base title="あそびかた" description="ミエトレのあそびかた。ゲームのルール、XPとリーグ戦、連続記録とクエスト、相棒のふく多くん。">
  <section class="sec container">
    <h1 class="sec-title">あそびかた</h1>
    <p style="text-align:center">ルールはかんたん。でも、続けたくなるしかけがいくつもあります。</p>
    <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:20px">
      <Card href="/play/game" title="ゲームのルール">縞模様を見つけて、タップして消す。1日3分。</Card>
      <Card href="/play/xp-league" title="XPとリーグ戦">遊ぶほどたまる経験値で、毎週ランキング。</Card>
      <Card href="/play/streak" title="連続記録・ライフ・クエスト">続けた日数が力になる。うっかりにも救済あり。</Card>
      <Card href="/play/fukuta" title="相棒・ふく多くん">目守りの森のみみずく。いつもそばで応援。</Card>
    </div>
  </section>
</Base>
```

- [ ] **Step 4: play/game.astro**

Step 1 で読んだ内容に合わせて箇条書きを調整する（以下は骨格。画面と食い違う記述は画面に合わせる）:
```astro
---
import Base from '../../layouts/Base.astro';
import DownloadButton from '../../components/DownloadButton.astro';
import FukutaSay from '../../components/FukutaSay.astro';
---
<Base title="ゲームのルール" description="ミエトレのゲームのルール。ならんだ縞模様を見つけてタップで消す。全消しでその日はクリア。クラシックモードやゲーム設定も。">
  <section class="sec container">
    <h1 class="sec-title">ゲームのルール</h1>
    <ol style="padding-left:1.4em">
      <li>画面にならんだパネルの中から、<strong>縞模様（しまもよう）</strong>を見つける</li>
      <li>タップして、<strong>ぜんぶ消す</strong></li>
      <li>「全消し」できたら、その日はクリア！ 1回は数分で終わります</li>
    </ol>
    <img src="/images/play-game-1.png" alt="ゲーム画面のチュートリアル" width="320" style="margin:20px auto;border-radius:var(--radius);box-shadow:var(--shadow)" loading="lazy" />
    <FukutaSay img="default">
      <p>コツは、じっと見つめないこと。ぼんやりながめていると、縞模様がふっと浮かんで見えてくるよ。</p>
    </FukutaSay>
  </section>
  <section class="sec container">
    <h2 class="sec-title">クラシックモード</h2>
    <p>（Step 1 で読んだクラシックモードの説明をここに。例: 通常モードとの違い、いつ遊べるか）</p>
  </section>
  <section class="sec container">
    <h2 class="sec-title">ゲーム設定</h2>
    <p>（Step 1 で読んだ設定項目をここに。例: 文字やパネルの大きさ、効果音）</p>
  </section>
  <section class="sec container" style="text-align:center">
    <DownloadButton src="play-game" />
  </section>
</Base>
```
「（Step 1 で読んだ…）」の括弧書きは必ず実文に置き換えてからコミットする。

- [ ] **Step 5: 検証とコミット**

Run: `npm run verify`
```bash
git add -A && git commit -m "feat: あそびかたハブとゲームのルール"
```

---

### Task 6: `/play/xp-league` と `/play/streak`

**Files:**
- Create: `src/pages/play/xp-league.astro`, `src/pages/play/streak.astro`, `public/images/league-banner.png`
- Modify: `tests/pages.test.mjs`

- [ ] **Step 1: 素材**

- テキスト正本: `$EC/40_資料/リーグ説明素材/リーグ制_お客様向け説明文.md`（「社内メモ」ブロックは載せない）
- 画像: `cp "$EC/40_資料/リーグ説明素材/リーグ制バナー.png" public/images/league-banner.png`
- Read で目視: `各種説明_プレイガイド_XP(経験値)とは.png`、`連続記録とは.png`、`ライフとは.png`、`救済措置とは.png`、`クエスト.png`

- [ ] **Step 2: テスト追記**

```js
test('/play/xp-league にリーグ3段階と週替わり', () => {
  const h = html('play/xp-league/index.html');
  assert.match(h, /ブロンズリーグ/); assert.match(h, /シルバーリーグ/); assert.match(h, /ゴールドリーグ/);
  assert.match(h, /月曜/);
});
test('/play/streak に連続記録・ライフ・救済措置・クエスト', () => {
  const h = html('play/streak/index.html');
  for (const w of ['連続記録','ライフ','救済措置','クエスト']) assert.match(h, new RegExp(w));
});
```

- [ ] **Step 3: xp-league.astro**

`リーグ制_お客様向け説明文.md` の本文をそのままHTML化する（見出し: リーグのしくみ／楽しみ方／XPのため方／よくあるご質問）。冒頭に `league-banner.png`（alt「リーグ戦のバナー」）。末尾に `<DownloadButton src="play-league" />`。

- [ ] **Step 4: streak.astro**

見出し4つ（連続記録とは／ライフとは／救済措置とは／クエストとは）。各見出しの下に Step 1 で読んだ画面の説明を2〜4文で。ふく多くんの一言を1つ（`FukutaSay img="celebrate"`: 「1日さぼっても、ぼくは怒らないよ。救済措置があるから、またここから続けよう。」）。末尾に `<DownloadButton src="play-streak" />`。

- [ ] **Step 5: 検証とコミット**

Run: `npm run verify`
```bash
git add -A && git commit -m "feat: XPとリーグ戦・続けるしくみページ"
```

---

### Task 7: `/play/fukuta`・`/evidence`・`/faq`

**Files:**
- Create: `src/pages/play/fukuta.astro`, `src/pages/evidence.astro`, `src/pages/faq.astro`
- Modify: `tests/pages.test.mjs`

- [ ] **Step 1: 素材**

- `$EC/10_基盤/ブランド素材/ふく多くん_キャラクターブランドガイドライン_Ver0.2.md`（第1・2・3・5章。裏設定・制作者向けは載せない）
- Read: `$EC/40_資料/アプリ内モック/images/各種説明_root_01_ガボールパッチってなに.png`（アプリ内の説明文言・引用している研究名があれば控える）

- [ ] **Step 2: テスト追記**

```js
test('/play/fukuta にふく多くんの紹介と表情', () => {
  const h = html('play/fukuta/index.html');
  assert.match(h, /みみずく/); assert.match(h, /images\/fukuta-celebrate\.png/);
});
test('/evidence にガボールパッチ・出典・共同研究枠', () => {
  const h = html('evidence/index.html');
  assert.match(h, /ガボールパッチ/); assert.match(h, /出典/); assert.match(h, /共同研究/);
});
test('/faq に5問以上', () => {
  const h = html('faq/index.html');
  assert.ok((h.match(/<summary>/g) || []).length >= 5);
});
```

- [ ] **Step 3: fukuta.astro**

内容: 名前（ルビ）／種族みみずく／住んでいる場所「目守りの森（めま森）」／役割「アイケア習慣を支える伴走者。先生でも医者でもなく、相棒」／性格（優しい・褒め上手・応援好き・ユーモア）／口調の例／表情ギャラリー（5枚 `fukuta-*.png` を `display:grid` で並べ alt 付き）／ふく多くんの一言（`FukutaSay img="hello"`: 「ぼくの趣味は、友達と過ごすこと。だから毎日、アプリの中で待ってるよ。」）。

- [ ] **Step 4: evidence.astro**

```astro
---
import Base from '../layouts/Base.astro';
import DownloadButton from '../components/DownloadButton.astro';
---
<Base title="ガボールパッチとエビデンス" description="ミエトレのゲームに使われている「ガボールパッチ」とは何か、どのような研究があるのかをまとめました。">
  <section class="sec container">
    <h1 class="sec-title">ガボールパッチとエビデンス</h1>
    <h2>ガボールパッチとは</h2>
    <p>ぼんやりとした縞模様の図形です。物理学者デニス・ガボールの名にちなみます。視覚科学の分野で、目のレンズではなく「目から入った情報を処理する脳のはたらき（視覚処理）」を調べる刺激として古くから使われてきました。</p>
    <h2 style="margin-top:24px">どんな研究があるか</h2>
    <p>ガボールパッチを用いた知覚学習（繰り返し見る訓練）について、加齢に伴う見え方の変化に関する研究報告があります（下記出典）。ミエトレは、この縞模様を「見つけて消す」ゲームとして毎日続けやすくしたものです。</p>
    <p style="font-size:.9rem;color:var(--ink-soft)">※ 効果には個人差があります。本ページは一般的な情報提供であり、診断・治療を目的としたものではありません。</p>
    <h2 style="margin-top:24px">大学との共同研究</h2>
    <div class="bubble"><p>現在、大学との共同研究を準備しています。結果がまとまり次第、このページでお知らせします。</p></div>
    <h2 style="margin-top:24px">出典</h2>
    <ul style="padding-left:1.4em;font-size:.9rem">
      <li>Polat U, et al. "Training the brain to overcome the effect of aging on the eye." Scientific Reports 2, 278 (2012).</li>
      <li>アプリ内「ガボールパッチってなに」（Step 1 で確認した引用があればここに追加）</li>
    </ul>
  </section>
  <section class="sec container" style="text-align:center"><DownloadButton src="evidence" /></section>
</Base>
```
出典の書誌は実装者が Web で実在・表記を確認してから入れる（確認できない場合はその行を外し、READMEの「未確定」に記録）。このページは法務チェック対象（spec §9）。

- [ ] **Step 5: faq.astro**

`<details><summary>質問</summary><p>答え</p></details>` を並べる。初版の質問と答え:
1. 無料ですか？ → アプリのダウンロードとゲームは無料です。
2. 1日どのくらい遊べばいいですか？ → 目安は1日3分。1回の全消しでその日はクリアです。
3. 対象年齢はありますか？ → 大人向けに設計しています。お子さまの利用はおすすめしていません。
4. サプリを買わないと使えませんか？ → いいえ。アプリだけで遊べます。
5. リーグ戦にはいつから参加できますか？ → グループは毎週月曜0時に作られます。新しく始めた方は次の月曜0時から参加します。
6. しばらく休んでいても大丈夫ですか？ → 直近2週間以内にトレーニングした方がリーグ戦の対象です。再開すれば次の月曜から参加できます。
7. データはどう扱われますか？ → プライバシーポリシーをご覧ください（`/privacy` へリンク）。
3と7は中山確認（spec §11に準ずる）。

- [ ] **Step 6: 検証とコミット**

Run: `npm run verify`
```bash
git add -A && git commit -m "feat: ふく多くん紹介・エビデンス・FAQ"
```

---

### Task 8: `/news`（Content Collections）・`/privacy`・`/terms`・`404`

**Files:**
- Create: `src/content.config.ts`, `src/content/news/2026-08-21-site-open.md`, `src/pages/news/index.astro`, `src/pages/news/[slug].astro`, `src/pages/privacy.astro`, `src/pages/terms.astro`, `src/pages/404.astro`
- Modify: `tests/pages.test.mjs`

- [ ] **Step 1: テスト追記**

```js
test('/news 一覧と記事', () => {
  assert.match(html('news/index.html'), /href="\/news\/2026-08-21-site-open"/);
  assert.match(html('news/2026-08-21-site-open/index.html'), /公式サイト/);
});
test('privacy/terms は noindex で仮公開', () => {
  for (const p of ['privacy/index.html','terms/index.html']) assert.match(html(p), /name="robots" content="noindex"/);
});
test('404 ページ', () => { assert.match(html('404.html'), /見つかりません/); });
```

- [ ] **Step 2: content.config.ts**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({ title: z.string(), date: z.coerce.date() }),
});
export const collections = { news };
```
Astro のバージョンにより `glob` の import 元が異なる場合は `npx astro docs` / 公式ドキュメント「Content collections」を確認して合わせる。

- [ ] **Step 3: 初版記事**

`src/content/news/2026-08-21-site-open.md`:
```md
---
title: 公式サイトを公開しました
date: 2026-08-21
---
「ミエトレ」の公式サイトを公開しました。あそびかた、エビデンス、よくある質問をまとめています。
```

- [ ] **Step 4: news/index.astro と news/[slug].astro**

```astro
---
// src/pages/news/index.astro
import Base from '../../layouts/Base.astro';
import { getCollection } from 'astro:content';
const posts = (await getCollection('news')).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
---
<Base title="お知らせ" description="ミエトレからのお知らせ・メディア掲載情報。">
  <section class="sec container">
    <h1 class="sec-title">お知らせ</h1>
    <ul style="list-style:none">
      {posts.map(p => (
        <li style="margin-block:12px"><time>{p.data.date.toISOString().slice(0,10)}</time> <a href={`/news/${p.id}`}>{p.data.title}</a></li>
      ))}
    </ul>
  </section>
</Base>
```
```astro
---
// src/pages/news/[slug].astro
import Base from '../../layouts/Base.astro';
import { getCollection, render } from 'astro:content';
export async function getStaticPaths() {
  const posts = await getCollection('news');
  return posts.map(p => ({ params: { slug: p.id }, props: { post: p } }));
}
const { post } = Astro.props;
const { Content } = await render(post);
---
<Base title={post.data.title} description={post.data.title}>
  <article class="sec container">
    <h1 class="sec-title">{post.data.title}</h1>
    <time>{post.data.date.toISOString().slice(0,10)}</time>
    <Content />
  </article>
</Base>
```
`p.id` がファイル名から拡張子を除いたものになるか確認（`2026-08-21-site-open`）。異なる場合は `p.slug` または `p.id.replace(/\.md$/, '')` を使う。

- [ ] **Step 5: privacy / terms（文面受領まで noindex・仮公開）**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="プライバシーポリシー" description="ミエトレのプライバシーポリシー" noindex={true}>
  <section class="sec container">
    <h1 class="sec-title">プライバシーポリシー</h1>
    <p>アプリ「ミエトレ」のプライバシーポリシーは、アプリ内およびストアページに掲載しているものが正本です。本ページは準備中で、内容が確定次第、掲載します。</p>
  </section>
</Base>
```
`terms.astro` も同形（タイトル「利用規約」）。中山から文面を受領したら本文を差し替え `noindex` を外す（README「未確定」に記録）。

- [ ] **Step 6: 404.astro**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="ページが見つかりません" description="お探しのページは見つかりませんでした。" noindex={true}>
  <section class="sec container" style="text-align:center">
    <img src="/images/fukuta-default.png" alt="正面を向いたふく多くん" width="160" height="160" style="margin:0 auto 12px" />
    <h1 class="sec-title">ページが見つかりません</h1>
    <p>ぼくも探してみたけど、見つからなかったよ。</p>
    <p style="margin-top:16px"><a class="btn" href="/">トップへ</a> <a class="btn" href="/play">あそびかたへ</a></p>
  </section>
</Base>
```

- [ ] **Step 7: 検証とコミット**

Run: `npm run verify`
```bash
git add -A && git commit -m "feat: お知らせ（Content Collections）・規約仮ページ・404"
```

---

### Task 9: 品質ゲート（内部リンク検査・Lighthouse）と README「未確定」一覧

**Files:**
- Modify: `tests/pages.test.mjs`, `README.md`

- [ ] **Step 1: 内部リンク切れテスト**

`tests/pages.test.mjs` に追記:
```js
import { readdirSync, statSync } from 'node:fs';
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p, acc) : p.endsWith('.html') && acc.push(p); }
  return acc;
}
test('内部リンクが全てdist内に存在する（/app は Function なので除外）', () => {
  const files = walk(DIST);
  const missing = [];
  for (const f of files) {
    const h = readFileSync(f, 'utf8');
    for (const m of h.matchAll(/href="(\/[^"#?]*)/g)) {
      const p = m[1];
      if (p === '/app' || p.startsWith('/images') || p.endsWith('.xml') || p.endsWith('.svg') || p.endsWith('.png')) continue;
      const target = p.endsWith('/') || p === '/' ? join(DIST, p, 'index.html') : join(DIST, p, 'index.html');
      if (!existsSync(target) && !existsSync(join(DIST, p + '.html'))) missing.push(`${f} -> ${p}`);
    }
  }
  assert.deepEqual(missing, []);
});
test('全ページの<img>に alt がある', () => {
  for (const f of walk(DIST)) {
    const h = readFileSync(f, 'utf8');
    const imgs = h.match(/<img [^>]*>/g) || [];
    for (const tag of imgs) assert.match(tag, /alt="/, `${f}: ${tag}`);
  }
});
test('sitemap が生成される', () => { assert.ok(existsSync(join(DIST, 'sitemap-index.xml'))); });
```
Run: `npm run build && npm test` → すべて PASS（失敗した箇所は該当ページを直す）

- [ ] **Step 2: Lighthouse（モバイル）**

```bash
npm run build && npx astro preview --port 4321 &
sleep 4
npx lighthouse http://localhost:4321/ --preset=perf --form-factor=mobile --screenEmulation.mobile --only-categories=performance,accessibility --output=json --output-path=./lh.json --chrome-flags="--headless --no-sandbox" --quiet
node -e "const r=require('./lh.json').categories;console.log('perf',r.performance.score*100,'a11y',r.accessibility.score*100)"
kill %1; rm lh.json
```
Expected: 両方 90 以上。下回る場合は画像サイズ・フォント読み込み（`display=swap` 済み）・コントラストを直す。WSLにChromeが無い場合はこのステップをスキップし、README「未確定」に「Lighthouse 未計測（Windows側Chromeで計測）」と記録する。

- [ ] **Step 3: README に「未確定・中山確認」一覧を追記**

```markdown
## 未確定・中山確認（spec §11）
- [ ] プライバシーポリシー・利用規約の文面（受領後 noindex を外す）
- [ ] フッタの運営会社表記・サプリサイトURL
- [ ] FAQ 3（対象年齢）・7（データ）の表現
- [ ] /evidence の出典（書誌確認）・法務チェック（薬機法・景表法）
- [ ] 大学共同研究の記述可否（現状「準備中」）
- [ ] Lighthouse 実測値
```

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "test: 内部リンク・alt・sitemap検査とREADME未確定一覧"
```

---

### Task 10: GitHub へ push と Cloudflare Pages 連携（人の操作を含む）

**Files:**
- Modify: `README.md`（Cloudflare初期設定手順）、`src/layouts/Base.astro`（Web Analyticsタグ）

- [ ] **Step 1: GitHub リポジトリ作成（中山が画面で実施。AIは手順提示のみ）**

1. https://github.com/new → Repository name `mietore-site`、Private、README等は追加しない → Create
2. 表示された SSH/HTTPS URL を控える

- [ ] **Step 2: push**

```bash
git remote add origin <GitHubのURL>
git push -u origin main
```
HTTPS の場合は Personal Access Token（repo権限）が求められる。SSH鍵を使う場合は `ssh-keygen -t ed25519` → GitHub Settings → SSH keys に登録。

- [ ] **Step 3: Cloudflare Pages プロジェクト作成（中山が画面で実施）**

Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git → GitHub 認可 → `mietore-site` を選択
- Project name: `mietore-site`
- Production branch: `main`
- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `NODE_VERSION` = `24`
→ Save and Deploy。数分で `https://mietore-site.pages.dev` が発行される（名前が取られていれば別名になる。その場合 `astro.config.mjs` の `site` と `public/robots.txt` の Sitemap 行を発行されたURLに合わせて修正し push）。

- [ ] **Step 4: Web Analytics（中山が画面で実施 → AIがタグを入れる）**

Cloudflare → Analytics & Logs → Web Analytics → Add a site → ホスト名 `mietore-site.pages.dev` → 発行された `<script ... data-cf-beacon='{"token": "..."}'>` の token を控える。
`src/layouts/Base.astro` のコメント行を以下に置き換える（TOKEN を実値に）:
```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "TOKEN"}'></script>
```
```bash
npm run verify && git add -A && git commit -m "feat: Cloudflare Web Analytics タグ" && git push
```

- [ ] **Step 5: 本番URLで検証**

```bash
curl -sI https://mietore-site.pages.dev/ | head -1
curl -sI -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" https://mietore-site.pages.dev/app | grep -i location
curl -sI -A "Mozilla/5.0 (Linux; Android 14)" https://mietore-site.pages.dev/app | grep -i location
curl -sI https://mietore-site.pages.dev/app | grep -i location
curl -s https://mietore-site.pages.dev/sitemap-index.xml | head -3
```
Expected: 200 / App Store / Google Play / /download / sitemap XML。中山が iPhone・Android 実機でトップ→DLボタン→ストア遷移を確認。Web Analytics にPVが出ることを翌日確認。

- [ ] **Step 6: プレビューの流れを1回体験（学習）**

```bash
git checkout -b preview-test
# 例: src/pages/faq.astro の1問の文末に句点を足す等の小変更
git commit -am "chore: プレビュー確認用の小変更"
git push -u origin preview-test
```
Cloudflare Pages の Deployments に `preview-test` のプレビューURLが出る → 確認 → GitHub で PR 作成→ main にマージ → 本番更新を確認。

- [ ] **Step 7: README 追記・コミット**

README 末尾に「Cloudflare初期設定」として Step 3・4 の手順をそのまま記載し、`git commit -m "docs: Cloudflare初期設定手順" && git push`。

---

### Task 11: EC側との接続（ecommerce-project 側・本リポジトリ外）

**Files:**
- Create: `$EC/20_実行/ミエトレサイト/README.md`
- Create: `$EC/state/decisions/DEC-EC-20260821-001-official-site-as-landing.md`（既存Decisionの書式に倣う。`ls $EC/state/decisions/` で最新ファイルを1つ読み、frontmatter・見出し構成を合わせる）
- Modify: `$EC/00_戦略/EC_STRATEGY.md` §4「3つの層で市場シェア4%を取りに行く」の表の直後に1段落追記

- [ ] **Step 1: ポインタREADME**

```markdown
# ミエトレ公式サイト（mietore.site）

本体は別プロジェクト: `/home/nakayama/work/il/projects/mietore-site/`（GitHub `mietore-site`・Cloudflare Pages）。
役割: 「買って取る」「信頼で取る」両層の共通受け口（指名検索の着地点・信頼の置き場・DL分岐点）。
根拠: `../../00_戦略/公式サイト受け口_考察メモ_20260821.md`、Decision: `../../state/decisions/DEC-EC-20260821-001-official-site-as-landing.md`
公開URL: https://mietore-site.pages.dev（ドメイン取得後 https://mietore.site）
```

- [ ] **Step 2: Decision 起案（status: proposed）**

内容: 決定事項（公式サイトを受け口として戦略に追加／`il/projects/mietore-site/` として制作／初版スコープB／Cloudflare Pages＋GitHub／法務=中山）、根拠（考察メモ§2-5）、影響（EC_STRATEGY §4追記・数値化は分析Capability）、未決（ドメイン取得時期・GA4要否）。

- [ ] **Step 3: EC_STRATEGY.md §4 追記（`[提案]` ラベル）**

表「3つの層」の直後（「土台は0811資料…」の段落の前）に追加:
```markdown
**受け口【提案・2026-08-21】**: 「買って取る」「信頼で取る」の両層は、見た人の一部が「ミエトレ」で検索する行動を生む。
その共通の着地点として公式サイト（mietore.site）を置く。指名検索の受け口・信頼（ガボールパッチの外部エビデンス、大学共同研究）の置き場・DL分岐点の3役。
考察: `公式サイト受け口_考察メモ_20260821.md`、Decision: `../state/decisions/DEC-EC-20260821-001-official-site-as-landing.md`（起案中）。
```

- [ ] **Step 4: 検証**

`$EC` に `tools/validate_repo.sh` があれば実行し、リンク実在チェックを通す。`$EC` の git 操作（commit）は中山の運用（LOCAL_GIT.md）に従い、AIは変更を報告するのみ。

- [ ] **Step 5: 掲示板更新**

`/home/nakayama/work/agent-status/mietore-site-strategy.md` を「レビュー待ち」に更新（進捗: 初版公開 pages.dev・EC側接続3点作成、判断してほしい点: Decision承認・法務チェック・未確定一覧）。

---

## 自己レビュー結果

- spec §1 役割3つ → Task 4（受け口FV）・Task 7（信頼の置き場 evidence）・Task 3（DL分岐 /app・/download）
- spec §3 13ルート → Task 4 `/`、Task 3 `/download` `/app`、Task 5 `/play` `/play/game`、Task 6 `/play/xp-league` `/play/streak`、Task 7 `/play/fukuta` `/evidence` `/faq`、Task 8 `/news` `/privacy` `/terms` `/404`
- spec §5 Function仕様 → Task 3
- spec §6 デプロイフロー・Cloudflare初期設定 → Task 10
- spec §7 エラー処理（404・/download） → Task 8・Task 3
- spec §8 DoD（build/check/リンク/実機/Lighthouse/Analytics/alt/OGP/sitemap） → Task 9・Task 10・Task 2（OGP）・Task 1（sitemap）
- spec §9 公開ゲート（法務） → README未確定一覧（Task 9）・Task 11 掲示板
- spec §10 EC側接続 → Task 11
- spec §11 未確定 → Task 9 README
- 型整合: `DownloadButton {src,label?}`、`FukutaSay {img,side?}`、`Card {href,title}`、`Base {title,description,noindex?}`、`storeUrlFor(ua)` を全タスクで同名使用
