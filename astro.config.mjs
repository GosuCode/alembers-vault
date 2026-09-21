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
  integrations: [
    react(),
    mdx(),
    sitemap({ filter: (page) => !page.includes("/admin/") }),
  ],

  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },

  vite: {
    plugins: [tailwindcss()],
    // Dev only: forward /api/* to `pnpm dev:api` (wrangler dev on :8787).
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8787",
      },
    },
  }
});
