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

function semesterLabel(semester: number | null): string {
  return semester ? `Semester ${semester}` : "Unsorted";
}

export default function AcademicExplorer() {
  const [resources, setResources] = useState<AcademicResource[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [semester, setSemester] = useState("all");
  const [year, setYear] = useState("all");
  const [selected, setSelected] = useState<AcademicResource | null>(null);

  useEffect(() => {
    let active = true;

    supabase
      .from("academic_resources")
      .select("*")
      .order("semester", { ascending: true, nullsFirst: false })
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
      ...unique.map((value) => ({ value: String(value), label: `Semester ${value}` })),
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
          {groups.map(([semesterValue, items]) => (
            <section key={semesterValue ?? "unsorted"}>
              <div className="flex items-center gap-4">
                <h2 className="font-hand text-3xl whitespace-nowrap">
                  {semesterLabel(semesterValue)}
                </h2>
                <span className="font-hand text-lg text-pencil">
                  {items.length} paper{items.length === 1 ? "" : "s"}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {items.map((resource) => (
                  <li key={resource.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(resource)}
                      className="relative flex h-full w-full flex-col rounded-lg border border-ink/80 bg-white p-5 text-left pop-sm transition duration-200 hover:-translate-y-1"
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
                        {resource.tags
                          .filter((tag) => !/^sem-\d+$/.test(tag))
                          .slice(0, 2)
                          .map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 leading-tight"
                            >
                              #{tag}
                            </span>
                          ))}
                      </div>
                      <span className="mt-4 font-hand text-lg text-accent">
                        view paper →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker"
              >
                close ✕
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
