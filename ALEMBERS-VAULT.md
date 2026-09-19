Alember's Vault 🏛️

Alember's Vault is a lightweight, personal full-stack web archive for tech blogs, academic materials (past question papers, project PDFs), and software project showcases with GitHub integrations.

🛠️ Tech Stack

Frontend Framework: Astro (Content-first, Zero JS by default)

Interactive UI: React components (for PDF viewer & search filters)

Styling: Tailwind CSS

Database & Storage: Supabase Free Tier (PostgreSQL + File Storage Buckets)

Hosting & CI/CD: Vercel or Cloudflare Pages (Free tier)

Version Control: GitHub (alember-vault)

📁 Repository Structure

alembers-vault/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/       # Filter, SearchBar, PDFViewer, ProjectCard
│   ├── content/          # Markdown/MDX Blog posts
│   ├── layouts/          # BaseLayout, BlogLayout
│   ├── pages/
│   │   ├── index.astro   # Hero + Latest updates
│   │   ├── blogs/        # Blog list & MDX reader
│   │   ├── academic/     # Filterable list of PDFs & past papers
│   │   ├── projects/     # Showcases, docs, & GitHub links
│   │   └── api/          # Serverless endpoints for file fetch
│   └── lib/              # Supabase client & utility functions
└── astro.config.mjs


🎯 Core Features & Scope

Blog Hub: Markdown/MDX powered posts with syntax highlighting.

Academic Archive: Filterable list of past papers & project PDFs with in-browser previews via react-pdf.

Project Showcase: Embedded repository links, documentation downloads, and live demo links.

Global Search: Fast client-side search across blogs, documents, and projects.

🚀 Execution Roadmap

[x] Phase 1: Foundation — Setup Astro + Tailwind project and push to GitHub.

[x] Phase 2: Content Engines — Build MDX blog engine and static project pages.

[x] Phase 3: Storage & Academic Hub — Integrate Supabase bucket for PDF storage and academic files.

[ ] Phase 4: Deployment & Optimization — Connect repository to Vercel/Cloudflare Pages and test file download speeds.

🔒 Free-Tier Maintenance Checklist

[x] Keep individual file uploads under 50 MB (Supabase limit).

[x] Use Astro static generation where possible to conserve API traffic.

[x] Compress PDFs prior to uploading to keep total bucket size under 1 GB.
