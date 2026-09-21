import { useEffect, useMemo, useState } from "react";
import Filter from "./Filter";
import SearchBar from "./SearchBar";
import DocumentViewer from "./DocumentViewer";
import { getSupabase, academicFileUrl, type AcademicResource } from "../lib/supabase";
import { slugFor } from "../lib/academic";

const CATEGORY_LABELS: Record<string, string> = {
  "past-paper": "Past paper",
  "project-pdf": "Project PDF",
  notes: "Notes",
  other: "Other",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function isPdf(resource: AcademicResource): boolean {
  if (resource.mime_type) return resource.mime_type === "application/pdf";
  return resource.storage_path.toLowerCase().endsWith(".pdf");
}

// Project reports/guidelines live on their project pages and have no
// `/academic/<slug>/` route, so keep them out of this list.
function isPaper(resource: AcademicResource): boolean {
  return resource.category !== "project-pdf";
}

function fileKind(resource: AcademicResource): string {
  return isPdf(resource) ? "PDF" : "DOCX";
}

function semesterLabel(semester: number | null): string {
  return semester ? `Semester ${semester}` : "Unsorted";
}

/** How many papers show per semester group before a "show more" button. */
const GROUP_PAGE = 6;

interface Props {
  initialResources?: AcademicResource[];
}

export default function AcademicExplorer({
  initialResources = [],
}: Props) {
  const [resources, setResources] = useState<AcademicResource[]>(
    initialResources.filter(isPaper),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    initialResources.length > 0 ? "ready" : "loading",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [semester, setSemester] = useState("all");
  const [year, setYear] = useState("all");
  const [selected, setSelected] = useState<AcademicResource | null>(null);
  const [expanded, setExpanded] = useState<Record<string, number>>({});

  // Reset "show more" pagination whenever the filters change.
  useEffect(() => {
    setExpanded({});
  }, [query, category, semester, year]);

  // Refresh from Supabase on load so uploads show without a rebuild.
  useEffect(() => {
    let active = true;
    try {
      getSupabase()
        .from("academic_resources")
        .select("*")
        .neq("category", "project-pdf")
        .order("semester", { ascending: true, nullsFirst: false })
        .order("year", { ascending: false, nullsFirst: false })
        .order("title", { ascending: true })
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            console.error("Failed to load academic resources", error);
            setStatus((current) => (current === "ready" ? current : "error"));
            return;
          }
          setResources((data ?? []).filter(isPaper));
          setStatus("ready");
        });
    } catch (error) {
      console.error(error);
      if (active) setStatus((current) => (current === "ready" ? current : "error"));
    }
    return () => {
      active = false;
    };
  }, []);

  // Close the viewer on Escape and lock background scroll while open.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(resources.map((resource) => resource.category)),
    ).sort();
    return [
      { value: "all", label: "All categories" },
      ...unique.map((value) => ({ value, label: categoryLabel(value) })),
    ];
  }, [resources]);

  const semesters = useMemo(() => {
    const unique = Array.from(
      new Set(
        resources
          .map((resource) => resource.semester)
          .filter((value): value is number => value !== null),
      ),
    ).sort((a, b) => a - b);
    return [
      { value: "all", label: "All semesters" },
      ...unique.map((value) => ({
        value: String(value),
        label: `Semester ${value}`,
      })),
    ];
  }, [resources]);

  const years = useMemo(() => {
    const unique = Array.from(
      new Set(
        resources
          .map((resource) => resource.year)
          .filter((value): value is number => value !== null),
      ),
    ).sort((a, b) => b - a);
    return [
      { value: "all", label: "All years" },
      ...unique.map((value) => ({ value: String(value), label: String(value) })),
    ];
  }, [resources]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resources.filter((resource) => {
      if (category !== "all" && resource.category !== category) return false;
      if (semester !== "all" && String(resource.semester) !== semester)
        return false;
      if (year !== "all" && String(resource.year) !== year) return false;
      if (!needle) return true;
      const haystack = [
        resource.title,
        resource.description ?? "",
        resource.course ?? "",
        ...resource.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [resources, query, category, semester, year]);

  // Log searches/filters (debounced) with the result count — powers the
  // search-term and zero-result views in the dashboard.
  useEffect(() => {
    if (status !== "ready") return;
    const active =
      query.trim() !== "" || category !== "all" || semester !== "all" || year !== "all";
    if (!active) return;
    const handle = window.setTimeout(() => {
      window.__vaultTrack?.({
        event_type: "search",
        meta: {
          query: query.trim(),
          category,
          semester,
          year,
          results: filtered.length,
        },
      });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [query, category, semester, year, filtered.length, status]);

  const groups = useMemo(() => {
    const map = new Map<number | null, AcademicResource[]>();
    for (const resource of filtered) {
      const key = resource.semester ?? null;
      const bucket = map.get(key);
      if (bucket) bucket.push(resource);
      else map.set(key, [resource]);
    }
    return Array.from(map.entries()).sort(
      (a, b) => (a[0] ?? 99) - (b[0] ?? 99),
    );
  }, [filtered]);

  if (status === "loading") {
    return (
      <p className="font-hand text-2xl text-pencil">opening the cabinet…</p>
    );
  }

  if (status === "error") {
    return (
      <p className="text-accent-dark">
        Could not load the academic archive. Please try again later.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <Filter
          label="semester"
          value={semester}
          options={semesters}
          onChange={setSemester}
        />
        <Filter
          label="category"
          value={category}
          options={categories}
          onChange={setCategory}
        />
        <Filter label="year" value={year} options={years} onChange={setYear} />
      </div>

      <p className="font-hand text-xl text-pencil">
        {filtered.length} of {resources.length} papers in the drawer
      </p>

      {resources.length === 0 ? (
        <p className="text-pencil">
          Nothing filed yet — add a PDF or DOCX with the upload script.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-pencil">Nothing matches that filter.</p>
      ) : (
        <div className="flex flex-col gap-12">
          {groups.map(([semesterValue, items]) => {
            const groupKey = String(semesterValue ?? "unsorted");
            const shown = expanded[groupKey] ?? GROUP_PAGE;
            const visibleItems = items.slice(0, shown);
            const remaining = items.length - visibleItems.length;
            return (
              <section key={groupKey}>
                <div className="flex items-center gap-4">
                  <h2 className="font-hand text-3xl whitespace-nowrap">
                    {semesterLabel(semesterValue)}
                  </h2>
                  <span className="font-hand text-lg text-pencil">
                    {items.length} paper{items.length === 1 ? "" : "s"}
                    {items.length > GROUP_PAGE &&
                      ` · showing ${visibleItems.length}`}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                  {visibleItems.map((resource) => (
                    <li
                      key={resource.id}
                      className="relative"
                    >
                      <a
                        href={`/academic/${slugFor(resource)}/`}
                        className="relative flex h-full flex-col rounded-lg border border-ink/80 bg-white p-5 pr-20 pop-sm transition duration-200 hover:-translate-y-1"
                      >
                        <h3 className="text-base font-semibold leading-snug">
                          {resource.title}
                        </h3>
                        {resource.description ? (
                          <p className="mt-2 line-clamp-2 text-sm text-pencil">
                            {resource.description}
                          </p>
                        ) : null}
                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 font-hand text-base text-pencil">
                          <span className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 leading-tight">
                            {fileKind(resource)}
                          </span>
                          {resource.course ? (
                            <span className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 leading-tight">
                              {resource.course}
                            </span>
                          ) : null}
                          {resource.year ? (
                            <span className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 leading-tight">
                              {resource.year}
                            </span>
                          ) : null}
                        </div>
                        <span className="mt-3 font-hand text-lg text-accent">
                          open paper →
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setSelected(resource)}
                        aria-label={`Quick preview: ${resource.title}`}
                        className="absolute right-3 top-3 z-10 rounded-md border border-ink/70 bg-white px-2.5 py-1 font-hand text-base leading-tight transition hover:bg-marker"
                      >
                        preview
                      </button>
                    </li>
                  ))}
                </ul>

                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [groupKey]: shown + GROUP_PAGE,
                      }))
                    }
                    className="mt-5 rounded-md border border-ink/70 bg-white px-4 py-1.5 font-hand text-lg leading-tight pop-sm transition hover:-translate-y-0.5 hover:bg-marker"
                  >
                    show {Math.min(remaining, GROUP_PAGE)} more →
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
          onClick={() => setSelected(null)}
        >
          <div
            className="relative my-auto w-full max-w-4xl rounded-lg border border-ink bg-paper p-5 pop sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="tape -top-3 left-10 -rotate-3"></span>
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-dashed border-line pb-4">
              <div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-1 font-hand text-lg text-pencil">
                  {semesterLabel(selected.semester)}
                  {selected.course ? ` · ${selected.course}` : ""}
                  {selected.year ? ` · ${selected.year}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/academic/${slugFor(selected)}/`}
                  className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker"
                >
                  details ↗
                </a>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker"
                >
                  close ✕
                </button>
              </div>
            </div>

            <DocumentViewer
              url={academicFileUrl(selected.storage_path)}
              title={selected.title}
              isPdf={isPdf(selected)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
