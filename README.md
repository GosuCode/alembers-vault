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
