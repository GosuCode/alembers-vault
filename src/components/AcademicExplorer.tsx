import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Filter from "./Filter";
import SearchBar from "./SearchBar";
import OfficeViewer from "./OfficeViewer";
import {
  academicFileUrl,
  supabase,
  type AcademicResource,
} from "../lib/supabase";

const PDFViewer = lazy(() => import("./PDFViewer"));

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

function fileKind(resource: AcademicResource): string {
  return isPdf(resource) ? "PDF" : "DOCX";
}

export default function AcademicExplorer() {
  const [resources, setResources] = useState<AcademicResource[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [year, setYear] = useState("all");
  const [selected, setSelected] = useState<AcademicResource | null>(null);

  useEffect(() => {
    let active = true;

    supabase
      .from("academic_resources")
      .select("*")
      .order("year", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load academic resources", error);
          setStatus("error");
          return;
        }
        setResources(data ?? []);
        setStatus("ready");
      });

    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(resources.map((resource) => resource.category)),
    ).sort();
    return [
      { value: "all", label: "All categories" },
      ...unique.map((value) => ({ value, label: categoryLabel(value) })),
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
  }, [resources, query, category, year]);

  if (status === "loading") {
    return <p className="py-12 text-sm text-muted">Loading archive…</p>;
  }

  if (status === "error") {
    return (
      <p className="py-12 text-sm text-coral-dark">
        Could not load the academic archive. Please try again later.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <SearchBar value={query} onChange={setQuery} />
        <Filter
          label="Category"
          value={category}
          options={categories}
          onChange={setCategory}
        />
        <Filter label="Year" value={year} options={years} onChange={setYear} />
      </div>

      <p className="text-sm text-muted">
        Showing <span className="font-semibold text-ink">{filtered.length}</span>{" "}
        of {resources.length} resources
      </p>

      {resources.length === 0 ? (
        <p className="text-muted">
          No materials uploaded yet. Use the upload script to add PDF or DOCX
          files.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted">No resources match your filters.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((resource) => (
            <li key={resource.id}>
              <button
                type="button"
                onClick={() => setSelected(resource)}
                className="w-full rounded-3xl border border-line bg-surface p-6 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold leading-snug">
                    {resource.title}
                  </h2>
                  <span className="shrink-0 rounded-full bg-peach/50 px-3 py-1 text-xs font-semibold text-coral-dark">
                    {categoryLabel(resource.category)}
                  </span>
                </div>
                {resource.description ? (
                  <p className="mt-2 text-sm text-muted">
                    {resource.description}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded-full border border-line bg-cream px-2.5 py-0.5 font-medium">
                    {fileKind(resource)}
                  </span>
                  {resource.course ? (
                    <span className="rounded-full border border-line bg-cream px-2.5 py-0.5">
                      {resource.course}
                    </span>
                  ) : null}
                  {resource.year ? (
                    <span className="rounded-full border border-line bg-cream px-2.5 py-0.5">
                      {resource.year}
                    </span>
                  ) : null}
                  {resource.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-line bg-cream px-2.5 py-0.5"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <section
          id="viewer"
          className="rounded-3xl border border-line bg-surface p-6 shadow-sm"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">
              {selected.title}
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full border border-line px-3 py-1 text-sm text-muted transition hover:border-coral hover:text-coral-dark"
            >
              Close
            </button>
          </div>
          {isPdf(selected) ? (
            <Suspense
              fallback={
                <p className="py-10 text-center text-sm text-muted">
                  Loading viewer…
                </p>
              }
            >
              <PDFViewer
                url={academicFileUrl(selected.storage_path)}
                title={selected.title}
              />
            </Suspense>
          ) : (
            <OfficeViewer
              url={academicFileUrl(selected.storage_path)}
              title={selected.title}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
