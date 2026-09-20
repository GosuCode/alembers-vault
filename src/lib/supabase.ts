import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

let client: SupabaseClient<Database> | null = null;

// Lazy so importing this module never throws (e.g. during a build without env).
export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase env vars. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  if (!client) {
    client = createClient<Database>(supabaseUrl, supabaseKey);
  }
  return client;
}

export const ACADEMIC_BUCKET = "academic";

export type AcademicResource =
  Database["public"]["Tables"]["academic_resources"]["Row"];

// Public URL built from env directly, so build-time pages never throw when the
// client can't be constructed.
export function academicFileUrl(storagePath: string): string {
  if (!supabaseUrl) return "";
  return `${supabaseUrl}/storage/v1/object/public/${ACADEMIC_BUCKET}/${storagePath}`;
}
