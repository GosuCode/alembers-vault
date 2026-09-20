---
title: "Why the Backend Doesn’t Need `.env` in Docker/CI but the Frontend Does"
description: "CI/CD Workflow"
pubDate: 2025-12-14
tags: ["docker","ci-cd","env","node"]
sourceUrl: "https://medium.com/@gosucode/why-the-backend-doesnt-need-env-in-docker-ci-but-the-frontend-does-e39174f6d955"
---

### Why the Backend Doesn’t Need \`.env\` in Docker/CI but the Frontend Does

#### CI/CD Workflow

#### 1\. Backend: Runtime Environment Variables

Your backend (Node/Spring/etc.) reads:

```vbnet
const key = process.env.POSTHOG_API_KEY;
```

-   `process.env` is **read at runtime**, when the container starts.
-   Docker, docker-compose, Kubernetes, systemd, whatever — all of these can inject envs **when the container runs**.
-   No need to bake them into the build image; they’re live values.

**Analogy:** Backend envs are like a lamp plugged into the wall — you can swap the socket anytime, and it still works.

#### 2\. Frontend: Compile-Time Environment Variables

Your frontend (Vite + React) reads:

```cpp
const key = import.meta.env.VITE_POSTHOG_API_KEY;
```

-   `import.meta.env` is replaced **during** `**npm run build**`.
-   By the time the JS bundle is served, the code is static; runtime Docker envs do nothing.

**Analogy:** Frontend envs are like sealing a key in concrete — once baked, you can’t change it without rebuilding.

### How to Handle It in the Workflow (Frontend)

Set the secrets in github secrets.

#### Update the frontend Dockerfile to accept build args

Before the build:

```bash
# Build stage
FROM node:20-alpine AS builder
WORKDIR /build

# Copy package files
COPY package*.json ./
RUN npm install
COPY . .

# Accept Vite build-time env
ARG VITE_POSTHOG_API_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_POSTHOG_API_KEY=$VITE_POSTHOG_API_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

ENV NODE_OPTIONS=--max-old-space-size=2048

# Build
RUN npm run build
```

**Explanation:**

-   `**ARG**` allows the Docker build to receive values from GitHub Secrets
-   `**ENV**` makes them visible to Vite during `**npm run build**`

Without this, Vite sees nothing.

#### Update GitHub Actions frontend build step

```yaml
- name: Build and push frontend
  uses: docker/build-push-action@v5
  with:
    context: ./frontend
    push: true
    tags: ${{ steps.meta-frontend.outputs.tags }}
    labels: ${{ steps.meta-frontend.outputs.labels }}
    platforms: linux/amd64
    build-args: |
      VITE_POSTHOG_API_KEY=${{ secrets.VITE_POSTHOG_API_KEY }}
      VITE_POSTHOG_HOST=${{ secrets.VITE_POSTHOG_HOST }}
```

**Explanation:**

-   Passes your GitHub Secrets into Docker
-   Ensures `**npm run build**` sees the envs
-   Guarantees PostHog key is baked into production JS

### Notes

-   Always store secrets in GitHub repo secrets (or your CI platform’s equivalent) — never hardcode them.
-   Built-in vars like import.meta.env.MODE (“production”) or **import.meta.env.PROD** (true) work automatically — no need to set those.
-   If your app has **no custom VITE\_ variables**, then no — you don’t need to specify any.
-   This applies to any CI/CD (GitHub Actions, Vercel, Netlify, etc.) — the principle is the same: vars must be present at build time.

This setup ensures your production build embeds the correct values, just like local .env.production does.
