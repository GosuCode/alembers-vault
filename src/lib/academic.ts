import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { AcademicResource } from "./supabase";

const ORDINAL: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "8th",
  9: "9th",
  10: "10th",
};

export function ordinal(value: number | null): string {
  if (value === null) return "";
  return ORDINAL[value] ?? `${value}th`;
}

/** URL slug for a resource: the stored stable slug, else the filename. */
export function slugFor(resource: AcademicResource): string {
  if (resource.slug) return resource.slug;
  const base = resource.storage_path.split("/").pop() ?? resource.id;
  return base.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

/** Keyword-rich page title for a single paper. */
export function pageTitle(resource: AcademicResource): string {
  const subject = resource.title.split("—")[0].trim();
  const sem = resource.semester ? `${ordinal(resource.semester)} Semester ` : "";
  const code = resource.course ? ` (${resource.course})` : "";
  const year = resource.year ? ` ${resource.year}` : "";
  return `${subject} Past Question Paper${year} — BCA ${sem}${code} | Tribhuvan University`.replace(
    /\s+/g,
    " ",
  );
}

export function metaDescription(resource: AcademicResource): string {
  const bits = [
    "Tribhuvan University BCA",
    resource.semester ? `${ordinal(resource.semester)} semester` : null,
    resource.course ? `course ${resource.course}` : null,
    resource.year ? `year ${resource.year}` : null,
  ].filter(Boolean);
  return `${resource.title} past question paper (${bits.join(", ")}). View or download the PDF from Alember's Vault.`;
}

// Build-time fetch of all resources, rendered into the HTML for crawlers.
export async function fetchAcademicResources(): Promise<AcademicResource[]> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("[academic] Supabase env missing at build; skipping fetch.");
    return [];
  }
  try {
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("academic_resources")
      .select("*")
      .order("semester", { ascending: true, nullsFirst: false })
      .order("year", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true });
    if (error) {
      console.warn("[academic] fetch failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.warn("[academic] fetch threw:", error);
    return [];
  }
}
