import { useEffect, useState } from "react";
import { getAuthClient } from "../../lib/admin";

interface RedirectRow {
  from_path: string;
  to_path: string;
  status: number;
  created_at: string;
}

const inputClass =
  "rounded-md border border-ink/60 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

export default function Redirects() {
  const [rows, setRows] = useState<RedirectRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await getAuthClient()
      .from("redirects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setStatus("error");
      return;
    }
    setRows((data ?? []) as RedirectRow[]);
    setStatus("ready");
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const fromPath = from.trim();
    const toPath = to.trim();
    if (!fromPath || !toPath) {
      setMessage("from and to are both required.");
      return;
    }
    const { error } = await getAuthClient()
      .from("redirects")
      .upsert({ from_path: fromPath, to_path: toPath }, { onConflict: "from_path" });
    if (error) {
      setMessage(error.message);
      return;
    }
    setFrom("");
    setTo("");
    setMessage("");
    await load();
  }

  async function remove(fromPath: string) {
    const { error } = await getAuthClient().from("redirects").delete().eq("from_path", fromPath);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  if (status === "loading") {
    return <p className="font-hand text-2xl text-pencil">checking the map…</p>;
  }
  if (status === "error") {
    return <p className="text-accent-dark">Could not load redirects.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-ink/60 bg-white p-5">
        <h2 className="font-hand text-2xl">add a redirect</h2>
        <p className="mt-1 text-xs text-pencil">
          Old path → new path. Followed by the 404 page via <code>/api/redirect</code>.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-pencil">from path</span>
            <input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="/academic/old-slug/"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-pencil">to path</span>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="/academic/new-slug/"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => void add()}
            className="rounded-md border border-ink/80 bg-accent px-5 py-2 text-sm font-semibold text-white pop-sm transition hover:bg-accent-dark"
          >
            add
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-accent-dark">{message}</p>}
      </section>

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">redirects</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
            <tr>
              <th className="px-4 py-2 font-medium">from</th>
              <th className="px-4 py-2 font-medium">to</th>
              <th className="px-4 py-2 font-medium">status</th>
              <th className="px-4 py-2 font-medium text-right">actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((row) => (
              <tr key={row.from_path}>
                <td className="px-4 py-2">{row.from_path}</td>
                <td className="px-4 py-2 text-pencil">{row.to_path}</td>
                <td className="px-4 py-2 text-pencil">{row.status}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void remove(row.from_path)}
                    className="rounded-md border border-ink/60 bg-white px-2.5 py-1 font-hand text-base leading-tight text-accent-dark transition hover:bg-marker"
                  >
                    delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-pencil">
                  no redirects yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
