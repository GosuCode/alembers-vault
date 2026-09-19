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
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <SearchBar value={query} onChange={setQuery} />
        <Filter
          label="category"
          value={category}
          options={categories}
          onChange={setCategory}
        />
        <Filter label="year" value={year} options={years} onChange={setYear} />
      </div>

      <p className="font-hand text-xl text-pencil">
        {filtered.length} of {resources.length} in the drawer
      </p>

      {resources.length === 0 ? (
        <p className="text-pencil">
          Nothing filed yet — add a PDF or DOCX with the upload script.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-pencil">Nothing matches that filter.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((resource) => (
            <li key={resource.id}>
              <button
                type="button"
                onClick={() => setSelected(resource)}
                className="relative block h-full w-full rounded-lg border border-ink/80 bg-white p-5 text-left pop-sm transition duration-200 hover:-translate-y-1"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-base font-semibold leading-snug">
                    {resource.title}
                  </h2>
                  <span className="shrink-0 -rotate-2 rounded-full border border-ink/70 bg-marker px-2.5 py-0.5 font-hand text-base leading-tight">
                    {categoryLabel(resource.category)}
                  </span>
                </div>
                {resource.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-pencil">
                    {resource.description}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2 font-hand text-base text-pencil">
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
                  {resource.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 leading-tight"
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
          className="relative rounded-lg border border-ink/80 bg-white p-6 pop"
        >
          <span className="tape -top-3 left-10 -rotate-3"></span>
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">{selected.title}</h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker"
            >
              close
            </button>
          </div>
          {isPdf(selected) ? (
            <Suspense
              fallback={
                <p className="py-10 text-center font-hand text-xl text-pencil">
                  loading the pages…
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
