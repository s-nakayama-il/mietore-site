import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mtr = readFileSync(new URL('../public/banner/mtr-exit.js', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../public/banner/demo/index.html', import.meta.url), 'utf8');
const h = readFileSync(new URL('../public/banner/check/h.html', import.meta.url), 'utf8');

test('H は F・G の数字と専用 base、4択、check_h を使う', () => {
  assert.ok(mtr.includes("id: 'H', v: 'banner-20261110-H', pre: 'banner_20261110_', dest: 'check_h', cls: 'h', layers: ['base', 'num'], choices: ['4682', '4687', '9682', '4632']"));
  assert.ok(mtr.includes("CHECK_H: ORIGIN + '/banner/check/h'"));
  assert.ok(mtr.includes("CRE.id === 'H' && name === 'num'"));
  assert.ok(mtr.includes("/banner_20261029_num.webp"));
  assert.ok(demo.includes('data-c="H"'));
  const css = mtr.slice(mtr.indexOf('/* H only'), mtr.indexOf("var host = null"));
  assert.match(css, /\.pop\.lyr\.h \.num/);
  assert.match(css, /top:29\.77%/);
  assert.match(css, /\.pop\.lyr\.h \.opts/);
  assert.match(css, /top:72\.5382%/);
  assert.doesNotMatch(css, /cqw/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('H は a を4桁に整え、1問目を含む3桁の結果を記録する', () => {
  assert.match(h, /const A1=\(QS\.get\('a'\)\|\|''\)\.replace\(\/\[\^0-9\]\/g,''\)\.slice\(0,4\)/);
  assert.match(h, /track\('check_start','cv=20261110;a='\+A1\)/);
  assert.match(h, /track\('check_result','o='\+\(A1\?\(rec\.q1\.ok\?1:0\):'-'\)\+\(r2\?1:0\)\+\(r3\?1:0\)\+';cb=20261110'\)/);
  assert.match(h, /あなたの答え <b>\$\{A1\}<\/b>　→　答え <b class="ok">4682<\/b>/);
  assert.match(h, /banner-20261110-H/);
  assert.match(h, /exit_banner_check_h/);
  assert.match(h, /utm_campaign%3Dcheck_h/);
  assert.equal((h.match(/track\('check_answer'/g) || []).length, 2);
  assert.equal((h.match(/track\('training_view'/g) || []).length, 1);
  assert.equal((h.match(/track\('cta_seen'/g) || []).length, 1);
  assert.equal((h.match(/track\('cta_store'/g) || []).length, 1);
});

for (const mode of ['f', 'g', 'h']) {
  test(`${mode.toUpperCase()} は PC だけストアを2択表示する`, () => {
    const html = readFileSync(new URL(`../public/banner/check/${mode}.html`, import.meta.url), 'utf8');
    assert.match(html, /お使いのスマホを、えらんでください/);
    assert.match(html, /iPhone の方（App Store）/);
    assert.match(html, /Android の方（Google Play）/);
    assert.match(html, /スマホのストアで「ミエトレ」と検索しても見つかります/);
    assert.match(html, /os==='ios'\?store\(IOS,'ios','App Store'\):os==='android'\?store\(AND,'android','Google Play'\)/);
  });
}
