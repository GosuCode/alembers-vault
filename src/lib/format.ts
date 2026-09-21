/**
 * Shared formatting helpers.
 */

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Sep 21" for a `YYYY-MM-DD` day key. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "21 Sep · 14:03" for a timestamp. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/** 84000 → "1m 24s"; null/under 1s → "—". */
export function formatDuration(ms: number | null): string {
  if (!ms || ms < 1000) return "—";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** "NP" → "🇳🇵" (falls back to the raw code). */
export function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return code ?? "—";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0) - 65,
    base + code.toUpperCase().charCodeAt(1) - 65,
  );
}
