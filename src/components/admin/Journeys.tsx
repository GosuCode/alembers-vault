import { useEffect, useState } from "react";
import { analytics, type SessionRow } from "../../lib/admin";
import { countryFlag, formatDateTime, formatDuration } from "../../lib/format";

const RANGES = [
  { value: "1", label: "today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

export default function Journeys() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [days, setDays] = useState("7");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    const since = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
    analytics()
      .schema("analytics")
      .from("sessions")
      .select("*")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(200)
      .then(({ data, error }: { data: SessionRow[] | null; error: unknown }) => {
        if (!active) return;
        if (error) {
          setStatus("error");
          return;
        }
        setSessions((data ?? []).filter((session) => session.pageviews > 0));
        setStatus("ready");
      });
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">range</span>
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="rounded-md border border-ink/60 bg-white px-3 py-1.5 text-sm pop-sm focus:border-accent focus:outline-none"
          >
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">sessions</h2>
          <span className="text-xs text-pencil">{sessions.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">started</th>
                <th className="px-4 py-2 font-medium">journey</th>
                <th className="px-4 py-2 font-medium text-right">pages</th>
                <th className="px-4 py-2 font-medium text-right">span</th>
                <th className="px-4 py-2 font-medium">where</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {sessions.map((session) => (
                <tr key={session.session_hash} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {formatDateTime(session.started_at)}
                  </td>
                  <td className="px-4 py-2">
                    <p className="text-sm">
                      <span className="text-pencil">entry</span> {session.entry_path}
                      <span className="mx-1 text-pencil">→ exit</span> {session.exit_path}
                    </p>
                    {session.path_sequence && session.path_sequence.length > 1 && (
                      <p
                        className="mt-0.5 line-clamp-1 text-xs text-pencil"
                        title={session.path_sequence.join(" → ")}
                      >
                        {session.path_sequence.join(" → ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{session.pageviews}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-pencil">
                    {formatDuration(new Date(session.ended_at).getTime() - new Date(session.started_at).getTime())}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {countryFlag(session.country)}
                    {session.city ? ` ${session.city}` : ""}
                    <span className="block text-xs text-pencil">{session.device_type}</span>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && status === "ready" && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-pencil">
                    no sessions in this range
                  </td>
                </tr>
              )}
              {status === "error" && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-accent-dark">
                    could not load sessions
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
