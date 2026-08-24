import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../src/lib/mm/aggregate.ts';
import { renderStatsHtml } from '../src/lib/mm/render.ts';

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
  R({ event:'lp_click', sid:'s3', param:'<script>alert(1)</script>' }),
];

const stats = aggregate(rows);
const html = renderStatsHtml(stats, String(stats.total));

const headings = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪'];

test('11個の見出し(h2)がすべて含まれる', () => {
  for (const mark of headings) {
    assert.match(html, new RegExp(`<h2>${mark}[^<]*</h2>`));
  }
});

test('ファネル件数が表示される', () => {
  assert.match(html, /<td>popup_view<\/td><td>2<\/td>/);
  assert.match(html, /<td>play_start<\/td><td>1<\/td>/);
  assert.match(html, /<td>all_clear<\/td><td>1<\/td>/);
});

test('paramの値はescされ生の<script>タグが出力に含まれない', () => {
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
