import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseActive, parseStopped, toConfigBody,
  CONFIG_HEADERS, CONFIG_SQL, CONFIG_UNAVAILABLE_BODY, CONFIG_METHOD_BODY,
} from '../src/lib/banner/config.ts';

const B = 'banner-20260928-B';
const C = 'banner-20260928-C';

test('parseActive: 正しい JSON の文字列配列はそのまま読む', () => {
  assert.deepEqual(parseActive('[]'), []);
  assert.deepEqual(parseActive(`["${B}"]`), [B]);
  assert.deepEqual(parseActive(`["${B}", "${C}"]`), [B, C]);
  assert.deepEqual(parseActive('[""]'), ['']);
});

test('parseActive: JSON でない・配列でない・文字列でない要素は null', () => {
  for (const bad of ['', 'B', '[', '["B"', '{"a":1}', 'null', '0', '"B"', 'true', '[1]', '[null]', '[["B"]]', '[{"v":"B"}]', `["${B}", 2]`]) {
    assert.equal(parseActive(bad), null, bad);
  }
});

test('parseStopped: 0 と 1 だけを認める', () => {
  assert.equal(parseStopped(0), false);
  assert.equal(parseStopped(1), true);
  for (const bad of [2, -1, '0', '1', 'no', true, false, null, undefined, {}, []]) {
    assert.equal(parseStopped(bad), null, JSON.stringify(bad) ?? String(bad));
  }
});

test('toConfigBody: 正しい1行から応答の形を組む', () => {
  assert.deepEqual(toConfigBody({ stopped: 0, active_vs: `["${B}"]` }), { stopped: false, active: [B] });
  assert.deepEqual(toConfigBody({ stopped: 1, active_vs: '[]' }), { stopped: true, active: [] });
  assert.deepEqual(toConfigBody({ stopped: 0, active_vs: `["${B}","${C}"]` }), { stopped: false, active: [B, C] });
});

test('toConfigBody: JSON のキーの順は stopped → active', () => {
  assert.equal(JSON.stringify(toConfigBody({ stopped: 0, active_vs: `["${B}"]` })), `{"stopped":false,"active":["${B}"]}`);
  assert.equal(JSON.stringify(toConfigBody({ stopped: 1, active_vs: '[]' })), '{"stopped":true,"active":[]}');
});

test('toConfigBody: 行が無い・形が違うときは null（道は 503 を返す）', () => {
  assert.equal(toConfigBody(null), null);
  assert.equal(toConfigBody(undefined), null);
  assert.equal(toConfigBody({ stopped: 0, active_vs: 'B' }), null);          // JSON でない
  assert.equal(toConfigBody({ stopped: 0, active_vs: '{"a":1}' }), null);    // 配列でない
  assert.equal(toConfigBody({ stopped: 0, active_vs: '[1]' }), null);        // 文字列でない要素
  assert.equal(toConfigBody({ stopped: 0, active_vs: null }), null);         // 文字列でない
  assert.equal(toConfigBody({ stopped: 0, active_vs: 1 }), null);
  assert.equal(toConfigBody({ stopped: 'no', active_vs: '[]' }), null);      // stopped が 0・1 でない
  assert.equal(toConfigBody({ stopped: 2, active_vs: '[]' }), null);
  assert.equal(toConfigBody({ stopped: null, active_vs: '[]' }), null);
  assert.equal(toConfigBody({ stopped: undefined, active_vs: undefined }), null);
});

test('応答に付ける3つのヘッダと SQL・本文の定数', () => {
  assert.deepEqual(CONFIG_HEADERS, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  assert.equal(CONFIG_SQL, 'SELECT stopped, active_vs FROM banner_config WHERE id = 1');
  assert.equal(CONFIG_UNAVAILABLE_BODY, '{"error":"config_unavailable"}');
  assert.equal(CONFIG_METHOD_BODY, '{"error":"method_not_allowed"}');
});
