# /mm メルマガ即スタート版設置（計測=D1） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メルマガ施策のA/B版ページを mietore-site の `/mm/`・`/mm/b/` に設置し、PHP計測（track.php/stats.php）を Cloudflare Pages Functions + D1 に1:1移植する。

**Architecture:** 静的HTML（A版=`public/mm/index.html`、B版=`public/mm/b/`）＋ `functions/mm/track.ts`（受信→D1 INSERT→204）＋ `functions/mm/stats.ts`（全行SELECT→メモリ集計→HTML/CSV）。バリデーションと集計は `src/lib/mm/` の純関数に切り出し `node --test` で検証する。

**Tech Stack:** Astro 7.2.4（既存・ビルドは触らない）、Cloudflare Pages Functions、D1（SQLite）、wrangler 4（ログイン済み・Account ID b44bf64e390cfad29385f33831dff84f）、node:test

**Spec:** `docs/superpowers/specs/2026-08-21-mm-mailmag-handoff.md`

## Global Constraints

- プロジェクトルート: `/home/nakayama/work/il/projects/mietore-site/`。`npm run verify` = `astro check`＋`astro build`＋`node --test`（既存24テスト、常に全通過を維持）
- 素材の正本（読むだけ・編集禁止）: `$SRC=/home/nakayama/work/il/projects/ecommerce-project/20_実行/新規獲得/メルマガ即スタート版_20260818`（index.html=A版 257KB、index_b.html=B版 636B、mietore-popup_mailmag.js 139KB、php/track.php 100行、php/stats.php 440行、README.md）
- ページの見た目・会話・ゲームロジックは変更しない。変更するのは (1) `TRACK_URL` (2) noindex メタ (3) ふく多画像3点のURL のみ
- 許可イベント11種: `page_view, popup_view, anime_end, play_start, stage_clear, all_clear, cta_search, cta_ios, cta_android, replay, popup_close`。`anime_end` の param は `complete|skip_talk|skip_bridge` のみ
- ua_family 6種: `tiktok, line, instagram, facebook, wv, browser`（不一致は `browser`）
- 長さ上限: param=64（`lp_click` のみ150）、url=500、その他（ts/sid/event/os/v）=64。CSVインジェクション対策: 先頭 `=+-@` に `'` 付与→再度上限で切る
- 列は9つ固定: `received_at, ts, sid, event, param, url, os, v, ua_family`。`received_at` は **JST** の ISO 文字列（`YYYY-MM-DDTHH:mm:ss+09:00`）
- STATS_KEY はコードに埋めない。`context.env.STATS_KEY` で参照（本番=Pages環境変数、ローカル=`.dev.vars`。`.dev.vars` は .gitignore 済みであること）
- D1 binding 名は `DB`。DB名は `mietore-mm`
- コミットは各タスク末尾。`git add` は対象ファイル個別指定（`-A` 禁止）
- ドキュメント・コメントは通常の日本語

## ファイル構成（最終形・追加分）

```
public/mm/index.html               A版（$SRC/index.html のコピー＋3点パッチ）
public/mm/b/index.html             B版（$SRC/index_b.html のコピー＋パッチ）
public/mm/b/mietore-popup_mailmag.js  B版JS（$SRC からコピー＋パッチ）
public/images/mm/fukuta_fire.png / fukuta_hund.png / fukuta_professor.png
functions/mm/track.ts              POST受信→検証→D1 INSERT→204
functions/mm/stats.ts              key認証→全行SELECT→aggregate→HTML/CSV
src/lib/mm/validate.ts             純関数: sanitizeEvent(payload, uaFamilyRaw)
src/lib/mm/aggregate.ts            純関数: aggregate(rows) → ①〜⑪の集計構造
src/lib/mm/render.ts               aggregate結果→HTML文字列（stats.phpのテンプレ移植）
tests/mm-validate.test.mjs / tests/mm-aggregate.test.mjs
schema/mm.sql                      D1テーブルDDL
wrangler.toml                      d1_databases binding
.dev.vars.example                  STATS_KEY=<キーをここに>（実値は書かない）
```

---

### Task 1: D1 セットアップと validate.ts（純関数＋テスト）

**Files:**
- Create: `schema/mm.sql`, `wrangler.toml`, `.dev.vars.example`, `src/lib/mm/validate.ts`, `tests/mm-validate.test.mjs`
- Modify: `.gitignore`（`.dev.vars` 追記）

**Interfaces:**
- Produces: `validateAndClean(payload: unknown): CleanRow | null`（CleanRow = `{ts,sid,event,param,url,os,v,ua_family}` 全て string。null=拒否=204で捨てる）。`export const ALLOWED_EVENTS: string[]`

- [ ] **Step 1: D1 データベース作成（wrangler・ログイン済み）**

```bash
cd /home/nakayama/work/il/projects/mietore-site
npx wrangler d1 create mietore-mm
```
出力の `database_id` を控える。`schema/mm.sql`:
```sql
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  ts TEXT, sid TEXT, event TEXT NOT NULL, param TEXT,
  url TEXT, os TEXT, v TEXT, ua_family TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
```
`wrangler.toml`（`<database_id>` は実値に置換）:
```toml
name = "mietore-site"
compatibility_date = "2026-08-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "mietore-mm"
database_id = "<database_id>"
```
適用（リモート本番とローカル両方）:
```bash
npx wrangler d1 execute mietore-mm --remote --file=schema/mm.sql
npx wrangler d1 execute mietore-mm --local --file=schema/mm.sql
```
`.dev.vars.example` を作成（内容: `STATS_KEY=ここに実キーを書く`）。`.gitignore` に `.dev.vars` を追記。ローカル用 `.dev.vars` を作り `STATS_KEY=<STATS_KEY>`（$SRC/php/stats.php:11 の値）を書く（コミットしない）。

- [ ] **Step 2: 失敗するテスト（tests/mm-validate.test.mjs）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndClean } from '../src/lib/mm/validate.ts';

const base = { ts:'2026-08-24T10:00:00+09:00', sid:'s1', event:'page_view', param:'', url:'https://mietore-site.pages.dev/mm/?mm=01', os:'iOS', v:'mailmag-1.0.0', ua_family:'line' };

test('正常イベントは9列相当のCleanRowになる', () => {
  const r = validateAndClean(base);
  assert.equal(r.event, 'page_view'); assert.equal(r.ua_family, 'line'); assert.equal(r.sid, 's1');
});
test('未知イベントは null', () => { assert.equal(validateAndClean({ ...base, event:'hack' }), null); });
test('anime_end は param 3種のみ', () => {
  assert.equal(validateAndClean({ ...base, event:'anime_end', param:'complete' })?.event, 'anime_end');
  assert.equal(validateAndClean({ ...base, event:'anime_end', param:'oops' }), null);
});
test('ua_family 不正は browser に正規化', () => { assert.equal(validateAndClean({ ...base, ua_family:'opera' }).ua_family, 'browser'); });
test('CSVインジェクション: 先頭=は quote 付与', () => { assert.equal(validateAndClean({ ...base, param:'=SUM(A1)' }).param, "'=SUM(A1"[0]+"=SUM(A1".slice(0,63)) || true; });
test('CSVインジェクション実値', () => { assert.equal(validateAndClean({ ...base, param:'=SUM(A1)' }).param, "'=SUM(A1)"); });
test('param 64文字切り詰め・url 500・lp_clickは150', () => {
  assert.equal(validateAndClean({ ...base, param:'a'.repeat(100) }).param.length, 64);
  assert.equal(validateAndClean({ ...base, url:'u'.repeat(600) }).url.length, 500);
});
test('改行はスペースに置換', () => { assert.equal(validateAndClean({ ...base, param:"a\r\nb" }).param, 'a  b'); });
test('payloadが配列/文字列なら null', () => { assert.equal(validateAndClean('x'), null); assert.equal(validateAndClean(null), null); });
```
（5つ目のテストは実値テストと重複するので削除してよい — 6つ目「CSVインジェクション実値」を正とする）

Run: `node --test tests/mm-validate.test.mjs` → FAIL（module not found）

- [ ] **Step 3: 実装（src/lib/mm/validate.ts）— $SRC/php/track.php の1:1移植**

```ts
export const ALLOWED_EVENTS = [
  'page_view','popup_view','anime_end','play_start','stage_clear','all_clear',
  'cta_search','cta_ios','cta_android','replay','popup_close',
];
const ALLOWED_ANIME_END = ['complete','skip_talk','skip_bridge'];
const ALLOWED_UA = ['tiktok','line','instagram','facebook','wv','browser'];

export interface CleanRow { ts:string; sid:string; event:string; param:string; url:string; os:string; v:string; ua_family:string }

function clean(value: unknown, maxLen: number): string {
  let s = (typeof value === 'string' || typeof value === 'number') ? String(value) : '';
  s = s.replace(/[\r\n]/g, ' ');
  s = s.slice(0, maxLen);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, maxLen);
}

export function validateAndClean(payload: unknown): CleanRow | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const event = typeof p.event === 'string' ? p.event : '';
  if (!ALLOWED_EVENTS.includes(event)) return null;
  if (event === 'anime_end') {
    const ap = typeof p.param === 'string' ? p.param : '';
    if (!ALLOWED_ANIME_END.includes(ap)) return null;
  }
  let ua = typeof p.ua_family === 'string' ? p.ua_family : '';
  if (!ALLOWED_UA.includes(ua)) ua = 'browser';
  const paramMaxLen = event === 'lp_click' ? 150 : 64; // track.php準拠（lp_clickは許可外だが式を維持）
  return {
    ts: clean(p.ts, 64), sid: clean(p.sid, 64), event: clean(event, 64),
    param: clean(p.param, paramMaxLen), url: clean(p.url, 500),
    os: clean(p.os, 64), v: clean(p.v, 64), ua_family: ua,
  };
}
```

- [ ] **Step 4: テスト合格確認** — Run: `node --test tests/mm-validate.test.mjs` → 全PASS。`npm run verify` も全通過（既存24＋新規）
- [ ] **Step 5: Commit**
```bash
git add schema/mm.sql wrangler.toml .dev.vars.example .gitignore src/lib/mm/validate.ts tests/mm-validate.test.mjs
git commit -m "feat: /mm 計測基盤（D1スキーマ・wrangler設定・バリデーション純関数）"
```

---

### Task 2: functions/mm/track.ts（受信エンドポイント）

**Files:**
- Create: `functions/mm/track.ts`
- Test: 手動（wrangler pages dev + curl。純関数部は Task 1 で検証済みのため自動テストなし）

**Interfaces:**
- Consumes: `validateAndClean` from `../../src/lib/mm/validate`
- Produces: `POST /mm/track` → 常に 204（不正でも204＝PHP版と同じ）。D1 `events` に1行 INSERT。`received_at` は JST

- [ ] **Step 1: 実装**

```ts
import { validateAndClean } from '../../src/lib/mm/validate';

interface Env { DB: D1Database }

function jstNow(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown = null;
  try { payload = await request.json(); } catch { /* 不正JSONは捨てる */ }
  const row = payload ? validateAndClean(payload) : null;
  if (row) {
    try {
      await env.DB.prepare(
        'INSERT INTO events (received_at, ts, sid, event, param, url, os, v, ua_family) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)'
      ).bind(jstNow(), row.ts, row.sid, row.event, row.param, row.url, row.os, row.v, row.ua_family).run();
    } catch { /* 保存失敗でもクライアントには影響させない */ }
  }
  return new Response(null, { status: 204 });
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'POST') return onRequestPost(ctx);
  return new Response(null, { status: 204 }); // GET等は204（track.php準拠）
};
```
注: `onRequest` と `onRequestPost` の二重定義は不可（`onRequest` が優先される）。上記のとおり `onRequest` 1本に集約し、`onRequestPost` は export しない形に直すこと:
```ts
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') return new Response(null, { status: 204 });
  /* 上記POST処理 */
};
```

- [ ] **Step 2: ローカル動作確認（D1ローカル付き）**

```bash
npm run build
npx wrangler pages dev dist --d1=DB=mietore-mm --port 8788 &
sleep 6
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8788/mm/track -H 'Content-Type: application/json' \
  -d '{"ts":"2026-08-24T10:00:00+09:00","sid":"local1","event":"page_view","param":"","url":"http://localhost/mm/","os":"iOS","v":"mailmag-1.0.0","ua_family":"line"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8788/mm/track -d '{"event":"hack"}'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8788/mm/track
kill %1
npx wrangler d1 execute mietore-mm --local --command "SELECT event, sid, ua_family, received_at FROM events"
```
Expected: 204/204/204、SELECT に `page_view/local1/line` の1行のみ（hack は入らない）。`received_at` が `+09:00` 形式。
（`--d1=DB=mietore-mm` の書式が wrangler 4.125 で異なる場合は `npx wrangler pages dev --help` で確認し、wrangler.toml があるので `npx wrangler pages dev dist` だけで binding が効くはず — 効いた方を README に記録）

- [ ] **Step 3: Commit**
```bash
git add functions/mm/track.ts
git commit -m "feat: /mm/track 計測受信Function（検証→D1 INSERT→204）"
```

---

### Task 3: 静的ページ配置（A版・B版・画像）

**Files:**
- Create: `public/mm/index.html`, `public/mm/b/index.html`, `public/mm/b/mietore-popup_mailmag.js`, `public/images/mm/fukuta_fire.png`, `public/images/mm/fukuta_hund.png`, `public/images/mm/fukuta_professor.png`
- Modify: `tests/pages.test.mjs`

- [ ] **Step 1: コピー**

```bash
SRC="/home/nakayama/work/il/projects/ecommerce-project/20_実行/新規獲得/メルマガ即スタート版_20260818"
mkdir -p public/mm/b public/images/mm
cp "$SRC/index.html" public/mm/index.html
cp "$SRC/index_b.html" public/mm/b/index.html
cp "$SRC/mietore-popup_mailmag.js" public/mm/b/mietore-popup_mailmag.js
```
B版 `public/mm/b/index.html` 内の JS 参照（`mietore-popup_mailmag.js` への src）が相対のままか確認し、`/mm/b/mietore-popup_mailmag.js` を指すよう必要なら修正。

- [ ] **Step 2: ふく多画像3点を取得して差し替え**

```bash
for n in fukuta_fire fukuta_hund fukuta_professor; do
  curl -sf "https://fukufuku-honpo.jp/apri/image/$n.png" -o "public/images/mm/$n.png" && ls -la "public/images/mm/$n.png"
done
```
3ファイルとも取得できたら、`public/mm/index.html` と `public/mm/b/mietore-popup_mailmag.js` 内の `https://fukufuku-honpo.jp/apri/image/fukuta_fire.png` 等（プロトコル込みの完全URL・`//` 開始形も grep で確認）を `/images/mm/fukuta_fire.png` 等に置換（sed）。取得できない画像があれば置換せず元URLのまま残し、レポートに記録。

- [ ] **Step 3: TRACK_URL と noindex パッチ**

- `public/mm/index.html` と `public/mm/b/mietore-popup_mailmag.js` の `TRACK_URL: 'track.php'` → `TRACK_URL: '/mm/track'`（出現は各1箇所のはず。grep で確認）
- `public/mm/index.html` と `public/mm/b/index.html` の `<head>` 内に `<meta name="robots" content="noindex">` を追加（既存 `<meta charset...>` の直後）
- 上記以外は一切変更しない

- [ ] **Step 4: テスト追記（tests/pages.test.mjs）**

```js
test('/mm A版: noindex・TRACK_URL・外部画像依存なし', () => {
  const h = html('mm/index.html');
  assert.match(h, /name="robots" content="noindex"/);
  assert.match(h, /TRACK_URL: '\/mm\/track'/);
  assert.doesNotMatch(h, /TRACK_URL: 'track\.php'/);
});
test('/mm B版: noindex・JSにTRACK_URLパッチ', () => {
  assert.match(html('mm/b/index.html'), /name="robots" content="noindex"/);
  const js = readFileSync(join(DIST, 'mm/b/mietore-popup_mailmag.js'), 'utf8');
  assert.match(js, /TRACK_URL: '\/mm\/track'/);
});
```
（画像置換が3点とも成功した場合のみ `assert.doesNotMatch(h, /fukufuku-honpo\.jp/)` を A版・B版JS 両方に追加）

注: 既存の「内部リンク存在」「img alt」テストが `mm/` 配下を走査して落ちる場合、`/mm/` はコピー元忠実優先のため **走査から除外**する（walk で `mm` ディレクトリをスキップ）。除外した旨をテスト内コメントとレポートに明記。

- [ ] **Step 5: 検証とコミット**

Run: `npm run verify` → 全PASS。さらに `npx wrangler pages dev dist` でローカル起動し、ブラウザ確認の代わりに:
```bash
curl -s http://localhost:8788/mm/ | head -5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8788/mm/b/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8788/images/mm/fukuta_fire.png
```
```bash
git add public/mm public/images/mm tests/pages.test.mjs
git commit -m "feat: /mm メルマガ即スタート版A/B配置（noindex・TRACK_URL・画像ローカル化）"
```

---

### Task 4: aggregate.ts（集計純関数・stats.php ①〜⑪の1:1移植）＋テスト

**Files:**
- Create: `src/lib/mm/aggregate.ts`, `tests/mm-aggregate.test.mjs`

**Interfaces:**
- Produces: `aggregate(rows: EventRow[]): Stats`、`mtrRate(num: number, den: number): string`。`EventRow = {received_at,ts,sid,event,param,url,os,v,ua_family}`（全てstring）。`Stats` は下記11セクションのキーを持つ

- [ ] **Step 1: 移植元を読む** — `$SRC/php/stats.php` の 47〜268行（集計ロジック）を Read。各セクションの仕様（本計画の要約）:

| キー | 内容（PHPと同一に） |
|---|---|
| `total` | 全行数 |
| `byDayEvent` | 日付（`ts`先頭10文字、空なら`received_at`）×イベント件数。列は `allEvents = [popup_view, play_start, stage_clear, all_clear, cta_search, cta_ios, cta_android, replay, popup_close]`。日付昇順 |
| `funnel` | `{view, play, clear, cta}` 件数と直前比（cta = cta_search+cta_ios+cta_android 合算） |
| `byUrl` | popup_view/cta_search/cta_ios/cta_android のみ URL別件数。URL昇順 |
| `bySource` | popup_view の param別件数（空→`(なし)`）。昇順 |
| `funnelBySource` | sid→発火元マップ（popup_view の param）を作り、popup_view/play_start/all_clear/cta を発火元別に集計（マップ外 sid は `(不明)`） |
| `byClose` | popup_close の param別件数（空→`(その他)`）＋ `leaveRate = rate(byClose['leave'], closeTotal)` |
| `byOs` / `byOsSource` | popup_view の os別・os×発火元クロス（空→`(なし)`） |
| `byExit` | exit_no_popup の param別件数＋ `noActRate = rate(byExit['no_activation'], viewCount + exitTotal)`（許可外イベントなので常に0件だが移植する） |
| `byUaPopup` / `byUaExit` | popup_view / exit_no_popup の ua_family×param クロス（ua空→`(不明)`、param空→`(なし)`） |
| `lp` | 日別 page_view・日別 popup_view・表示率、`byOsUaScrollSignal`（scroll_up_signal・常に0件）、`byLpClickUrlTop`（lp_click param別上位20・常に0件） |
| `anime` | stats.php 268行以降の⑪を読んで同一ロジックで移植（preview sid 除外を含む） |

`mtrRate(num, den)`: `den <= 0` → `'-'`、それ以外 `(Math.round(num / den * 1000) / 10).toFixed(1) + '%'`（PHP round($x,1) 相当）。

- [ ] **Step 2: 失敗するテスト（tests/mm-aggregate.test.mjs）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, mtrRate } from '../src/lib/mm/aggregate.ts';

const R = (o) => ({ received_at:'2026-08-24T10:00:00+09:00', ts:'2026-08-24T10:00:00+09:00', sid:'s1', event:'page_view', param:'', url:'/mm/', os:'iOS', v:'mailmag-1.0.0', ua_family:'line', ...o });
const rows = [
  R({ event:'page_view', sid:'s1' }),
  R({ event:'popup_view', sid:'s1', param:'mailmag' }),
  R({ event:'popup_view', sid:'s2', param:'', os:'Android', ua_family:'browser' }),
  R({ event:'play_start', sid:'s1' }),
  R({ event:'all_clear', sid:'s1' }),
  R({ event:'cta_ios', sid:'s1' }),
  R({ event:'popup_close', sid:'s2', param:'x' }),
  R({ event:'anime_end', sid:'s1', param:'complete' }),
];

test('mtrRate', () => {
  assert.equal(mtrRate(1, 2), '50.0%'); assert.equal(mtrRate(0, 0), '-'); assert.equal(mtrRate(1, 3), '33.3%');
});
test('funnel: view2 play1 clear1 cta1', () => {
  const s = aggregate(rows);
  assert.equal(s.funnel.view, 2); assert.equal(s.funnel.play, 1);
  assert.equal(s.funnel.clear, 1); assert.equal(s.funnel.cta, 1);
});
test('byDayEvent: 2026-08-24 に popup_view 2', () => {
  assert.equal(aggregate(rows).byDayEvent['2026-08-24'].popup_view, 2);
});
test('bySource: mailmag=1, (なし)=1', () => {
  const s = aggregate(rows);
  assert.equal(s.bySource['mailmag'], 1); assert.equal(s.bySource['(なし)'], 1);
});
test('funnelBySource: mailmag 側に play/clear/cta が付く', () => {
  const f = aggregate(rows).funnelBySource['mailmag'];
  assert.deepEqual(f, { popup_view:1, play_start:1, all_clear:1, cta:1 });
});
test('byClose: x=1', () => { assert.equal(aggregate(rows).byClose['x'], 1); });
test('byOs: iOS=1 Android=1（popup_viewのみ対象）', () => {
  const s = aggregate(rows);
  assert.equal(s.byOs['iOS'], 1); assert.equal(s.byOs['Android'], 1);
});
test('total=8', () => { assert.equal(aggregate(rows).total, 8); });
```
Run: `node --test tests/mm-aggregate.test.mjs` → FAIL

- [ ] **Step 3: 実装** — stats.php のループを TS に忠実移植（キー名は上表）。ソート: PHP `ksort` 相当は `Object.keys().sort()` で出力時に並べる（`sortedEntries(obj)` ヘルパを1つ作って全所で使う）。
- [ ] **Step 4: テスト合格＋`npm run verify` 全通過**
- [ ] **Step 5: Commit**
```bash
git add src/lib/mm/aggregate.ts tests/mm-aggregate.test.mjs
git commit -m "feat: /mm 集計純関数（stats.php ①〜⑪の移植）"
```

---

### Task 5: render.ts と functions/mm/stats.ts（認証・CSV・HTML）

**Files:**
- Create: `src/lib/mm/render.ts`, `functions/mm/stats.ts`

**Interfaces:**
- Consumes: `aggregate`, `mtrRate`（Task 4）
- Produces: `GET /mm/stats?key=<STATS_KEY>` → HTML（①〜⑪の表）。`&export=csv` → 9列CSV（ヘッダ行＋全行、`Content-Disposition: attachment; filename="mm_events.csv"`）。`&month=YYYYMM` → `received_at` がその月の行のみ。key不一致→403 `Forbidden`

- [ ] **Step 1: render.ts** — `renderStatsHtml(stats: Stats, totalLabel: string): string`。$SRC/php/stats.php の 270行以降（HTMLテンプレ）を Read し、`<style>` と表構造（①〜⑪の `<h2>`・`<table>`）をそのまま文字列テンプレートに移植。値の埋め込みは必ず `esc()`（`&<>"'` を実体参照化）を通す。セクション見出し・列名・注記文（「leave比率…」等）は原文のまま。
- [ ] **Step 2: stats.ts**

```ts
import { aggregate } from '../../src/lib/mm/aggregate';
import { renderStatsHtml } from '../../src/lib/mm/render';

interface Env { DB: D1Database; STATS_KEY: string }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const u = new URL(request.url);
  if (!env.STATS_KEY || u.searchParams.get('key') !== env.STATS_KEY) {
    return new Response('Forbidden', { status: 403 });
  }
  const month = u.searchParams.get('month'); // YYYYMM
  let sql = 'SELECT received_at, ts, sid, event, param, url, os, v, ua_family FROM events';
  const binds: string[] = [];
  if (month && /^\d{6}$/.test(month)) {
    sql += ' WHERE received_at LIKE ?1';
    binds.push(`${month.slice(0, 4)}-${month.slice(4)}%`);
  }
  sql += ' ORDER BY received_at';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const rows = results as unknown as import('../../src/lib/mm/aggregate').EventRow[];

  if (u.searchParams.get('export') === 'csv') {
    const headerLine = 'received_at,ts,sid,event,param,url,os,v,ua_family';
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const body = rows.map(r => [r.received_at,r.ts,r.sid,r.event,r.param,r.url,r.os,r.v,r.ua_family].map(q).join(',')).join('\n');
    return new Response(headerLine + '\n' + body + (body ? '\n' : ''), {
      headers: { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': 'attachment; filename="mm_events.csv"' },
    });
  }
  const html = renderStatsHtml(aggregate(rows), String(rows.length));
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
```
（CSVのファイル名は PHP の `exit_events.csv` から `mm_events.csv` に変更 — 施策名に合わせた意図的変更。レポートに記録）

- [ ] **Step 3: ローカルE2E確認**

```bash
npm run build
npx wrangler pages dev dist --port 8788 &
sleep 6
# データ投入（popup_view→play_start→all_clear→cta_ios の1セッション）
for e in '"event":"popup_view","param":"mailmag"' '"event":"play_start"' '"event":"all_clear"' '"event":"cta_ios"'; do
  curl -s -o /dev/null -X POST http://localhost:8788/mm/track -H 'Content-Type: application/json' \
    -d "{\"ts\":\"2026-08-24T11:00:00+09:00\",\"sid\":\"e2e1\",$e,\"url\":\"/mm/\",\"os\":\"iOS\",\"v\":\"mailmag-1.0.0\",\"ua_family\":\"line\"}"
done
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8788/mm/stats"                       # 403
curl -s "http://localhost:8788/mm/stats?key=<STATS_KEY>" | grep -c "ファネル"               # 1
curl -s "http://localhost:8788/mm/stats?key=<STATS_KEY>&export=csv" | head -3               # ヘッダ+行
kill %1
```

- [ ] **Step 4: `npm run verify` 全通過（render/statsはビルド対象外だが astro check が通ること）**
- [ ] **Step 5: Commit**
```bash
git add src/lib/mm/render.ts functions/mm/stats.ts
git commit -m "feat: /mm/stats 集計画面（key認証・month絞り・CSVエクスポート）"
```

---

### Task 6: デプロイ・本番検証・ドキュメント（中山の画面操作を含む）

**Files:**
- Modify: `README.md`
- Modify（EC側・commitは中山）: `$SRC/README.md` の「デプロイ」節、`/home/nakayama/work/agent-status/mietore-site-strategy.md`

- [ ] **Step 1: push** — `git push origin main`（Pages が自動デプロイ）
- [ ] **Step 2: 中山の画面操作（controller が案内・実施待ち）**
  1. Cloudflare → Workers & Pages → `mietore-site` → Settings → **Bindings** → Add → D1 database → Variable name `DB` / Database `mietore-mm` → Save
  2. 同 Settings → **Variables and Secrets** → Add → Type: Secret → Name `STATS_KEY` / Value（PHP版と同じキー） → Save
  3. Deployments → 最新デプロイを **Retry**（binding反映のため）
- [ ] **Step 3: 本番スモークテスト**
```bash
U=https://mietore-site.pages.dev
curl -s -o /dev/null -w '%{http_code}\n' $U/mm/            # 200
curl -s -o /dev/null -w '%{http_code}\n' $U/mm/b/          # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $U/mm/track -H 'Content-Type: application/json' \
  -d '{"ts":"2026-08-24T12:00:00+09:00","sid":"prod-smoke","event":"page_view","param":"","url":"https://mietore-site.pages.dev/mm/?mm=smoke","os":"iOS","v":"mailmag-1.0.0","ua_family":"browser"}'   # 204
curl -s -o /dev/null -w '%{http_code}\n' "$U/mm/stats"     # 403
# key付きは中山がブラウザで確認（keyをシェル履歴に残さないため）: /mm/stats?key=… に prod-smoke の1件が出る
```
確認後、テスト行を削除: `npx wrangler d1 execute mietore-mm --remote --command "DELETE FROM events WHERE sid='prod-smoke'"`
- [ ] **Step 4: README.md に「/mm メルマガ即スタート版」節を追記** — 配置・A/B URL・track/stats のURL仕様（key はREADMEに書かない）・D1名・ローカル確認コマンド・`?mm=` での配信回識別・`?mtr_debug=1` の挙動（既存どおり送信せずconsole出力）
- [ ] **Step 5: EC側ドキュメント（$EC は書き込み許可・commitしない）** — `$SRC/README.md` の「デプロイ」節冒頭に追記: 「2026-08-24: mietore-site（Cloudflare Pages）へ設置。A版=https://mietore-site.pages.dev/mm/ B版=/mm/b/。計測=Cloudflare D1（track.php/stats.php を Functions に移植・本フォルダのPHPは原本として保存）。stats=/mm/stats?key=（キーは従来と同一）」。掲示板 `mietore-site-strategy.md` を更新（進捗=/mm設置完了・判断してほしい点=メルマガ配信リンクへの反映時期・法務チェック）
- [ ] **Step 6: Commit（mietore-site側のみ）**
```bash
git add README.md
git commit -m "docs: /mm 設置手順と運用メモ"
git push origin main
```

---

## 自己レビュー結果

- spec（handoff）全項目→Task対応: 配置/noindex/TRACK_URL=T3、画像ローカル化=T3、track移植=T1+T2、stats移植（①〜⑪・key・csv・month）=T4+T5、D1/binding/STATS_KEY=T1+T6、テスト=T1/T3/T4、EC側README・掲示板=T6、やらないこと（PHP削除・見た目変更・項目追加）=全タスクの制約に反映
- 型整合: `CleanRow`/`EventRow` 9列一致、`validateAndClean`（T1↔T2）、`aggregate`/`mtrRate`/`EventRow`（T4↔T5）、binding `DB`・`STATS_KEY`（T1↔T2↔T5↔T6）
- 意図的変更2点を明記: CSVファイル名 `mm_events.csv`、track の非POSTは204のまま
