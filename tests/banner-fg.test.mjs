import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mtr = readFileSync(new URL('../public/banner/mtr-exit.js', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../public/banner/demo/index.html', import.meta.url), 'utf8');

test('F・G は4層・専用の行き先・fgだけの動きで定義される', () => {
  for (const [id, dest] of [['F', 'check_f'], ['G', 'check_g']]) {
    assert.ok(mtr.includes(`id: '${id}', v: 'banner-20261029-${id}', pre: 'banner_20261029_', dest: '${dest}', cls: 'fg', layers: ['base', 'num', 'up', 'dn']`));
    assert.ok(mtr.includes(`CHECK_${id}: ORIGIN + '/banner/check/${id.toLowerCase()}'`));
    assert.ok(demo.includes(`data-c="${id}"`));
  }
  const fg = mtr.slice(mtr.indexOf('/* F/G only'), mtr.indexOf("var host = null"));
  assert.match(fg, /\.pop\.lyr\.fg \.num/);
  assert.match(fg, /top:29\.77%/);
  assert.match(fg, /left:52\.002%;top:71\.8387%;width:44%/);
  assert.doesNotMatch(fg, /cqw/);
  assert.match(fg, /prefers-reduced-motion:reduce/);
});

for (const mode of ['f', 'g']) {
  test(`${mode.toUpperCase()} は1問目を記録せず、2問の結果とストア導線を記録する`, () => {
    const html = readFileSync(new URL(`../public/banner/check/${mode}.html`, import.meta.url), 'utf8');
    assert.equal((html.match(/track\('check_answer'/g) || []).length, 2);
    assert.doesNotMatch(html, /q=1;/);
    assert.match(html, /track\('check_start','cv=20261029'\)/);
    assert.match(html, /track\('check_result','o='\+\(r2\?1:0\)\+\(r3\?1:0\)\+';cb=20261029'\)/);
    assert.match(html, /track\('cta_seen'/);
    assert.match(html, /track\('cta_store'/);
    assert.match(html, new RegExp(`exit_banner_check_${mode}`));
    assert.match(html, new RegExp(`utm_campaign%3Dcheck_${mode}`));
    assert.doesNotMatch(html, /postMessage|見本：|function banner|cqw/);
  });
}

test('G だけが結果前の見学を記録する', () => {
  const f = readFileSync(new URL('../public/banner/check/f.html', import.meta.url), 'utf8');
  const g = readFileSync(new URL('../public/banner/check/g.html', import.meta.url), 'utf8');
  assert.equal((f.match(/track\('training_view'/g) || []).length, 0);
  assert.equal((g.match(/track\('training_view'/g) || []).length, 1);
  assert.match(f, /const M='f'/);
  assert.match(g, /const M='g'/);
});

test('F・G の◎ボタンは止まらず繰り返し沈み、動きを減らす設定では止まる', () => {
  const fg = mtr.slice(mtr.indexOf('/* F/G only'), mtr.indexOf("var host = null"));
  assert.match(fg, /\.pop\.lyr\.fg \.up\{animation:fgUp 3\.2s steps\(1,end\) 1\.2s infinite\}/);
  assert.match(fg, /\.pop\.lyr\.fg \.dn\{opacity:0;animation:fgDn 3\.2s steps\(1,end\) 1\.2s infinite\}/);
  assert.doesNotMatch(fg, /1\.2s 2 both/);
  assert.match(fg, /prefers-reduced-motion:reduce\)\{[^}]*\}' \+\s*'\.pop\.lyr\.fg \.up,\.pop\.lyr\.fg \.dn\{animation:none\}/);
});

test('F・G の問題の画面は見えている高さ（100dvh）で決め、縦の短い画面だけ詰め、結果のボタンは「ゲームで目をトレーニングッ！」で最初から出す', () => {
  for (const mode of ['f', 'g']) {
    const html = readFileSync(new URL(`../public/banner/check/${mode}.html`, import.meta.url), 'utf8');
    assert.match(html, /body\.q main\{height:calc\(100vh - 96px\);height:calc\(100dvh - 96px\)\}/);
    assert.match(html, /body\.q main\{height:calc\(100vh - 46px\);height:calc\(100dvh - 46px\);/);
    assert.match(html, /'">ゲームで目をトレーニングッ！<small>'/);
    assert.doesNotMatch(html, /無料でお試しする/);
    // 縦の短い画面（640px 以下）だけ、進み具合・札・選択肢を詰め、3問目はお手本を大きくした絵
    assert.match(html, /@media \(max-height:640px\)\{\n \.prog\{height:36px/);
    assert.match(html, /body\.q main\{height:calc\(100vh - 82px\);height:calc\(100dvh - 82px\)/);
    assert.match(html, /function canvas3s\(\)\{/);
    assert.match(html, /matchMedia\('\(max-height:640px\)'\)\.matches\?canvas3s\(\):canvas3\(\)/);
    // G の見学の絵は、進み具合と「略して」の行の分を引いて決める
    assert.match(html, /\.wt \+ \.wh5 ~ \.wfig\{width:min\(100%,330px,calc\(\(100vh - 410px\)/);
    // 結果のボタンは最初から出す（.care を見てから出す作りは無い）
    assert.doesNotMatch(html, /\.foot\.wait|classList\.add\('wait'\)|io\.observe\(care\)/);
    assert.match(html, /querySelector\('\.foot'\),m=/);
    assert.match(html, /const c=f\.querySelector\('a\.go'\);if\(c&&'IntersectionObserver' in window\)\{ctaObserver=/);
    assert.equal((html.match(/track\('cta_seen'/g) || []).length, 1);
  }
});
