import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAndClean } from '../src/lib/mm/validate.ts';

const mtr = readFileSync(new URL('../public/banner/mtr-exit.js', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../public/banner/demo/index.html', import.meta.url), 'utf8');
const h = readFileSync(new URL('../public/banner/check/h.html', import.meta.url), 'utf8');
const lp = readFileSync(new URL('../public/banner/demo/lp7line/index.html', import.meta.url), 'utf8');

test('J は I と同じ絵・4択・行き先で、id と v だけ違う', () => {
  assert.ok(mtr.includes("{ id: 'J', v: 'banner-20261120-J', pre: 'banner_C2_20261023_', dest: 'check_h', cls: 'c2', layers: ['base', 'edge', 'mid'], choices: ['4682', '4687', '9682', '4632'],"));
  assert.ok(mtr.includes("{ id: 'I', v: 'banner-20261116-I', pre: 'banner_C2_20261023_', dest: 'check_h', cls: 'c2', layers: ['base', 'edge', 'mid'], choices: ['4682', '4687', '9682', '4632'],"));
  assert.ok(demo.includes('data-c="I">I</button><button type="button" data-c="J">J</button>'));
  assert.match(mtr, /location\.href = destUrl\(\) \+ '&a=' \+ encodeURIComponent\(a\)/);
});

test('J の結果のボタンは 7日チャレンジ LP の LINE の版へ進み、cta_lp7 を送る', () => {
  assert.ok(h.includes("const LP7_URL='/banner/demo/lp7line/';"));
  assert.ok(h.includes("const IS_J=VER==='banner-20261120-J';"));
  assert.ok(h.includes("href=\"'+LP7_URL+'?from=J&b='+encodeURIComponent(SID)+'\">7日チャレンジに参加する<small>7日チャレンジのページが開きます</small></a>"));
  assert.ok(h.includes("f.innerHTML=IS_J?lp7():stores();"));
  assert.ok(h.includes("IS_J?track('cta_lp7','o='+(r2?1:0)+(r3?1:0)):track('cta_store','os='+a.dataset.os+';o='+(r2?1:0)+(r3?1:0))"));
});

test('受け口は cta_lp7 を通す', () => {
  const ev = validateAndClean({ ts: new Date().toISOString(), sid: '12345678', event: 'cta_lp7', param: 'o=10', v: 'banner-20261120-J' });
  assert.ok(ev);
  assert.equal(ev.event, 'cta_lp7');
});

test('LP の LINE の版は from・b を lp_view に付ける', () => {
  assert.ok(lp.includes("if(/^[A-Za-z0-9]{1,8}$/.test(f))r.push('from='+f);if(/^\\d{8}$/.test(b))r.push('b='+b);"));
  assert.ok(lp.includes("track('lp_view',FROM);"));
});
