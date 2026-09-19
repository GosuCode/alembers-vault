// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Update `site` after connecting a custom domain on Cloudflare Pages.
// https://astro.build/config
export default defineConfig({
  site: 'https://alembers-vault.pages.dev',
  integrations: [react(), mdx(), sitemap()],

  vite: {
    plugins: [tailwindcss()]
  }
});
