# 次回作業の引き継ぎ: メルマガ即スタート版を mietore.site/mm/ に設置（計測=D1）

- 日付: 2026-08-21（設計のみ中山確認済み・実装は未着手）
- 元資料: `/home/nakayama/work/il/projects/ecommerce-project/20_実行/新規獲得/メルマガ即スタート版_20260818/`（index.html=A版、index_b.html+mietore-popup_mailmag.js=B版、php/track.php、php/stats.php、README.md）

## 合意した設計（要点）
- 配置: `public/mm/index.html`（A）、`public/mm/b/index.html`＋`public/mm/b/mietore-popup_mailmag.js`（B）。両方 noindex。`TRACK_URL` を絶対パス `/mm/track` に変更
- ふく多画像3点（fukuta_fire/hund/professor.png、元は fukufuku-honpo.jp/apri/image/）→ `public/images/mm/` にコピーし参照を差し替え
- `functions/mm/track.ts`: track.php を1:1移植（POSTのみ／許可イベント11種／anime_end param 3種／ua_family 6種／長さ上限 64・150(lp_click)・500(url)／CSVインジェクション対策）→ D1 `events` に INSERT → 204。`received_at` は JST ISO
- `functions/mm/stats.ts`: stats.php を1:1移植（`?key=` 認証・403／`format=csv`／HTML ①〜⑪ 全セクション・空でも出す）。`?month=YYYYMM` 絞り込み（省略=全期間）。全行 SELECT→メモリ集計（PHPと同方式）
- D1: DB `mietore-mm`、テーブル `events(id INTEGER PK, received_at, ts, sid, event, param, url, os, v, ua_family)`＋index(event, received_at)。`wrangler.toml` binding `DB`。ローカル `wrangler pages dev dist --d1=DB`
- STATS_KEY: PHPと同じ値を Pages の環境変数（Secret）に。コードに埋めない
- テスト: バリデーション `src/lib/mm/validate.ts`、集計 `src/lib/mm/aggregate.ts` を純関数化し node --test
- 中山の操作: `npx wrangler login`（ブラウザ）、D1 作成後 Pages → Settings → Bindings に `DB`、環境変数 `STATS_KEY`
- EC側: メルマガ即スタート版 README「デプロイ」節に設置先URL・計測方式・stats URL を追記（中山 commit）
- やらない: 元PHP削除、見た目/会話/ゲーム変更、集計項目追加

## 次回の進め方
1. 本ファイルを spec として brainstorming はスキップ可（合意済み）→ writing-plans で計画 → subagent-driven で実装
2. 先に中山: preview-test の PR マージ（未実施なら）、`npx wrangler login`
