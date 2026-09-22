import { useEffect, useState } from "react";
import { analytics, type CountryRow, type EventRow } from "../../lib/admin";
import { countryFlag, formatDateTime, formatDay, formatDuration } from "../../lib/format";
import { downloadCsv } from "./csv";

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 10_000;

const TYPES = [
  "all",
  "pageview",
  "click",
  "download",
  "pdf_open",
  "engagement",
  "search",
  "copy",
  "web_vital",
  "not_found",
] as const;

const RANGES = [
  { value: "1", label: "today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "3650", label: "all time" },
];

function detail(row: EventRow): string {
  switch (row.event_type) {
    case "click":
      return row.link_text || row.link_url || "—";
    case "search":
      return String(row.meta?.query ?? "—");
    case "download":
    case "pdf_open":
      return row.link_text || row.link_url || "—";
    case "not_found":
      return row.path;
    case "copy":
      return String(row.meta?.snippet ?? `${row.meta?.length ?? "?"} chars`);
    case "web_vital":
      return `${row.meta?.metric ?? "vital"} · ${row.meta?.value ?? "?"}${row.meta?.rating ? ` (${row.meta.rating})` : ""}`;
    case "engagement":
      if (row.meta?.surface === "pdf") {
        return `pdf p.${row.meta.deepest ?? "?"} of ${row.meta.pages ?? "?"}`;
      }
      return `${formatDuration(row.duration_ms)} · scroll ${row.scroll_depth ?? 0}%`;
    default:
      return row.title || row.path;
  }
}

const selectClass =
  "rounded-md border border-ink/60 bg-white px-3 py-1.5 text-sm pop-sm focus:border-accent focus:outline-none";

export default function ActivityLog() {
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [country, setCountry] = useState("all");
  const [days, setDays] = useState("7");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), 400);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(0);
  }, [type, debounced, country, days]);

  useEffect(() => {
    analytics()
      .schema("analytics")
      .from("countries")
      .select("*")
      .order("visitors", { ascending: false })
      .limit(30)
      .then(({ data }: { data: CountryRow[] | null }) => setCountries(data ?? []));
  }, []);

  // Build a filtered query reused for the table and the CSV export.
  const build = () => {
    let q = analytics().schema("analytics").from("analytics_events").select("*");
    if (type !== "all") q = q.eq("event_type", type);
    if (country !== "all") q = q.eq("country", country);
    if (days !== "3650") {
      const since = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
      q = q.gte("created_at", since);
    }
    const needle = debounced.replace(/[,()%]/g, " ").trim();
    if (needle) {
      q = q.or(`path.ilike.%${needle}%,link_url.ilike.%${needle}%,link_text.ilike.%${needle}%`);
    }
    return q;
  };

  useEffect(() => {
    let active = true;
    setStatus("loading");
    build()
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count, error }: { data: EventRow[] | null; count: number | null; error: unknown }) => {
        if (!active) return;
        if (error) {
          setStatus("error");
          return;
        }
        setRows(data ?? []);
        setTotal(count ?? 0);
        setStatus("ready");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, debounced, country, days, page]);

  async function exportCsv() {
    const { data } = await build()
      .order("created_at", { ascending: false })
      .limit(EXPORT_LIMIT);
    const mapped = ((data ?? []) as EventRow[]).map((row) => ({
      created_at: row.created_at,
      event_type: row.event_type,
      path: row.path,
      detail: detail(row),
      link_url: row.link_url,
      link_kind: row.link_kind,
      country: row.country,
      city: row.city,
      device: row.device_type,
      browser: row.browser,
      os: row.os,
      referrer: row.referrer_host,
      source: row.source,
      duration_ms: row.duration_ms,
      scroll_depth: row.scroll_depth,
      visitor_hash: row.visitor_hash,
    }));
    downloadCsv(`vault-events-${new Date().toISOString().slice(0, 10)}.csv`, mapped);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">event</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            {TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">range</span>
          <select value={days} onChange={(e) => setDays(e.target.value)} className={selectClass}>
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
            <option value="all">all</option>
            {countries.map((option) => (
              <option key={option.country} value={option.country}>
                {option.country} ({option.visitors})
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="path, link or text…"
            className={selectClass}
          />
        </label>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-md border border-ink/70 bg-marker px-4 py-1.5 font-hand text-lg leading-tight transition hover:-translate-y-0.5"
        >
          export csv
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">activity log</h2>
          <span className="text-xs text-pencil">{total} events</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">when</th>
                <th className="px-4 py-2 font-medium">type</th>
                <th className="px-4 py-2 font-medium">page</th>
                <th className="px-4 py-2 font-medium">detail</th>
                <th className="px-4 py-2 font-medium">where</th>
                <th className="px-4 py-2 font-medium">device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="rounded-full border border-dashed border-pencil/50 px-2 py-0.5 text-xs">
                      {row.event_type}
                    </span>
                  </td>
                  <td className="max-w-[12rem] px-4 py-2">
                    <span className="block truncate" title={row.path}>
                      {row.path}
                    </span>
                  </td>
                  <td className="max-w-[18rem] px-4 py-2">
                    <span className="block truncate" title={detail(row)}>
                      {detail(row)}
                    </span>
                    {row.event_type === "click" && row.link_kind && (
                      <span className="text-xs text-pencil">{row.link_kind}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {countryFlag(row.country)}
                    {row.city ? ` ${row.city}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {[row.device_type, row.browser].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && status === "ready" && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-pencil">
                    nothing here yet
                  </td>
                </tr>
              )}
              {status === "error" && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-accent-dark">
                    could not load events
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line/60 px-5 py-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker disabled:opacity-40"
          >
            ← prev
          </button>
          <span className="text-xs text-pencil">
            page {page + 1} of {pages}
            {rows.length > 0 && ` · from ${formatDay(rows[rows.length - 1].created_at.slice(0, 10))}`}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker disabled:opacity-40"
          >
            next →
          </button>
        </div>
      </section>
    </div>
  );
}
