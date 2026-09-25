import { useEffect, useState } from "react";
import { getAuthClient } from "../../lib/admin";
import { formatDateTime } from "../../lib/format";
import type { CommentRow } from "../../lib/comments";

type Filter = "pending" | "approved" | "rejected" | "spam" | "all";

const FILTERS: Filter[] = ["pending", "approved", "rejected", "spam", "all"];

export default function Comments() {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    let query = getAuthClient().from("comments").select("*").order("created_at", {
      ascending: false,
    });
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (error) {
      setStatus("error");
      return;
    }
    setRows((data ?? []) as CommentRow[]);
    setStatus("ready");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function setRowStatus(id: string, next: "approved" | "rejected" | "spam") {
    setBusyId(id);
    const { error } = await getAuthClient().from("comments").update({ status: next }).eq("id", id);
    setBusyId(null);
    if (!error) await load();
  }

  async function remove(id: string) {
    setBusyId(id);
    const { error } = await getAuthClient().from("comments").delete().eq("id", id);
    setBusyId(null);
    if (!error) await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setFilter(entry)}
            className={[
              "rounded-md border px-3 py-1 font-hand text-lg leading-tight transition",
              filter === entry
                ? "border-ink/80 bg-accent text-white"
                : "border-ink/70 bg-white hover:bg-marker",
            ].join(" ")}
            aria-pressed={filter === entry}
          >
            {entry}
          </button>
        ))}
      </div>

      <p className="text-xs text-pencil/80">
        <strong>reject</strong> = hide only, visitor unaffected. {" "}
        <strong>spam</strong> = hide + silently block this visitor from posting again.
      </p>

      {status === "loading" && (
        <p className="font-hand text-2xl text-pencil">reading the mailbag…</p>
      )}
      {status === "error" && <p className="text-accent-dark">Could not load comments.</p>}

      {status === "ready" && rows.length === 0 && (
        <p className="text-sm text-pencil">nothing here</p>
      )}

      {status === "ready" && rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-ink/60 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-hand text-lg leading-tight">{row.author_name}</span>
                  {row.author_email && (
                    <span className="text-xs text-pencil/70">{row.author_email}</span>
                  )}
                  <span className="text-xs text-pencil/70">
                    {row.content_type}/{row.content_slug}
                    {row.parent_id ? " · reply" : ""}
                  </span>
                </div>
                <span className="text-xs text-pencil/70">{formatDateTime(row.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-ink">{row.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 text-xs text-pencil">
                  {row.status}
                </span>
                {row.status !== "approved" && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void setRowStatus(row.id, "approved")}
                    className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-base leading-tight transition hover:bg-marker disabled:opacity-50"
                  >
                    approve
                  </button>
                )}
                {row.status !== "rejected" && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void setRowStatus(row.id, "rejected")}
                    className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-base leading-tight transition hover:bg-marker disabled:opacity-50"
                  >
                    reject
                  </button>
                )}
                {row.status !== "spam" && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void setRowStatus(row.id, "spam")}
                    className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-base leading-tight transition hover:bg-marker disabled:opacity-50"
                  >
                    spam
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void remove(row.id)}
                  className="rounded-md border border-ink/60 bg-white px-2.5 py-1 font-hand text-base leading-tight text-accent-dark transition hover:bg-marker disabled:opacity-50"
                >
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
