import { useEffect, useState } from "react";
import { analytics, getAuthClient } from "../../lib/admin";
import { countryFlag } from "../../lib/format";
import type { SiteId } from "./sites";

interface LiveEvent {
  visitor_hash: string | null;
  path: string;
  created_at: string;
  country: string | null;
  device_type: string | null;
}

const WINDOW_MS = 5 * 60 * 1000;

export default function Live({ site }: { site: SiteId }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = async () => {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data, error } = await analytics()
      .schema("analytics")
      .from("analytics_events")
      .select("visitor_hash,path,created_at,country,device_type")
      .eq("site", site)
      .eq("event_type", "pageview")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      setStatus("error");
      return;
    }
    setEvents((data ?? []) as LiveEvent[]);
    setStatus("ready");
  };

  useEffect(() => {
    void load();

    const supabase = getAuthClient();
    const channel = supabase
      .channel(`live-events-${site}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "analytics",
          table: "analytics_events",
          filter: `site=eq.${site}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.event_type !== "pageview") return;
          setEvents((current) =>
            [
              {
                visitor_hash: row.visitor_hash as string | null,
                path: row.path as string,
                created_at: row.created_at as string,
                country: row.country as string | null,
                device_type: row.device_type as string | null,
              },
              ...current,
            ].slice(0, 1000),
          );
        },
      )
      .subscribe((state) => setConnected(state === "SUBSCRIBED"));

    // Fallback refresh in case Realtime is unavailable.
    const poll = window.setInterval(() => void load(), 60_000);
    const prune = window.setInterval(() => {
      setEvents((current) =>
        current.filter((event) => Date.now() - new Date(event.created_at).getTime() < WINDOW_MS),
      );
    }, 20_000);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(prune);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  if (status === "error") return <p className="text-accent-dark">Could not load the live feed.</p>;

  const activeVisitors = new Set(events.map((event) => event.visitor_hash).filter(Boolean)).size;
  const pageCounts = new Map<string, number>();
  for (const event of events) pageCounts.set(event.path, (pageCounts.get(event.path) ?? 0) + 1);
  const topPages = Array.from(pageCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-ink/60 bg-white p-5">
          <p className="font-hand text-lg leading-none text-pencil">on site now</p>
          <p className="mt-2 text-4xl font-semibold">{activeVisitors}</p>
          <p className="mt-1 text-xs text-pencil">visitors in the last 5 minutes</p>
        </div>
        <div className="rounded-lg border border-ink/60 bg-white p-5">
          <p className="font-hand text-lg leading-none text-pencil">pageviews</p>
          <p className="mt-2 text-4xl font-semibold">{events.length}</p>
          <p className="mt-1 text-xs text-pencil">last 5 minutes</p>
        </div>
        <div className="rounded-lg border border-ink/60 bg-white p-5">
          <p className="font-hand text-lg leading-none text-pencil">live feed</p>
          <p className="mt-2 text-2xl font-semibold">{connected ? "connected" : "polling"}</p>
          <p className="mt-1 text-xs text-pencil">Supabase Realtime</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
          <div className="border-b border-line/60 px-5 py-3">
            <h2 className="font-hand text-2xl">active pages</h2>
          </div>
          <ul className="flex flex-col divide-y divide-line/60">
            {topPages.map(([path, count]) => (
              <li key={path} className="flex items-center justify-between gap-4 px-5 py-2 text-sm">
                <span className="min-w-0 truncate" title={path}>
                  {path}
                </span>
                <span className="text-pencil">{count}</span>
              </li>
            ))}
            {topPages.length === 0 && <li className="px-5 py-6 text-sm text-pencil">quiet right now</li>}
          </ul>
        </section>

        <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
          <div className="border-b border-line/60 px-5 py-3">
            <h2 className="font-hand text-2xl">recent activity</h2>
          </div>
          <div className="max-h-[22rem] overflow-y-auto">
            <ul className="flex flex-col divide-y divide-line/60">
              {events.slice(0, 25).map((event, index) => (
                <li key={`${event.created_at}-${index}`} className="flex items-center justify-between gap-4 px-5 py-2 text-sm">
                  <span className="min-w-0 truncate" title={event.path}>
                    {event.path}
                  </span>
                  <span className="shrink-0 text-xs text-pencil">
                    {countryFlag(event.country)} {event.device_type ?? ""}
                  </span>
                </li>
              ))}
              {events.length === 0 && <li className="px-5 py-6 text-sm text-pencil">no one browsing right now</li>}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
