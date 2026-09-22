export const SITES = [
  { id: "vault.shreeshalember.com.np", label: "vault" },
  { id: "shreeshalember.com.np", label: "portfolio" },
] as const;

export type SiteId = (typeof SITES)[number]["id"];

export const DEFAULT_SITE: SiteId = "vault.shreeshalember.com.np";

export function isSiteId(value: string | null): value is SiteId {
  return SITES.some((entry) => entry.id === value);
}
