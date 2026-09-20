// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Update `site` after attaching a custom domain.
// https://astro.build/config
export default defineConfig({
  site: 'https://vault.shreeshalember.com.np',
  integrations: [react(), mdx(), sitemap()],

  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },

  vite: {
    plugins: [tailwindcss()]
  }
});
