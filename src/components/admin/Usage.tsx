import { useEffect, useState } from "react";
import { getAuthClient } from "../../lib/admin";

interface Usage {
  db_bytes: number;
  storage_bytes: number;
  storage_objects: number;
  resources: number;
}

const DB_LIMIT = 500 * 1024 * 1024;
const STORAGE_LIMIT = 1024 * 1024 * 1024;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  const warn = pct >= 80;
  return (
    <div className="rounded-lg border border-ink/60 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-hand text-xl">{label}</p>
        <p className="text-sm text-pencil">
          {mb(used)} <span className="opacity-60">/ {mb(limit)}</span>
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-deep">
        <div
          className={`h-full rounded-full ${warn ? "bg-accent-dark" : "bg-accent"}`}
          style={{ width: `${Math.max(1, pct)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-pencil">{pct.toFixed(1)}% of the free tier</p>
    </div>
  );
}

export default function Usage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getAuthClient()
      .rpc("admin_usage")
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError || !data) {
          setError("Could not read usage stats.");
          return;
        }
        setUsage(data as unknown as Usage);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-accent-dark">{error}</p>;
  if (!usage) return <p className="font-hand text-2xl text-pencil">weighing the shelf…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Meter label="database" used={usage.db_bytes} limit={DB_LIMIT} />
        <Meter label="file storage" used={usage.storage_bytes} limit={STORAGE_LIMIT} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-ink/60 bg-white p-5">
          <p className="font-hand text-xl text-pencil">stored files</p>
          <p className="mt-2 text-3xl font-semibold">{usage.storage_objects}</p>
        </div>
        <div className="rounded-lg border border-ink/60 bg-white p-5">
          <p className="font-hand text-xl text-pencil">resource rows</p>
          <p className="mt-2 text-3xl font-semibold">{usage.resources}</p>
        </div>
      </div>
      <p className="text-xs text-pencil">
        Free-tier ceilings: 500 MB database, 1 GB storage, 50 MB per file. Keep an
        eye on these before uploading large scans.
      </p>
    </div>
  );
}
