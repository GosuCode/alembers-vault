import { useEffect, useState } from "react";
import {
  analytics,
  type LeaderboardRow,
  type SearchTermRow,
} from "../../lib/admin";
import { formatDuration } from "../../lib/format";

function contentHref(type: string | null, slug: string | null): string | null {
  if (!slug) return null;
  if (type === "blog") return `/blogs/${slug}/`;
  if (type === "project") return `/projects/${slug}/`;
  if (type === "academic") return `/academic/${slug}/`;
  return null;
}

export default function Leaderboard() {
  const [content, setContent] = useState<LeaderboardRow[]>([]);
  const [terms, setTerms] = useState<SearchTermRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const sb = analytics();
    Promise.all([
      sb
        .schema("analytics")
        .from("content_leaderboard")
        .select("*")
        .order("pageviews", { ascending: false })
        .limit(100),
      sb
        .schema("analytics")
        .from("search_terms")
        .select("*")
        .order("searches", { ascending: false })
        .limit(100),
    ]).then(
      ([contentRes, termsRes]: Array<{ data: unknown[] | null; error: unknown }>) => {
        if (!active) return;
        if (contentRes.error || termsRes.error) {
          setStatus("error");
          return;
        }
        setContent((contentRes.data ?? []) as LeaderboardRow[]);
        setTerms((termsRes.data ?? []) as SearchTermRow[]);
        setStatus("ready");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return <p className="font-hand text-2xl text-pencil">ranking the shelf…</p>;
  }
  if (status === "error") {
    return <p className="text-accent-dark">Could not load the leaderboard.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">content leaderboard</h2>
          <p className="text-xs text-pencil">
            page views, engagement, and click-through to repos / demos / files
          </p>
        </div>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {content.map((row) => {
                const href = contentHref(row.content_type, row.content_slug);
                return (
                  <tr key={`${row.content_type}:${row.content_slug}`}>
                    <td className="max-w-[18rem] px-4 py-2">
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
                    <td className="px-4 py-2 text-right text-pencil">
                      {formatDuration(row.avg_duration_ms)}
                    </td>
                    <td className="px-4 py-2 text-right text-pencil">{row.outbound_clicks}</td>
                    <td className="px-4 py-2 text-right text-pencil">{row.downloads}</td>
                  </tr>
                );
              })}
              {content.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-pencil">
                    no content traffic yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">searches</h2>
          <p className="text-xs text-pencil">
            what people look for — and what found nothing
          </p>
        </div>
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
                    no searches yet — or every search found something
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
