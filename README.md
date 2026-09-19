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
pnpm astro check    # type/content diagnostics
```

## Environment

Copy `.env.example` to `.env` and fill in the Supabase values. Only the
`PUBLIC_`-prefixed keys are exposed to the client; keep the service-role key
server-only (used by `src/pages/api/`).

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
