import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env vars. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export const ACADEMIC_BUCKET = "academic";

export type AcademicResource =
  Database["public"]["Tables"]["academic_resources"]["Row"];

export function academicFileUrl(storagePath: string): string {
  return supabase.storage.from(ACADEMIC_BUCKET).getPublicUrl(storagePath).data
    .publicUrl;
}
