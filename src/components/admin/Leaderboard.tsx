import { useEffect, useState, type ReactNode } from "react";
import {
  analytics,
  type CopiedSnippetRow,
  type LeaderboardRow,
  type PdfDepthRow,
  type SearchTermRow,
} from "../../lib/admin";
import { formatDuration } from "../../lib/format";
import type { SiteId } from "./sites";

function contentHref(type: string | null, slug: string | null): string | null {
  if (!slug) return null;
  if (type === "blog") return `/blogs/${slug}/`;
  if (type === "project") return `/projects/${slug}/`;
  if (type === "academic") return `/academic/${slug}/`;
  return null;
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
      <div className="border-b border-line/60 px-5 py-3">
        <h2 className="font-hand text-2xl">{title}</h2>
        {hint && <p className="text-xs text-pencil">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Leaderboard({ site }: { site: SiteId }) {
  const [content, setContent] = useState<LeaderboardRow[]>([]);
  const [terms, setTerms] = useState<SearchTermRow[]>([]);
  const [snippets, setSnippets] = useState<CopiedSnippetRow[]>([]);
  const [pdf, setPdf] = useState<PdfDepthRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const sb = analytics();
    Promise.all([
      sb.schema("analytics").from("content_leaderboard").select("*").eq("site", site).order("pageviews", { ascending: false }).limit(100),
      sb.schema("analytics").from("search_terms").select("*").eq("site", site).order("searches", { ascending: false }).limit(100),
      sb.schema("analytics").from("copied_snippets").select("*").eq("site", site).order("copies", { ascending: false }).limit(30),
      sb.schema("analytics").from("pdf_depth").select("*").eq("site", site).order("reads", { ascending: false }).limit(50),
    ]).then(
      ([contentRes, termsRes, snippetsRes, pdfRes]: Array<{ data: unknown[] | null; error: unknown }>) => {
        if (!active) return;
        if (contentRes.error || termsRes.error || snippetsRes.error || pdfRes.error) {
          setStatus("error");
          return;
        }
        setContent((contentRes.data ?? []) as LeaderboardRow[]);
        setTerms((termsRes.data ?? []) as SearchTermRow[]);
        setSnippets((snippetsRes.data ?? []) as CopiedSnippetRow[]);
        setPdf((pdfRes.data ?? []) as PdfDepthRow[]);
        setStatus("ready");
      },
    );
    return () => {
      active = false;
    };
  }, [site]);

  if (status === "loading") {
    return <p className="font-hand text-2xl text-pencil">ranking the shelf…</p>;
  }
  if (status === "error") {
    return <p className="text-accent-dark">Could not load the leaderboard.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="content leaderboard" hint="views, engagement, click-through and copies">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">content</th>
                <th className="px-4 py-2 font-medium">type</th>
                <th className="px-4 py-2 font-medium text-right">views</th>
                <th className="px-4 py-2 font-medium text-right">visitors</th>
                <th className="px-4 py-2 font-medium text-right">avg time</th>
                <th className="px-4 py-2 font-medium text-right">outbound</th>
                <th className="px-4 py-2 font-medium text-right">downloads</th>
                <th className="px-4 py-2 font-medium text-right">copies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {content.map((row) => {
                const href = contentHref(row.content_type, row.content_slug);
                return (
                  <tr key={`${row.content_type}:${row.content_slug}`}>
                    <td className="max-w-[16rem] px-4 py-2">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-accent hover:text-accent-dark"
                          title={row.content_slug ?? ""}
                        >
                          {row.content_slug}
                        </a>
                      ) : (
                        <span className="block truncate">{row.content_slug}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-pencil">{row.content_type}</td>
                    <td className="px-4 py-2 text-right font-semibold">{row.pageviews}</td>
                    <td className="px-4 py-2 text-right text-pencil">{row.visitors}</td>
                    <td className="px-4 py-2 text-right text-pencil">{formatDuration(row.avg_duration_ms)}</td>
                    <td className="px-4 py-2 text-right text-pencil">{row.outbound_clicks}</td>
                    <td className="px-4 py-2 text-right text-pencil">{row.downloads}</td>
                    <td className="px-4 py-2 text-right text-pencil">{row.copies}</td>
                  </tr>
                );
              })}
              {content.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-pencil">
                    no content traffic yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="most copied" hint="text visitors actually took from a page">
          <ul className="flex flex-col divide-y divide-line/60">
            {snippets.map((row) => (
              <li key={row.snippet} className="px-5 py-3">
                <p className="line-clamp-2 text-sm text-ink" title={row.snippet}>
                  {row.snippet}
                </p>
                <p className="mt-1 text-xs text-pencil">
                  {row.copies}× · {row.path}
                </p>
              </li>
            ))}
            {snippets.length === 0 && <li className="px-5 py-6 text-sm text-pencil">nothing copied yet</li>}
          </ul>
        </Panel>

        <Panel title="PDF reading depth" hint="how far readers get into a paper">
          <ul className="flex flex-col divide-y divide-line/60">
            {pdf.map((row) => (
              <li key={`${row.content_slug}:${row.path}`} className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="min-w-0 truncate text-sm">{row.content_slug || row.path}</span>
                <span className="shrink-0 text-xs text-pencil">
                  p{row.avg_deepest ?? "?"}/{row.pages ?? "?"} · {row.reads} reads
                </span>
              </li>
            ))}
            {pdf.length === 0 && <li className="px-5 py-6 text-sm text-pencil">no PDF reads tracked yet</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="searches" hint="what people look for — and what found nothing">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">query</th>
                <th className="px-4 py-2 font-medium text-right">searches</th>
                <th className="px-4 py-2 font-medium text-right">zero results</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {terms.map((term) => (
                <tr key={term.query}>
                  <td className="max-w-[24rem] px-4 py-2">
                    <span className="block truncate" title={term.query ?? ""}>
                      {term.query || "(empty)"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{term.searches}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={term.zero_results > 0 ? "font-semibold text-accent-dark" : "text-pencil"}>
                      {term.zero_results}
                    </span>
                  </td>
                </tr>
              ))}
              {terms.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-pencil">
                    no searches yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
