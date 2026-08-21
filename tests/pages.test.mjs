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

test('共通ヘッダ・フッタ・DLボタンがトップにある', () => {
  const h = html('index.html');
  assert.match(h, /<header/);
  assert.match(h, /<footer/);
  assert.match(h, /href="\/app\?src=header"/);
  assert.match(h, /診断・治療を目的としたものではありません/);
});

test('トップ: FV・遊び方・あそびかた導線・エビデンス導線・DLボタン', () => {
  const h = html('index.html');
  assert.match(h, /ながめて消すだけ/);
  assert.match(h, /href="\/play"/);
  assert.match(h, /href="\/evidence"/);
  assert.match(h, /href="\/app\?src=top"/);
  assert.match(h, /images\/fukuta-hello\.png/);
});

test('download.html に両ストアのリンク', () => {
  const h = html('download/index.html');
  assert.match(h, /apps\.apple\.com\/jp\/app\/id6738352362/);
  assert.match(h, /play\.google\.com\/store\/apps\/details\?id=com\.ilinksnet\.gabor/);
});

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
