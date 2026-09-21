// First-party analytics beacon. Cookie-less: no persistent identifiers are
// written to the client; the Worker derives visitor/session hashes server-side.

export interface TrackPayload {
  event_type: string;
  path?: string;
  title?: string;
  referrer?: string | null;
  sid?: string;
  duration_ms?: number;
  scroll_depth?: number;
  link_url?: string;
  link_text?: string;
  link_kind?: string;
  link_region?: string;
  target?: string;
  rel?: string;
  has_download?: boolean;
  content_type?: string;
  content_slug?: string;
  utm?: string | null;
  meta?: Record<string, unknown>;
}

declare global {
  interface Window {
    __vaultTrack?: (payload: TrackPayload) => void;
  }
}

function doNotTrack(): boolean {
  const nav = navigator as Navigator & {
    doNotTrack?: string | null;
    msDoNotTrack?: string | null;
  };
  return (
    nav.doNotTrack === "1" ||
    (window as Window & { doNotTrack?: string | null }).doNotTrack === "1" ||
    nav.msDoNotTrack === "1"
  );
}

function sessionId(): string {
  try {
    const key = "vault_sid";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

function utmSource(): string | null {
  try {
    const params = new URLSearchParams(location.search);
    return params.get("utm_source") || params.get("ref");
  } catch {
    return null;
  }
}

function contentFromPath(path: string): {
  content_type: string;
  content_slug: string | null;
} {
  const match = path.match(/^\/(blogs|projects|academic)\/([^/?#]+)/);
  if (!match) return { content_type: "page", content_slug: null };
  const type =
    match[1] === "blogs"
      ? "blog"
      : match[1] === "projects"
        ? "project"
        : "academic";
  return { content_type: type, content_slug: decodeURIComponent(match[2]) };
}

function send(payload: TrackPayload): void {
  if (doNotTrack()) return;
  const path = payload.path ?? location.pathname;
  const derived = contentFromPath(path);
  const body = JSON.stringify({
    sid: sessionId(),
    path,
    title: payload.title ?? document.title,
    referrer: payload.referrer ?? document.referrer ?? null,
    utm: payload.utm ?? utmSource(),
    content_type: payload.content_type ?? derived.content_type,
    content_slug: payload.content_slug ?? derived.content_slug,
    ...payload,
  });

  const url = "/api/collect";
  try {
    if (navigator.sendBeacon) {
      // text/plain keeps it a "simple" request: no CORS preflight.
      navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch(url, {
    method: "POST",
    body,
    headers: { "content-type": "text/plain" },
    keepalive: true,
  }).catch(() => {});
}

function regionOf(element: Element): string {
  const tagged = element.closest("[data-region]");
  if (tagged) return tagged.getAttribute("data-region") ?? "content";
  if (element.closest("nav")) return "nav";
  if (element.closest("footer")) return "footer";
  if (element.closest("aside")) return "sidebar";
  return "content";
}

function kindOf(anchor: HTMLAnchorElement): string {
  const explicit = anchor.dataset.track;
  if (explicit) return explicit;
  const href = anchor.getAttribute("href") ?? "";
  if (href.startsWith("mailto:")) return "email";
  if (href.startsWith("#")) return "anchor";
  if (anchor.hasAttribute("download")) return "download";
  let host = "";
  try {
    host = new URL(anchor.href, location.href).hostname.toLowerCase();
  } catch {
    /* ignore */
  }
  const self = location.hostname.toLowerCase();
  if (!host || host === self) return "internal";
  if (host === "github.com" || host.endsWith(".github.com") || host.endsWith(".github.io"))
    return "repo";
  if (host.endsWith("medium.com")) return "social";
  if (
    /(^|\.)(x|twitter)\.com$|(^|\.)t\.co$|(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)linkedin\.com$|(^|\.)reddit\.com$|(^|\.)t\.me$/.test(
      host,
    )
  )
    return "social";
  if (host.includes("supabase.co")) return "download";
  return "external";
}

function labelOf(anchor: HTMLAnchorElement): string {
  const explicit = anchor.getAttribute("data-track-label");
  if (explicit) return explicit;
  const text = (anchor.getAttribute("aria-label") || anchor.textContent || "").trim();
  if (text) return text.slice(0, 300);
  const img = anchor.querySelector("img");
  return (img?.getAttribute("alt") ?? "").slice(0, 300);
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target) return;
  const anchor = target.closest("a") as HTMLAnchorElement | null;
  const tagged = target.closest("[data-track]") as HTMLElement | null;
  if (!anchor && !tagged) return;

  const href = anchor?.getAttribute("href") ?? "";
  if (href.startsWith("/api/download") || href.startsWith("/api/redirect")) return;
  if (anchor?.dataset.trackSkip !== undefined) return;

  const linkUrl = anchor ? anchor.href : (tagged?.getAttribute("data-track-url") ?? undefined);

  send({
    event_type: "click",
    link_url: linkUrl,
    link_text: anchor ? labelOf(anchor) : (tagged?.getAttribute("data-track-label") ?? undefined),
    link_kind: anchor ? kindOf(anchor) : (tagged?.dataset.track || "external"),
    link_region: regionOf((anchor ?? tagged) as Element),
    target: anchor?.getAttribute("target") ?? undefined,
    rel: anchor?.getAttribute("rel") ?? undefined,
    has_download: anchor?.hasAttribute("download") ?? false,
    content_slug: anchor?.dataset.slug ?? undefined,
    content_type: anchor?.dataset.contentType ?? undefined,
  });
}

function setupEngagement(): void {
  let activeMs = 0;
  let visibleSince: number | null =
    document.visibilityState === "visible" ? performance.now() : null;
  let maxScroll = 0;
  let ticking = false;

  const currentMs = () =>
    activeMs + (visibleSince !== null ? performance.now() - visibleSince : 0);

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const root = document.documentElement;
      const denom = root.scrollHeight - root.clientHeight;
      const depth = denom > 0 ? Math.round((root.scrollTop / denom) * 100) : 0;
      if (depth > maxScroll) maxScroll = depth;
    });
  };

  const flush = () => {
    send({
      event_type: "engagement",
      duration_ms: Math.round(currentMs()),
      scroll_depth: maxScroll,
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });

  document.addEventListener("visibilitychange", () => {
    const now = performance.now();
    if (document.visibilityState === "hidden") {
      if (visibleSince !== null) activeMs += now - visibleSince;
      visibleSince = null;
      flush();
    } else {
      visibleSince = now;
    }
  });

  window.addEventListener("pagehide", () => {
    if (visibleSince !== null) {
      activeMs += performance.now() - visibleSince;
      visibleSince = null;
    }
    flush();
  });

  // Heartbeat: on mobile, pagehide can be dropped when a tab is killed.
  window.setInterval(() => {
    if (document.visibilityState === "visible") flush();
  }, 30_000);
}

export function setupAnalytics(): void {
  if ((window as Window & { __vaultAnalytics?: boolean }).__vaultAnalytics) return;
  if (location.pathname.startsWith("/admin")) return;
  if (doNotTrack()) return;
  (window as Window & { __vaultAnalytics?: boolean }).__vaultAnalytics = true;

  window.__vaultTrack = send;

  send({ event_type: "pageview" });
  document.addEventListener("click", onDocumentClick, true);
  setupEngagement();
}

export { send as track };
