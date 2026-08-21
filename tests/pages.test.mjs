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
