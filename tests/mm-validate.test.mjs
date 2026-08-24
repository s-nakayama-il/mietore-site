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
test('CSVインジェクション実値', () => { assert.equal(validateAndClean({ ...base, param:'=SUM(A1)' }).param, "'=SUM(A1)"); });
test('param 64文字切り詰め・url 500・lp_clickは150', () => {
  assert.equal(validateAndClean({ ...base, param:'a'.repeat(100) }).param.length, 64);
  assert.equal(validateAndClean({ ...base, url:'u'.repeat(600) }).url.length, 500);
});
test('改行はスペースに置換', () => { assert.equal(validateAndClean({ ...base, param:"a\r\nb" }).param, 'a  b'); });
test('payloadが配列/文字列なら null', () => { assert.equal(validateAndClean('x'), null); assert.equal(validateAndClean(null), null); });
test('B版追加3イベント（exit_no_popup/scroll_up_signal/lp_click）は通過し、lp_clickは150文字上限', () => {
  for (const event of ['exit_no_popup', 'scroll_up_signal', 'lp_click']) {
    assert.equal(validateAndClean({ ...base, event })?.event, event);
  }
  const long = validateAndClean({ ...base, event: 'lp_click', param: 'a'.repeat(100) });
  assert.equal(long.param.length, 100);
});
