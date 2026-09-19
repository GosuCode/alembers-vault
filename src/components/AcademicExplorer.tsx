import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Filter from "./Filter";
import SearchBar from "./SearchBar";
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
    return <p className="py-12 text-sm text-slate-500">Loading archive…</p>;
  }

  if (status === "error") {
    return (
      <p className="py-12 text-sm text-red-400">
        Could not load the academic archive. Please try again later.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <SearchBar value={query} onChange={setQuery} />
        <Filter
          label="Category"
          value={category}
          options={categories}
          onChange={setCategory}
        />
        <Filter
          label="Year"
          value={year}
          options={years}
          onChange={setYear}
        />
      </div>

      <p className="text-sm text-slate-500">
        {filtered.length} of {resources.length} resources
      </p>

      {resources.length === 0 ? (
        <p className="text-slate-500">
          No materials uploaded yet. Use the upload script to add PDFs.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No resources match your filters.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((resource) => (
            <li key={resource.id}>
              <button
                type="button"
                onClick={() => setSelected(resource)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-left transition-colors hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-semibold tracking-tight">
                    {resource.title}
                  </h2>
                  <span className="shrink-0 rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-400">
                    {categoryLabel(resource.category)}
                  </span>
                </div>
                {resource.description ? (
                  <p className="mt-2 text-sm text-slate-400">
                    {resource.description}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                  {resource.course ? <span>{resource.course}</span> : null}
                  {resource.year ? <span>{resource.year}</span> : null}
                  {resource.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-semibold tracking-tight">{selected.title}</h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              Close
            </button>
          </div>
          <Suspense
            fallback={
              <p className="py-10 text-center text-sm text-slate-500">
                Loading viewer…
              </p>
            }
          >
            <PDFViewer
              url={academicFileUrl(selected.storage_path)}
              title={selected.title}
            />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}
