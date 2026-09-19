# Alember's Vault

Personal full-stack web archive for tech blogs, academic materials (past papers,
project PDFs), and software project showcases with GitHub integration.

See [`ALEMBERS-VAULT.md`](./ALEMBERS-VAULT.md) for scope, roadmap, and the
free-tier checklist.

## Stack

- **Astro** — content-first, zero JS by default
- **React** — interactive islands only (PDF viewer, search filters)
- **Tailwind CSS** — styling
- **Supabase** — Postgres + file storage buckets (free tier)
- **Vercel / Cloudflare Pages** — hosting + CI/CD

## Commands

```sh
pnpm install
pnpm dev            # dev server at localhost:4321
pnpm build          # production build to ./dist/
pnpm preview        # preview the build
pnpm check          # type/content diagnostics
```

## Environment

Copy `.env.example` to `.env` and fill in the Supabase values. Only the
`PUBLIC_`-prefixed values are exposed to the client; the secret key is
server-only (used by the upload script).

- `PUBLIC_SUPABASE_URL` — `https://bunlkimihykrtxitgwmg.supabase.co`
- `PUBLIC_SUPABASE_ANON_KEY` — publishable key (safe for the browser)
- `SUPABASE_SERVICE_ROLE_KEY` — secret key (server-only, required for uploads)

### Where to get the keys

Dashboard → **Project Settings → API Keys**:
<https://supabase.com/dashboard/project/bunlkimihykrtxitgwmg/settings/api-keys>

1. **Publishable key** — copy the `sb_publishable_...` value into
   `PUBLIC_SUPABASE_ANON_KEY`. Safe to ship to browsers.
2. **Secret key** — click **Create new secret key**, copy the `sb_secret_...`
   value into `SUPABASE_SERVICE_ROLE_KEY`. This bypasses RLS, so it must never
   reach client code or git. (The legacy `service_role` JWT under the
   **Legacy API keys** tab works too, but a secret key is the current
   recommendation.)

`.env` is gitignored. Set the two `PUBLIC_` vars in the hosting dashboard when
deploying; keep the secret key out of hosting env vars unless a server-side
feature actually needs it. If a secret key leaks, revoke it on the same page.

## Academic archive

PDFs live in the public `academic` storage bucket (50 MB per file, PDFs only).
Metadata is stored in `public.academic_resources` with RLS enabled: anonymous
read-only, writes only via the service role.

Upload a PDF and register its metadata:

```sh
pnpm upload ./papers/ds-final-2024.pdf \
  --title "Data Structures Final 2024" \
  --category past-paper --course "CS201" --year 2024 --tags math,final
```

The resource appears on `/academic/` with client-side search, category/year
filters, and an in-browser PDF preview (react-pdf).

## Deployment (Cloudflare)

Static output — **no Astro adapter needed**. `wrangler.jsonc` declares the
`./dist` folder as static assets, so Wrangler does not auto-configure the
`@astrojs/cloudflare` adapter (which is only for SSR).

### Workers Builds (Git integration)

In the Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect
to Git**:

- Build command: `pnpm build`
- Deploy command: `pnpm deploy` (runs `astro build && wrangler deploy`), or
  `npx wrangler deploy` if you left the build step separate
- **Environment variables** (Production and Preview):
  - `PUBLIC_SUPABASE_URL` = `https://bunlkimihykrtxitgwmg.supabase.co`
  - `PUBLIC_SUPABASE_ANON_KEY` = your `sb_publishable_...` key

  Do **not** add `SUPABASE_SERVICE_ROLE_KEY` — the deployed site is read-only
  and never needs it.

`pnpm` is pinned via `packageManager` (`pnpm@10.11.1`) to match the build
image. Commit `pnpm-lock.yaml`; the build runs `pnpm install --frozen-lockfile`.

### Cloudflare Pages (alternative)

Same build (`pnpm build`), output directory `dist`, framework preset Astro.
Do not run `astro add cloudflare` for this static site.

### Notes

- Pushes to `main` redeploy automatically.
- After attaching a custom domain, update `site` in `astro.config.mjs` and the
  `Sitemap:` line in `public/robots.txt`.
- `public/_headers` adds security headers and long-lived caching for hashed
  `/_astro/*` assets. `@astrojs/sitemap` emits `/sitemap-index.xml`.

PDF files are served by Supabase's CDN, not Cloudflare, so hosting bandwidth
stays tiny regardless of download volume. Measured download of a 2 MB PDF:
~0.9 s cold (~2.4 MB/s), ~0.2 s warm. Supabase sends `cache-control: no-cache`
on public objects, so the edge revalidates on each request rather than serving
a long-lived cache hit; the uploader still records `max-age=31536000` as object
metadata for when that is honored. Keep PDFs compressed to stay within the
1 GB free-tier bucket limit.

## Structure

```text
src/
├── components/   # Filter, SearchBar, PDFViewer, ProjectCard (React islands)
├── content/      # Markdown / MDX blog posts
├── layouts/      # BaseLayout, BlogLayout
├── lib/          # Supabase client + utilities
├── pages/
│   ├── index.astro
│   ├── blogs/    # blog list + MDX reader
│   ├── academic/ # filterable PDFs / past papers
│   ├── projects/ # showcases, docs, GitHub links
│   └── api/      # serverless endpoints for file fetch
└── styles/       # global Tailwind entry
```
