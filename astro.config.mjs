import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 本番ドメイン（2026-08-25 切替済み）
export default defineConfig({
  site: 'https://mietore.site',
  output: 'static',
  integrations: [sitemap({ filter: (page) => !/\/(privacy|terms)\/?$/.test(page) })],
});
