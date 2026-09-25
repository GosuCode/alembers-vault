import { getSupabase } from "./supabase";
import type { Database } from "./database.types";

export type CommentRow = Database["public"]["Tables"]["comments"]["Row"];
export type CommentContentType = "blog" | "project" | "academic";

export interface CommentNode extends CommentRow {
  children: CommentNode[];
}

// Hidden field bots fill in and humans never see (CSS-hidden, not display:none
// so it still gets tab-skipped and screen readers ignore it via aria-hidden).
// The worker silently no-ops the submission if this arrives non-empty.
export const HONEYPOT_FIELD = "website";

export async function fetchApprovedComments(
  contentType: CommentContentType,
  contentSlug: string,
): Promise<CommentRow[]> {
  const { data, error } = await getSupabase()
    .from("comments")
    .select("*")
    .eq("content_type", contentType)
    .eq("content_slug", contentSlug)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function buildCommentTree(rows: CommentRow[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export interface SubmitCommentInput {
  contentType: CommentContentType;
  contentSlug: string;
  parentId?: string | null;
  authorName: string;
  authorEmail?: string;
  body: string;
  [HONEYPOT_FIELD]?: string;
}

export interface SubmitCommentResult {
  ok: boolean;
  error?: string;
}

export async function submitComment(
  input: SubmitCommentInput,
): Promise<SubmitCommentResult> {
  try {
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return { ok: false, error: payload.error ?? "Could not post comment." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}
