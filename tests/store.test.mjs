import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeUrlFor, STORE_LINKS } from '../src/lib/store.ts';
const APP_STORE_URL = STORE_LINKS.exit_banner_app.ios;
const PLAY_URL = STORE_LINKS.exit_banner_app.android;

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

// /app?c=<入口の名前>（TASK-I16-20261119-005）
const LP7_IOS = 'https://apps.apple.com/app/apple-store/id6738352362?pt=126888813&ct=lp7_demo&mt=8';
const LP7_PLAY = 'https://play.google.com/store/apps/details?id=com.ilinksnet.gabor&hl=ja&referrer=utm_source%3Dexit_banner%26utm_campaign%3Dlp7_demo';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

test('lp7_demo の行き先は LP /banner/demo/lp7/ のストアのリンクと同じ', () => {
  assert.equal(STORE_LINKS.lp7_demo.ios, LP7_IOS);
  assert.equal(STORE_LINKS.lp7_demo.android, LP7_PLAY);
});
test('c=lp7_demo: iPhone・iPad → App Store（ct=lp7_demo）、Android → Google Play、PC・UAなし → /download', () => {
  assert.equal(storeUrlFor(UA_IPHONE, 'lp7_demo'), LP7_IOS);
  assert.equal(storeUrlFor(UA_IPAD, 'lp7_demo'), LP7_IOS);
  assert.equal(storeUrlFor(UA_ANDROID, 'lp7_demo'), LP7_PLAY);
  assert.equal(storeUrlFor(UA_PC, 'lp7_demo'), '/download');
  assert.equal(storeUrlFor(null, 'lp7_demo'), '/download');
});
test('c なし・表に無い名前・空・記号入り・長すぎる・表にあっても /app で使わない名前 → 今までどおり exit_banner_app', () => {
  for (const entry of [undefined, null, '', 'nope', 'LP7_DEMO', 'lp7_demo ', 'lp7_demo;x', 'https://evil.example/', 'x'.repeat(500), 'exit_banner_app', 'mietore_site_download', '__proto__', 'constructor', 'toString']) {
    assert.equal(storeUrlFor(UA_IPHONE, entry), APP_STORE_URL, String(entry).slice(0, 40));
    assert.equal(storeUrlFor(UA_ANDROID, entry), PLAY_URL, String(entry).slice(0, 40));
    assert.equal(storeUrlFor(UA_PC, entry), '/download');
    assert.equal(storeUrlFor(null, entry), '/download');
  }
});
