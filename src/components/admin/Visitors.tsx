import { useEffect, useState } from "react";
import {
  analytics,
  type CountryRow,
  type DeviceRow,
  type EventRow,
  type ReferrerRow,
  type TopPageRow,
} from "../../lib/admin";
import { countryFlag, formatDateTime, formatDuration } from "../../lib/format";

const PAGE_SIZE = 25;

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <section className="rounded-lg border border-ink/60 bg-white p-5">
      <h2 className="font-hand text-2xl">{title}</h2>
      <ul className="mt-4 flex flex-col divide-y divide-line/60">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center justify-between gap-4 py-2">
            <span className="min-w-0 truncate text-sm">{label}</span>
            <span className="shrink-0 text-sm text-pencil">{value}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-sm text-pencil">no data yet</li>}
      </ul>
    </section>
  );
}

export default function Visitors() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const sb = analytics();
    Promise.all([
      sb
        .schema("analytics")
        .from("countries")
        .select("*")
        .order("visitors", { ascending: false })
        .limit(10),
      sb.schema("analytics").from("devices").select("*").order("visitors", { ascending: false }).limit(10),
      sb
        .schema("analytics")
        .from("referrers")
        .select("*")
        .order("visitors", { ascending: false })
        .limit(10),
      sb.schema("analytics").from("top_pages").select("path,avg_duration_ms").limit(500),
    ]).then(
      ([c, d, r, dur]: Array<{ data: unknown[] | null; error: unknown }>) => {
        if (!active) return;
        if (c.error || d.error || r.error || dur.error) {
          setStatus("error");
          return;
        }
        setCountries((c.data ?? []) as CountryRow[]);
        setDevices((d.data ?? []) as DeviceRow[]);
        setReferrers((r.data ?? []) as ReferrerRow[]);
        const map: Record<string, number> = {};
        for (const row of (dur.data ?? []) as Pick<TopPageRow, "path" | "avg_duration_ms">[]) {
          map[row.path] = row.avg_duration_ms;
        }
        setDurations(map);
        setStatus("ready");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const sb = analytics();
    sb.schema("analytics")
      .from("analytics_events")
      .select("*", { count: "exact" })
      .eq("event_type", "pageview")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count, error }: { data: EventRow[] | null; count: number | null; error: unknown }) => {
        if (!active) return;
        if (error) {
          setStatus("error");
          return;
        }
        setEvents(data ?? []);
        setTotal(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, [page]);

  if (status === "error") {
    return <p className="text-accent-dark">Could not load visitors.</p>;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">recent visits</h2>
          <span className="text-xs text-pencil">{total} pageviews</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">when</th>
                <th className="px-4 py-2 font-medium">page</th>
                <th className="px-4 py-2 font-medium">where</th>
                <th className="px-4 py-2 font-medium">device</th>
                <th className="px-4 py-2 font-medium">from</th>
                <th className="px-4 py-2 font-medium">avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {events.map((event) => (
                <tr key={event.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {formatDateTime(event.created_at)}
                  </td>
                  <td className="max-w-[16rem] px-4 py-2">
                    <span className="block truncate" title={event.path}>
                      {event.title || event.path}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {countryFlag(event.country)}
                    {event.city ? ` ${event.city}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {[event.device_type, event.browser].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {event.source || event.referrer_host || "direct"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {formatDuration(durations[event.path] ?? null)}
                  </td>
                </tr>
              ))}
              {events.length === 0 && status === "ready" && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-pencil">
                    no visits recorded yet
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Breakdown
          title="countries"
          rows={countries.map((row) => [
            `${countryFlag(row.country)} ${row.country}`,
            row.visitors,
          ])}
        />
        <Breakdown
          title="devices"
          rows={devices.map((row) => [
            [row.device_type, row.browser, row.os].filter(Boolean).join(" · "),
            row.visitors,
          ])}
        />
        <Breakdown
          title="referrers"
          rows={referrers.map((row) => [row.referrer_host, row.visitors])}
        />
      </div>
    </div>
  );
}
