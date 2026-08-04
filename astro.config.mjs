import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  site: 'https://viceprint.pages.dev', // TODO: real domain (spec §10/§11)
  integrations: [react(), tailwind(), sitemap()],
});
