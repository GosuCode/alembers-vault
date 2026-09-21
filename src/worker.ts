/// <reference types="@cloudflare/workers-types" />
/**
 * Alember's Vault edge API.
 *
 * Owns /api/* on the site origin; everything else is served straight from the
 * static assets in ./dist (see wrangler.jsonc run_worker_first).
 *
 * Routes:
 *   POST /api/collect   — pageview / click / engagement / search / 404 events
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
  CF_DEPLOY_HOOK?: string;
  ASSETS: Fetcher;
}

const MAX_BODY = 16 * 1024;
const MAX_LINKS_PER_MIN = 240;
const MAX_URL = 2048;

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
  const match = path.match(/^\/(blogs|projects|academic)\/([^/?#]+)/);
  if (!match) return { content_type: "page", content_slug: null };
  const type =
    match[1] === "blogs" ? "blog" : match[1] === "projects" ? "project" : "academic";
  return { content_type: type, content_slug: decodeURIComponent(match[2]) };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // GET navigations / non-CORS
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === new URL(request.url).hostname.toLowerCase() ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

// isolated rate limiter (best-effort per isolate)
const rate = new Map<string, { count: number; reset: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rate.get(key);
  if (!entry || now > entry.reset) {
    rate.set(key, { count: 1, reset: now + 60_000 });
    if (rate.size > 5000) rate.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_LINKS_PER_MIN;
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
  if (!sameOrigin(request)) return json({ error: "bad origin" }, 403);

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

  const payload: Record<string, unknown> = {
    event_type: body.event_type,
    path,
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
