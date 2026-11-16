import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mtr = readFileSync(new URL('../public/banner/mtr-exit.js', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../public/banner/demo/index.html', import.meta.url), 'utf8');

test('I は C2 の見た目と4択を使い、H のチェックページへ進む', () => {
  assert.ok(mtr.includes("id: 'I', v: 'banner-20261116-I', pre: 'banner_C2_20261023_', dest: 'check_h', cls: 'c2', layers: ['base', 'edge', 'mid'], choices: ['4682', '4687', '9682', '4632']"));
  assert.ok(mtr.includes("CHECK_H: ORIGIN + '/banner/check/h'"));
  assert.ok(demo.includes('data-c="I"'));
});

test('4択は v・行き先・答えを遷移先と記録へ渡す', () => {
  assert.match(mtr, /track\('banner_tap', CRE\.dest \+ ';a=' \+ a\)/);
  assert.match(mtr, /location\.href = destUrl\(\) \+ '&a=' \+ encodeURIComponent\(a\)/);
  assert.match(mtr, /'\?sid=' \+ encodeURIComponent\(sid\(\)\) \+ '&v=' \+ encodeURIComponent\(CRE\.v\)/);
});
