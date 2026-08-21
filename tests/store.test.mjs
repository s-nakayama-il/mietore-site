import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeUrlFor, APP_STORE_URL, PLAY_URL } from '../src/lib/store.ts';

test('iPhone → App Store', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), APP_STORE_URL);
});
test('iPad → App Store', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), APP_STORE_URL);
});
test('Android → Google Play', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), PLAY_URL);
});
test('PC → /download', () => {
  assert.equal(storeUrlFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), '/download');
});
test('UAなし → /download', () => {
  assert.equal(storeUrlFor(null), '/download');
});
