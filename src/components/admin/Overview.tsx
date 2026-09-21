import { useEffect, useState } from "react";
import { analytics, type DailyRow, type TopPageRow, type SourceRow } from "../../lib/admin";
import { formatDay, formatDuration } from "../../lib/format";

interface RangeStats {
  pageviews: number;
  visitors: number;
  clicks: number;
  downloads: number;
  notFound: number;
  avgDuration: number;
}

function sum(rows: DailyRow[]): RangeStats {
  const stats: RangeStats = {
    pageviews: 0,
    visitors: 0,
    clicks: 0,
    downloads: 0,
    notFound: 0,
    avgDuration: 0,
  };
  let durationDays = 0;
  for (const row of rows) {
    stats.pageviews += row.pageviews;
    stats.visitors += row.visitors;
    stats.clicks += row.clicks;
    stats.downloads += row.downloads;
    stats.notFound += row.not_found;
    if (row.avg_duration_ms > 0) {
      stats.avgDuration += row.avg_duration_ms;
      durationDays += 1;
    }
  }
  if (durationDays > 0) stats.avgDuration = Math.round(stats.avgDuration / durationDays);
  return stats;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-ink/60 bg-white p-4 pop-sm">
      <p className="font-hand text-lg leading-none text-pencil">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-pencil">{hint}</p>}
    </div>
  );
}

function BarChart({ rows }: { rows: DailyRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.pageviews));
  return (
    <div className="flex h-32 items-end gap-1">
      {rows.map((row) => (
        <div
          key={row.day}
          className="group relative flex-1"
          title={`${row.day}: ${row.pageviews} views · ${row.visitors} visitors`}
        >
          <div
            className="w-full rounded-t bg-accent/70 transition group-hover:bg-accent"
            style={{ height: `${Math.max(2, (row.pageviews / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [topPages, setTopPages] = useState<TopPageRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const sb = analytics();
    Promise.all([
      sb.schema("analytics").from("daily").select("*").order("day", { ascending: true }).limit(90),
      sb
        .schema("analytics")
        .from("top_pages")
        .select("*")
        .order("pageviews", { ascending: false })
        .limit(8),
      sb
        .schema("analytics")
        .from("sources")
        .select("*")
        .order("pageviews", { ascending: false })
        .limit(6),
    ]).then(
      ([dailyRes, pagesRes, sourcesRes]: [
        { data: DailyRow[] | null; error: unknown },
        { data: TopPageRow[] | null; error: unknown },
        { data: SourceRow[] | null; error: unknown },
      ]) => {
        if (!active) return;
        if (dailyRes.error || pagesRes.error || sourcesRes.error) {
          setStatus("error");
          return;
        }
        setDaily(dailyRes.data ?? []);
        setTopPages(pagesRes.data ?? []);
        setSources(sourcesRes.data ?? []);
        setStatus("ready");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return <p className="font-hand text-2xl text-pencil">counting the visits…</p>;
  }
  if (status === "error") {
    return <p className="text-accent-dark">Could not load analytics.</p>;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const last = (days: number) => daily.slice(-days);
  const today = sum(daily.filter((row) => row.day === todayKey));
  const week = sum(last(7));
  const month = sum(last(30));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="today"
          value={String(today.pageviews)}
          hint={`${today.visitors} visitors · ${today.clicks} clicks`}
        />
        <StatCard
          label="last 7 days"
          value={String(week.pageviews)}
          hint={`${week.visitors} visitors · ${week.downloads} downloads`}
        />
        <StatCard
          label="last 30 days"
          value={String(month.pageviews)}
          hint={`${month.visitors} visitors · ${month.clicks} clicks`}
        />
        <StatCard
          label="avg time on page"
          value={formatDuration(month.avgDuration)}
          hint={`${month.notFound} missing pages`}
        />
      </div>

      <section className="rounded-lg border border-ink/60 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-hand text-2xl">pageviews</h2>
          <span className="text-xs text-pencil">last {Math.min(30, daily.length)} days</span>
        </div>
        <div className="mt-4">
          <BarChart rows={last(30)} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-pencil">
          <span>{daily.length ? formatDay(last(30)[0].day) : ""}</span>
          <span>{daily.length ? formatDay(last(30)[last(30).length - 1].day) : ""}</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-ink/60 bg-white p-5">
          <h2 className="font-hand text-2xl">top pages</h2>
          <ul className="mt-4 flex flex-col divide-y divide-line/60">
            {topPages.map((page) => (
              <li key={page.path} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0 truncate text-sm" title={page.path}>
                  {page.title || page.path}
                </span>
                <span className="shrink-0 text-sm text-pencil">
                  {page.pageviews} · {formatDuration(page.avg_duration_ms)}
                </span>
              </li>
            ))}
            {topPages.length === 0 && <li className="py-2 text-sm text-pencil">no data yet</li>}
          </ul>
        </section>

        <section className="rounded-lg border border-ink/60 bg-white p-5">
          <h2 className="font-hand text-2xl">traffic sources</h2>
          <ul className="mt-4 flex flex-col divide-y divide-line/60">
            {sources.map((source) => (
              <li key={source.source} className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm capitalize">{source.source}</span>
                <span className="text-sm text-pencil">
                  {source.pageviews} · {source.visitors} visitors
                </span>
              </li>
            ))}
            {sources.length === 0 && <li className="py-2 text-sm text-pencil">no data yet</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
