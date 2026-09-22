import { useEffect, useState } from "react";
import { analytics, type DownloadRow, type TopLinkRow } from "../../lib/admin";
import type { SiteId } from "./sites";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-ink/60 bg-white p-4 pop-sm">
      <p className="font-hand text-lg leading-none text-pencil">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export default function Links({ site }: { site: SiteId }) {
  const [links, setLinks] = useState<TopLinkRow[]>([]);
  const [downloads, setDownloads] = useState<DownloadRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const sb = analytics();
    Promise.all([
      sb.schema("analytics").from("top_links").select("*").eq("site", site).order("clicks", { ascending: false }).limit(100),
      sb
        .schema("analytics")
        .from("downloads")
        .select("*")
        .eq("site", site)
        .order("downloads", { ascending: false })
        .limit(100),
    ]).then(
      ([linksRes, downloadsRes]: Array<{ data: unknown[] | null; error: unknown }>) => {
        if (!active) return;
        if (linksRes.error || downloadsRes.error) {
          setStatus("error");
          return;
        }
        setLinks((linksRes.data ?? []) as TopLinkRow[]);
        setDownloads((downloadsRes.data ?? []) as DownloadRow[]);
        setStatus("ready");
      },
    );
    return () => {
      active = false;
    };
  }, [site]);

  if (status === "loading") {
    return <p className="font-hand text-2xl text-pencil">following the links…</p>;
  }
  if (status === "error") {
    return <p className="text-accent-dark">Could not load links.</p>;
  }

  const totalClicks = links.reduce((sum, row) => sum + row.clicks, 0);
  const external = links.filter((row) => row.link_kind !== "internal" && row.link_kind !== "anchor");
  const externalClicks = external.reduce((sum, row) => sum + row.clicks, 0);
  const totalDownloads = downloads.reduce((sum, row) => sum + row.downloads, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="total clicks" value={totalClicks} />
        <Stat label="outbound clicks" value={externalClicks} />
        <Stat label="distinct links" value={links.length} />
        <Stat label="file downloads" value={totalDownloads} />
      </div>

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">most clicked links</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">label</th>
                <th className="px-4 py-2 font-medium">kind</th>
                <th className="px-4 py-2 font-medium">destination</th>
                <th className="px-4 py-2 font-medium text-right">clicks</th>
                <th className="px-4 py-2 font-medium text-right">visitors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {links.map((row) => (
                <tr key={row.link_url}>
                  <td className="max-w-[14rem] px-4 py-2">
                    <span className="block truncate" title={row.link_text ?? ""}>
                      {row.link_text || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">{row.link_kind || "—"}</td>
                  <td className="max-w-[20rem] px-4 py-2">
                    <a
                      href={row.link_url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-accent hover:text-accent-dark"
                      title={row.link_url ?? ""}
                    >
                      {row.link_url}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{row.clicks}</td>
                  <td className="px-4 py-2 text-right text-pencil">{row.visitors}</td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-pencil">
                    no clicks recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">file downloads</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">file</th>
                <th className="px-4 py-2 font-medium">slug</th>
                <th className="px-4 py-2 font-medium text-right">downloads</th>
                <th className="px-4 py-2 font-medium text-right">visitors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {downloads.map((row) => (
                <tr key={row.link_url}>
                  <td className="max-w-[20rem] px-4 py-2">
                    <span className="block truncate" title={row.link_url}>
                      {row.label || row.link_url}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">{row.content_slug || "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold">{row.downloads}</td>
                  <td className="px-4 py-2 text-right text-pencil">{row.visitors}</td>
                </tr>
              ))}
              {downloads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-pencil">
                    no downloads recorded yet
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
