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

// --- 追加テスト（⑪ アニメ指標） ---
// v3d-2. で始まる v のみ対象。popup_view(param!=='preview') の sid 集合が分母。
// anime_end も v3d-2. 必須、かつ popup_view sid 集合に含まれる場合のみ加算。
const animeRows = [
  R({ event:'popup_view', sid:'a1', v:'v3d-2.0.0' }),        // 分母に入る
  R({ event:'popup_view', sid:'a2', v:'v3d-2.1.0' }),        // 分母に入る
  R({ event:'popup_view', sid:'a3', v:'v3d-2.0.0', param:'preview' }), // preview除外
  R({ event:'popup_view', sid:'a4', v:'mailmag-1.0.0' }),    // v3d-2.以外は除外
  R({ event:'anime_end', sid:'a1', param:'complete', v:'v3d-2.0.0' }),
  R({ event:'anime_end', sid:'a2', param:'skip_bridge', v:'v3d-2.1.0' }),
  R({ event:'anime_end', sid:'a3', param:'complete', v:'v3d-2.0.0' }), // preview sidなので無視
  R({ event:'anime_end', sid:'a9', param:'complete', v:'v3d-2.0.0' }), // popup_view未計測sidなので無視
];

test('anime: popup_view件数(分母)は preview除外・v3d-2.のみで2件', () => {
  // a1, a2 のみが対象（a3=preview除外、a4=v3d-2.以外）
  assert.equal(aggregate(animeRows).anime.animePopupCount, 2);
});

test('anime: complete=1 skip_bridge=1、離脱0、ブリッジ到達=2', () => {
  const a = aggregate(animeRows).anime;
  assert.equal(a.animeEndCounts.complete, 1);
  assert.equal(a.animeEndCounts.skip_talk, 0);
  assert.equal(a.animeEndCounts.skip_bridge, 1);
  // animeEndTotal=2, animePopupCount=2 → leave = max(0, 2-2) = 0
  assert.equal(a.animeLeaveCount, 0);
  // bridgeReached = complete(1) + skip_bridge(1) = 2
  assert.equal(a.animeBridgeReached, 2);
});

test('prototype pollution: __proto__ をキーに持つ行が Object.prototype を汚染しない', () => {
  const rows = [
    R({ event:'popup_view', sid:'__proto__', param:'__proto__', ts:'__proto__', os:'__proto__', ua_family:'' }),
    R({ event:'anime_end', sid:'s9', param:'constructor' }),
  ];
  aggregate(rows);
  assert.equal(({}).popup_view, undefined);
  assert.equal(({}).cta, undefined);
  const clean = aggregate([R({ event:'popup_view', sid:'c1', param:'', url:'/clean/' })]);
  assert.equal(clean.byUrl['/clean/'].popup_view, 1);
  assert.equal(Object.keys(clean.byUrl).length, 1);
});
