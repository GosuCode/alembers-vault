import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export type AppSupabase = SupabaseClient<Database>;

let client: AppSupabase | null = null;

// Browser client with a persisted session for the admin dashboard.
export function getAuthClient(): AppSupabase {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase env vars. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  if (!client) {
    client = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

// The analytics schema is exposed to PostgREST but the generated types only
// cover `public`, so queries against the analytics views are untyped here.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function analytics(): any {
  return getAuthClient();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function signInWithEmail(email: string): Promise<{ error?: string }> {
  const { error } = await getAuthClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}/admin/` },
  });
  return error ? { error: error.message } : {};
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error?: string }> {
  const { error } = await getAuthClient().auth.signInWithPassword({ email, password });
  return error ? { error: error.message } : {};
}

export async function signOut(): Promise<void> {
  await getAuthClient().auth.signOut();
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await getAuthClient().rpc("is_admin");
  if (error) return false;
  return data === true;
}

// ── analytics view row shapes (mirror the SQL views) ────────────────────────

export interface DailyRow {
  day: string;
  pageviews: number;
  visitors: number;
  clicks: number;
  downloads: number;
  not_found: number;
  avg_duration_ms: number;
}

export interface TopPageRow {
  path: string;
  title: string | null;
  pageviews: number;
  visitors: number;
  avg_duration_ms: number;
  avg_scroll_depth: number;
}

export interface SourceRow {
  source: string;
  pageviews: number;
  visitors: number;
}

export interface ReferrerRow {
  referrer_host: string;
  hits: number;
  visitors: number;
}

export interface CountryRow {
  country: string;
  hits: number;
  visitors: number;
}

export interface DeviceRow {
  device_type: string;
  browser: string;
  os: string;
  hits: number;
  visitors: number;
}

export interface TopLinkRow {
  link_url: string | null;
  link_text: string | null;
  link_kind: string | null;
  link_host: string | null;
  clicks: number;
  visitors: number;
}

export interface DownloadRow {
  link_url: string;
  label: string | null;
  content_slug: string | null;
  downloads: number;
  visitors: number;
}

export interface LeaderboardRow {
  content_type: string | null;
  content_slug: string | null;
  pageviews: number;
  visitors: number;
  avg_duration_ms: number;
  outbound_clicks: number;
  downloads: number;
}

export interface SearchTermRow {
  query: string | null;
  searches: number;
  zero_results: number;
}

export interface EventRow {
  id: number;
  created_at: string;
  event_type: string;
  path: string;
  title: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  referrer_host: string | null;
  source: string | null;
  link_url: string | null;
  link_text: string | null;
  link_kind: string | null;
  link_region: string | null;
  duration_ms: number | null;
  scroll_depth: number | null;
  content_slug: string | null;
  content_type: string | null;
  visitor_hash: string | null;
  meta: Record<string, unknown> | null;
}
