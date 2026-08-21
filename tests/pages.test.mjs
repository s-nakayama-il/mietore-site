import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
test('/play/xp-league にリーグ3段階と週替わり', () => {
  const h = html('play/xp-league/index.html');
  assert.match(h, /ブロンズリーグ/); assert.match(h, /シルバーリーグ/); assert.match(h, /ゴールドリーグ/);
  assert.match(h, /月曜/);
});
test('/play/streak に連続記録・ライフ・救済措置・クエスト', () => {
  const h = html('play/streak/index.html');
  for (const w of ['連続記録','ライフ','救済措置','クエスト']) assert.match(h, new RegExp(w));
});
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

test('/news 一覧と記事', () => {
  assert.match(html('news/index.html'), /href="\/news\/2026-08-21-site-open"/);
  assert.match(html('news/2026-08-21-site-open/index.html'), /公式サイト/);
});
test('privacy/terms は noindex で仮公開', () => {
  for (const p of ['privacy/index.html','terms/index.html']) assert.match(html(p), /name="robots" content="noindex"/);
});
test('404 ページ', () => { assert.match(html('404.html'), /見つかりません/); });

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
