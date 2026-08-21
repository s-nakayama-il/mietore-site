import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ドメイン取得後は 'https://mietore.site' に差し替える（spec §2）
export default defineConfig({
  site: 'https://mietore-site.pages.dev',
  output: 'static',
  integrations: [sitemap({ filter: (page) => !/\/(privacy|terms)\/?$/.test(page) })],
});
