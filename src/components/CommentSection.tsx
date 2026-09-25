import { useEffect, useMemo, useState } from "react";
import {
  HONEYPOT_FIELD,
  buildCommentTree,
  fetchApprovedComments,
  submitComment,
  type CommentContentType,
  type CommentNode,
} from "../lib/comments";

interface Props {
  contentType: CommentContentType;
  contentSlug: string;
}

const inputClass =
  "rounded-md border border-ink/60 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [string, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${label}${value > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

function CommentForm({
  contentType,
  contentSlug,
  parentId,
  onDone,
}: {
  contentType: CommentContentType;
  contentSlug: string;
  parentId: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!name.trim() || !body.trim()) {
      setMessage("Name and comment are both required.");
      return;
    }
    setState("sending");
    setMessage("");
    const result = await submitComment({
      contentType,
      contentSlug,
      parentId,
      authorName: name.trim(),
      authorEmail: email.trim() || undefined,
      body: body.trim(),
      [HONEYPOT_FIELD]: trap,
    });
    if (!result.ok) {
      setState("error");
      setMessage(result.error ?? "Could not post comment.");
      return;
    }
    setState("sent");
    setName("");
    setEmail("");
    setBody("");
    onDone();
  }

  if (state === "sent") {
    return (
      <p className="rounded-md border border-dashed border-accent/60 bg-marker/40 px-4 py-3 text-sm text-pencil">
        Thanks — your comment is awaiting approval and will show up once reviewed.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      {/* Honeypot: hidden from sighted users and screen readers, bots fill it in */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        value={trap}
        onChange={(event) => setTrap(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-5000px", width: 1, height: 1, overflow: "hidden" }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-pencil">name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-pencil">
            email <span className="normal-case text-pencil/70">(optional, never shown)</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-pencil">
          {parentId ? "reply" : "comment"}
        </span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={3000}
          rows={parentId ? 3 : 4}
          required
          className={inputClass}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-md border border-ink/80 bg-accent px-5 py-2 text-sm font-semibold text-white pop-sm transition hover:-translate-y-0.5 hover:bg-accent-dark disabled:opacity-60"
        >
          {state === "sending" ? "posting…" : parentId ? "post reply" : "post comment"}
        </button>
        {message && <span className="text-sm text-accent-dark">{message}</span>}
      </div>
    </form>
  );
}

function CommentItem({
  node,
  contentType,
  contentSlug,
  depth,
  onReplied,
}: {
  node: CommentNode;
  contentType: CommentContentType;
  contentSlug: string;
  depth: number;
  onReplied: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const indent = Math.min(depth, 4);

  return (
    <li className={indent > 0 ? "mt-4 border-l border-dashed border-line pl-4" : "mt-4"}>
      <div className="rounded-lg border border-ink/60 bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-hand text-lg leading-tight text-pencil">{node.author_name}</span>
          <span className="text-xs text-pencil/70">{timeAgo(node.created_at)}</span>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm text-ink">{node.body}</p>
        <button
          type="button"
          onClick={() => setReplying((value) => !value)}
          className="mt-2 font-hand text-base leading-tight text-accent transition hover:text-accent-dark"
        >
          {replying ? "cancel" : "reply"}
        </button>
        {replying && (
          <div className="mt-3">
            <CommentForm
              contentType={contentType}
              contentSlug={contentSlug}
              parentId={node.id}
              onDone={() => {
                setReplying(false);
                onReplied();
              }}
            />
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <CommentItem
              key={child.id}
              node={child}
              contentType={contentType}
              contentSlug={contentSlug}
              depth={depth + 1}
              onReplied={onReplied}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CommentSection({ contentType, contentSlug }: Props) {
  const [rows, setRows] = useState<CommentNode[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchApprovedComments(contentType, contentSlug)
      .then((data) => {
        if (active) setRows(buildCommentTree(data));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [contentType, contentSlug, refreshKey]);

  const count = useMemo(
    () => (rows ? countNodes(rows) : 0),
    [rows],
  );

  return (
    <section className="mt-14 border-t border-dashed border-line pt-8">
      <h2 className="font-hand text-3xl sketch-underline">
        comments{rows ? ` (${count})` : ""}
      </h2>

      {error && <p className="mt-4 text-sm text-accent-dark">Could not load comments.</p>}

      {rows && rows.length > 0 && (
        <ul className="mt-6">
          {rows.map((node) => (
            <CommentItem
              key={node.id}
              node={node}
              contentType={contentType}
              contentSlug={contentSlug}
              depth={0}
              onReplied={() => setRefreshKey((value) => value + 1)}
            />
          ))}
        </ul>
      )}

      {rows && rows.length === 0 && (
        <p className="mt-4 text-sm text-pencil">No comments yet — be the first.</p>
      )}

      <div className="mt-6">
        <CommentForm
          contentType={contentType}
          contentSlug={contentSlug}
          parentId={null}
          onDone={() => setRefreshKey((value) => value + 1)}
        />
      </div>
    </section>
  );
}

function countNodes(nodes: CommentNode[]): number {
  let total = 0;
  for (const node of nodes) total += 1 + countNodes(node.children);
  return total;
}
