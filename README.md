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
- **Cloudflare Workers** — static hosting + CI/CD

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

Documents live in the public `academic` storage bucket (50 MB per file).
Allowed types: **PDF** and **DOCX**. Metadata is stored in
`public.academic_resources` with RLS enabled: anonymous read-only, writes only
via the service role.

Upload a document and register its metadata:

```sh
pnpm upload ./papers/ds-final-2024.pdf \
  --title "Data Structures Final 2024" \
  --category past-paper --course "CS201" --year 2024 --semester 4 --tags math,final
```

`--semester` drives the semester grouping on `/academic/`; a `sem-N` tag is
added automatically. The resource appears immediately with client-side search,
semester/category/year filters, and a preview in a modal: PDFs via react-pdf,
DOCX via the Microsoft Office viewer. Files are uploaded as-is — no
compression is applied.

> DOCX previews are rendered by Microsoft's online viewer, which fetches the
> file from its public Supabase URL. The PDF path never leaves the browser.

## Semester projects

Project write-ups live in `src/content/projects/*.mdx`. Alongside the usual
title/description/tags, each entry can carry:

```yaml
semester: 6
year: 2024
yearBs: 2081
status: archived # coursework | maintained | archived
tech: [Next.js, PostgreSQL, Drizzle ORM]
links:
  - { label: repo, href: "https://github.com/...", kind: repo }
  - { label: live, href: "https://...", kind: demo }
reports:
  - { label: "Final report (PDF)", path: "project-pdf/2024/report.pdf", kind: pdf, role: report }
heroImage: "./project/home.png"
gallery:
  - { src: "./project/class-diagram.png", caption: "Class diagram" }
```

Report files use the same Supabase `academic` bucket as past papers, stored under
`project-pdf/<year>/<file>`. On the project page they are grouped by `role`
(`report`, `source`, `proposal`, `presentation`, `guideline`) with open/download
buttons. They are **not** listed under `/academic/`, which stays past-papers only;
university course guidelines are attached to the project they belong to.

```sh
pnpm upload ./report.pdf --category project-pdf --year 2024 --semester 6 \
  --title "Artisan Nepal — Final Report" --tags "project,final-report"
```

Every project page renders a fixed disclaimer (defined in `src/lib/projects.ts`):
the report is the version submitted for coursework and was not revised after the
external evaluation.

## Search engine optimization (SEO)

The archive is built to be indexed:

- **Build-time rendering.** `/academic/` fetches the papers at build time and
  server-renders the full list into the HTML (`client:load` island hydrates on
  top). Crawlers see every paper title/course/year without running JavaScript.
  `src/lib/academic.ts` does the fetch and degrades to an empty list if
  Supabase is unreachable, so the build never fails.
- **One page per paper.** `/academic/<slug>/` (e.g. `/academic/cacs251/`) with a
  keyworded `<title>` ("Operating System Past Question Paper 2023 — BCA 4th
  Semester (CACS251) | Tribhuvan University"), meta description, and internal
  links to sibling papers.
- **Structured data.** JSON-LD `ItemList` on the index and `LearningResource` +
  `BreadcrumbList` per paper, plus canonical URLs and Open Graph tags
  (`BaseLayout`).
- **Sitemap.** `@astrojs/sitemap` includes every generated paper page in
  `/sitemap-index.xml`; `robots.txt` points at it.

### Important: rebuild after uploading

New uploads appear immediately in the UI (the island queries Supabase live), but
the **static HTML and per-paper pages only update on the next build/deploy**.
Push any commit (or trigger a redeploy) to regenerate them for crawlers.

### OCR the scans

The papers are scanned images with no text, so searches can't match their
contents. OCR fills `academic_resources.content_text`, which each paper page
renders as a "Paper text" section:

```sh
sudo apt-get install -y tesseract-ocr ghostscript
pnpm ocr                 # skips papers that already have text
pnpm ocr --force         # redo all
pnpm ocr --limit 5       # try a few first
```

Then rebuild/redeploy so the text lands in the HTML.

Status: all 23 BCA papers are OCR'd (1.3k–5.2k chars each); their text is
rendered in the "Paper text" section of each paper page. Re-run `pnpm ocr`
after uploading new scans, then redeploy.

### Google Search Console

1. Add a property for `vault.shreeshalember.com.np` (Domain property; verify with
   the DNS TXT record Cloudflare adds).
2. Submit `https://vault.shreeshalember.com.np/sitemap-index.xml`.
3. Use **URL Inspection → Request indexing** on your most important pages.
4. Check **Pages** for indexing status and **Enhancements** for rich-result
   errors.

Reality check: expect long-tail queries ("BCA 4th semester operating system
question paper 2023") to rank first, not broad ones ("BCA past question paper"),
which established sites own. Ranking takes weeks-to-months and depends heavily
on backlinks — nothing here can guarantee position #1.

## Blog images

Posts support images three ways:

- **Inline, optimized** — store the file next to the post in `src/content/blog/`
  and use `![alt](./image.png)`.
- **`public/` or remote** — `![alt](/images/x.png)` or a full URL (served
  as-is, not optimized).
- **MDX** — `import { Image } from "astro:assets"` plus an image import for
  full control.

Optional frontmatter hero image (renders on the post and as the `/blogs/`
thumbnail):

```yaml
heroImage: "./cover.png"
heroImageAlt: "Cover description"
```

Optimization runs through `sharp` at build time (emits `.webp`).

## Importing posts from Medium

Posts live in `src/content/blog/<slug>.md`, with their images in a matching
folder. A curated set was imported from a Medium data export (Settings → **Export
your information**):

```sh
pnpm import:medium                 # uses ../../Medium Blog by default
pnpm import:medium -- --export ./somewhere --force
```

`scripts/import-medium.mjs` reads the export HTML, converts the body to Markdown
(turndown + GFM), keeps fenced code languages, **downloads every image** into the
content folder, drops Medium member CTAs, and rewrites links between imported
posts to their vault URLs. Existing targets are skipped unless `--force` is
passed. Post selection (slug, tags, Medium id) is the `POSTS` array at the top of
the script.

Imported posts carry `sourceUrl` and render an "originally published on Medium"
line; canonical stays on the vault URL, so the vault copy is the indexed one. See
[`MEDIUM-IMPORT-PLAN.md`](../MEDIUM-IMPORT-PLAN.md) for the selection and
rationale.

## Deployment (Cloudflare)

Static output — **no Astro adapter needed**. `wrangler.jsonc` declares the
`./dist` folder as static assets, so Wrangler does not auto-configure the
`@astrojs/cloudflare` adapter (which is only for SSR).

### Workers Builds (Git integration)

In the Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect
to Git**:

- Build command: `pnpm build`
- Deploy command: `npx wrangler deploy` (the default), or `pnpm deploy`
- **Build variables and secrets** (**Settings → Build**):
  - `PUBLIC_SUPABASE_URL` = `https://bunlkimihykrtxitgwmg.supabase.co`
  - `PUBLIC_SUPABASE_ANON_KEY` = your `sb_publishable_...` key

  Astro inlines `PUBLIC_*` at build time, so these must be *build* variables,
  not runtime ones. A Worker with only static assets cannot have runtime
  variables at all — and does not need them, since the site reads nothing at
  runtime except the compiled-in values.

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
