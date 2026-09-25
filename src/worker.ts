/// <reference types="@cloudflare/workers-types" />
/**
 * Alember's Vault edge API.
 *
 * Owns /api/* on the site origin; everything else is served straight from the
 * static assets in ./dist (see wrangler.jsonc run_worker_first).
 *
 * Routes:
 *   POST /api/collect   — pageview / click / engagement / search / 404 events
 *   POST /api/comments  — submit a comment (held for admin approval)
 *   GET  /api/download  — logs a file download, then 302s to Supabase Storage
 *   GET  /api/redirect  — looks up a 301 in public.redirects
 *   GET  /api/health    — config check
 *
 * Writes go through the token-gated analytics.ingest_event RPC, so this Worker
 * never needs the Supabase service role.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  INGEST_TOKEN: string;
  IP_SALT: string;
  SITE_HOST?: string;
  ALLOWED_ORIGINS?: string;
  CF_DEPLOY_HOOK?: string;
  ASSETS: Fetcher;
}

// Hosts that share the analytics backend, collapsed to one `site` label.
const SITE_ALIASES: Record<string, string> = {
  "shreeshalember.com.np": "shreeshalember.com.np",
  "www.shreeshalember.com.np": "shreeshalember.com.np",
  "vault.shreeshalember.com.np": "vault.shreeshalember.com.np",
};

function normalizeSite(host: string): string {
  const lower = host.toLowerCase();
  return SITE_ALIASES[lower] ?? lower;
}

function allowedHosts(env: Env, requestHost: string): Set<string> {
  const hosts = new Set<string>([requestHost.toLowerCase(), "localhost", "127.0.0.1"]);
  for (const item of (env.ALLOWED_ORIGINS ?? "").split(",")) {
    const host = item.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

function hostOfUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const MAX_BODY = 16 * 1024;
const MAX_LINKS_PER_MIN = 240;
const MAX_URL = 2048;
const MAX_COMMENTS_PER_10MIN = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseUA(ua: string) {
  const isBot =
    /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|slackbot|telegrambot|whatsapp|discordbot|headlesschrome|phantomjs|curl\/|wget|python-requests|python\/|okhttp|go-http-client|axios|monitor|uptime|pingdom|ahrefs|semrush|yandex|duckduckbot|applebot|sogou|baiduspider|exabot|mj12bot|dotbot|petalbot/i.test(
      ua,
    );
  const device = /mobile|iphone|ipod|windows phone/i.test(ua)
    ? "mobile"
    : /ipad|tablet|playbook|silk|android/i.test(ua)
      ? "tablet"
      : "desktop";
  let browser = "other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";
  let os = "other";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod|ios/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  return { device, browser, os, isBot };
}

function classifySource(
  referrer: string | null,
  selfHost: string,
  utm: string | null,
): string {
  if (utm) return utm.slice(0, 32).toLowerCase();
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === selfHost) return "internal";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)bing\./.test(host)) return "bing";
  if (/(^|\.)duckduckgo\./.test(host)) return "duckduckgo";
  if (/(^|\.)yahoo\./.test(host)) return "yahoo";
  if (host.endsWith("medium.com")) return "medium";
  if (host === "github.com" || host.endsWith(".github.com") || host.endsWith(".github.io"))
    return "github";
  if (
    /(^|\.)(x|twitter)\.com$|(^|\.)t\.co$|(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)linkedin\.com$|(^|\.)reddit\.com$|(^|\.)whatsapp\.com$|(^|\.)t\.me$/.test(
      host,
    )
  )
    return "social";
  return "other";
}

function contentFromPath(path: string): {
  content_type: string;
  content_slug: string | null;
} {
  const match = path.match(/^\/(blogs|blog|projects|academic)\/([^/?#]+)/);
  if (!match) return { content_type: "page", content_slug: null };
  const type =
    match[1] === "blogs" || match[1] === "blog"
      ? "blog"
      : match[1] === "projects"
        ? "project"
        : "academic";
  return { content_type: type, content_slug: decodeURIComponent(match[2]) };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // GET navigations / non-CORS
  const host = hostOfUrl(origin);
  if (!host) return false;
  return allowedHosts(env, new URL(request.url).hostname).has(host);
}

// isolated rate limiter (best-effort per isolate)
const rate = new Map<string, { count: number; reset: number }>();
function rateLimited(key: string, limit = MAX_LINKS_PER_MIN, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rate.get(key);
  if (!entry || now > entry.reset) {
    rate.set(key, { count: 1, reset: now + windowMs });
    if (rate.size > 5000) rate.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

async function supabaseFetch(
  env: Env,
  path: string,
  init: RequestInit & { schema?: string } = {},
  token?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.SUPABASE_ANON_KEY);
  headers.set("authorization", `Bearer ${token ?? env.SUPABASE_ANON_KEY}`);
  if (init.schema) headers.set("Content-Profile", init.schema);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

async function ingest(env: Env, payload: Record<string, unknown>): Promise<void> {
  const res = await supabaseFetch(env, "rpc/ingest_event", {
    method: "POST",
    schema: "analytics",
    body: JSON.stringify({ p: { ...payload, token: env.INGEST_TOKEN } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[ingest] failed", res.status, text.slice(0, 200));
  }
}

// ── handlers ────────────────────────────────────────────────────────────────

async function handleCollect(request: Request, env: Env): Promise<Response> {
  if (!originAllowed(request, env)) return json({ error: "bad origin" }, 403);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const path = String(body.path ?? "/").slice(0, MAX_URL);
  const ua = request.headers.get("user-agent") ?? "";
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0";
  const cf = (request.cf ?? {}) as IncomingRequestCfProperties;
  const selfHost = new URL(request.url).hostname.toLowerCase();

  const ipHash = await sha256Hex(`${env.IP_SALT}|${ip}`);
  if (rateLimited(`v:${ipHash}`)) return json({ error: "rate limited" }, 429);

  const visitorHash = await sha256Hex(`${env.IP_SALT}|${ip}|${ua}`);
  const sessionSeed = String(body.sid ?? "");
  const sessionHash = sessionSeed
    ? await sha256Hex(`${env.IP_SALT}|${sessionSeed}`)
    : await sha256Hex(`${env.IP_SALT}|${ip}|${ua}|${Math.floor(Date.now() / 1_800_000)}`);

  const referrer = body.referrer ? String(body.referrer).slice(0, MAX_URL) : null;
  const referrerHost = referrer ? hostOf(referrer) : null;
  const utm = body.utm ? String(body.utm) : null;
  const { device, browser, os, isBot } = parseUA(ua);
  const derived = contentFromPath(path);
  const linkUrl = body.link_url ? String(body.link_url).slice(0, MAX_URL) : null;
  const linkHost = linkUrl ? hostOf(linkUrl) : null;

  // Which site this came from: trust an allow-listed host, else the Origin /
  // Referer, else our own host. www/apex collapse to one label.
  const allowed = allowedHosts(env, selfHost);
  const claimed = typeof body.site === "string" ? body.site.toLowerCase() : null;
  const originHost = hostOfUrl(request.headers.get("origin"));
  const refererHostHeader = hostOfUrl(request.headers.get("referer"));
  const siteHost =
    (claimed && allowed.has(claimed) && claimed) ||
    (originHost && allowed.has(originHost) && originHost) ||
    (refererHostHeader && allowed.has(refererHostHeader) && refererHostHeader) ||
    selfHost;

  const payload: Record<string, unknown> = {
    event_type: body.event_type,
    path,
    site: normalizeSite(siteHost),
    title: body.title,
    referrer,
    referrer_host: referrerHost,
    source: classifySource(referrer, selfHost, utm),
    country: cf.country ?? null,
    region: cf.region ?? null,
    city: cf.city ?? null,
    continent: cf.continent ?? null,
    colo: cf.colo ?? null,
    asn: cf.asn ?? null,
    timezone: cf.timezone ?? null,
    latitude: cf.latitude ?? null,
    longitude: cf.longitude ?? null,
    user_agent: ua,
    device_type: device,
    browser,
    os,
    is_bot: isBot,
    session_hash: sessionHash,
    visitor_hash: visitorHash,
    ip_hash: ipHash,
    cf_ray: request.headers.get("cf-ray"),
    duration_ms: body.duration_ms,
    scroll_depth: body.scroll_depth,
    link_url: linkUrl,
    link_text: body.link_text,
    link_host: linkHost,
    link_kind: body.link_kind,
    link_region: body.link_region,
    is_external: linkHost ? linkHost !== selfHost : null,
    has_download: body.has_download,
    target: body.target,
    rel: body.rel,
    content_type: body.content_type ?? derived.content_type,
    content_slug: body.content_slug ?? derived.content_slug,
    meta: body.meta,
  };

  await ingest(env, payload);
  return new Response(null, { status: 204 });
}

async function handleComment(request: Request, env: Env): Promise<Response> {
  if (!originAllowed(request, env)) return json({ error: "bad origin" }, 403);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success so
  // bots don't learn to leave it blank.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true }, 201);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ipHash = await sha256Hex(`${env.IP_SALT}|${ip}`);
  if (rateLimited(`cm:${ipHash}`, MAX_COMMENTS_PER_10MIN, 600_000)) {
    return json({ error: "rate limited" }, 429);
  }

  const contentType = String(body.contentType ?? "");
  const contentSlug = String(body.contentSlug ?? "").trim();
  const authorName = String(body.authorName ?? "").trim();
  const authorEmail = typeof body.authorEmail === "string" ? body.authorEmail.trim() : "";
  const text = String(body.body ?? "").trim();
  const parentId = typeof body.parentId === "string" ? body.parentId : null;

  if (!["blog", "project", "academic"].includes(contentType)) {
    return json({ error: "invalid content type" }, 400);
  }
  if (!contentSlug || contentSlug.length > 200) {
    return json({ error: "invalid content slug" }, 400);
  }
  if (!authorName || authorName.length > 80) {
    return json({ error: "name is required (max 80 chars)" }, 400);
  }
  if (!text || text.length > 3000) {
    return json({ error: "comment is required (max 3000 chars)" }, 400);
  }
  if (parentId && !UUID_RE.test(parentId)) {
    return json({ error: "invalid parent" }, 400);
  }

  const ua = request.headers.get("user-agent") ?? "";
  const visitorHash = await sha256Hex(`${env.IP_SALT}|${ip}|${ua}`);

  const res = await supabaseFetch(env, "rpc/submit_comment", {
    method: "POST",
    body: JSON.stringify({
      p: {
        token: env.INGEST_TOKEN,
        content_type: contentType,
        content_slug: contentSlug,
        parent_id: parentId,
        author_name: authorName,
        author_email: authorEmail || null,
        body: text,
        ip_hash: ipHash,
        visitor_hash: visitorHash,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({})) as { message?: string };
    console.warn("[comment] rejected", res.status, detail.message);
    return json({ error: "could not post comment" }, 400);
  }

  return json({ ok: true }, 201);
}

async function handleDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const pathParam = url.searchParams.get("path");
  let storagePath = pathParam;

  if (id && !storagePath) {
    const res = await supabaseFetch(
      env,
      `academic_resources?id=eq.${encodeURIComponent(id)}&select=storage_path,title,category`,
      { schema: undefined },
    );
    if (res.ok) {
      const rows = (await res.json()) as Array<{
        storage_path: string;
        title: string;
      }>;
      storagePath = rows[0]?.storage_path ?? null;
    }
  }

  if (!storagePath) return json({ error: "not found" }, 404);

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/academic/${storagePath}`;
  const slug = storagePath.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? null;
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ua = request.headers.get("user-agent") ?? "";
  const cf = (request.cf ?? {}) as IncomingRequestCfProperties;
  const ipHash = await sha256Hex(`${env.IP_SALT}|${ip}`);
  const { device, browser, os, isBot } = parseUA(ua);
  const isView = url.searchParams.get("mode") === "view";

  await ingest(env, {
    event_type: isView ? "pdf_open" : "download",
    path: url.searchParams.get("from") ?? "/",
    site: normalizeSite(new URL(request.url).hostname),
    referrer: request.headers.get("referer"),
    source: "internal",
    country: cf.country ?? null,
    region: cf.region ?? null,
    city: cf.city ?? null,
    colo: cf.colo ?? null,
    user_agent: ua,
    device_type: device,
    browser,
    os,
    is_bot: isBot,
    visitor_hash: await sha256Hex(`${env.IP_SALT}|${ip}|${ua}`),
    ip_hash: ipHash,
    cf_ray: request.headers.get("cf-ray"),
    link_url: publicUrl,
    link_text: url.searchParams.get("label") ?? storagePath.split("/").pop() ?? storagePath,
    link_kind: isView ? "pdf" : "download",
    link_region: "content",
    content_type: "academic",
    content_slug: slug,
    meta: { resource_id: id ?? null, storage_path: storagePath },
  });

  return Response.redirect(publicUrl, 302);
}

async function handleRedirect(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get("path");
  if (!from) return json({ error: "missing path" }, 400);
  const res = await supabaseFetch(
    env,
    `redirects?from_path=eq.${encodeURIComponent(from)}&select=to_path,status&limit=1`,
    { schema: undefined },
  );
  if (!res.ok) return json({ error: "lookup failed" }, 502);
  const rows = (await res.json()) as Array<{ to_path: string; status: number }>;
  if (!rows.length) return json({ error: "no redirect" }, 404);
  return json(rows[0], 200);
}

async function handleRebuild(request: Request, env: Env): Promise<Response> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing token" }, 401);

  // Verify the caller is an admin via the DB's own gate.
  const check = await supabaseFetch(env, "rpc/is_admin", { method: "POST", body: "{}" }, token);
  if (!check.ok) return json({ error: "auth check failed" }, 401);
  if ((await check.json()) !== true) return json({ error: "not admin" }, 403);

  if (!env.CF_DEPLOY_HOOK) {
    return json({ ok: false, configured: false, error: "deploy hook not configured" }, 501);
  }

  const hook = await fetch(env.CF_DEPLOY_HOOK, { method: "POST" });
  return json({ ok: hook.ok, status: hook.status }, hook.ok ? 200 : 502);
}

function handleHealth(env: Env): Response {
  return json({
    ok: true,
    supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    ingest: Boolean(env.INGEST_TOKEN),
    hash: Boolean(env.IP_SALT),
    rebuild: Boolean(env.CF_DEPLOY_HOOK),
  });
}

// ── entry ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": request.headers.get("origin") ?? "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
        },
      });
    }

    if (pathname === "/api/collect") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      return handleCollect(request, env);
    }
    if (pathname === "/api/comments") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      return handleComment(request, env);
    }
    if (pathname === "/api/rebuild") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      return handleRebuild(request, env);
    }
    if (pathname === "/api/download") return handleDownload(request, env);
    if (pathname === "/api/redirect") return handleRedirect(request, env);
    if (pathname === "/api/health") return handleHealth(env);

    if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
