import { useEffect, useState, type ChangeEvent } from "react";
import { getAuthClient, triggerRebuild } from "../../lib/admin";
import type { AcademicResource } from "../../lib/supabase";
import { formatDateTime } from "../../lib/format";

const CATEGORIES = ["past-paper", "project-pdf", "notes", "other"];
const MAX_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const inputClass =
  "rounded-md border border-ink/60 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

interface FormState {
  title: string;
  description: string;
  category: string;
  course: string;
  year: string;
  semester: string;
  tags: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  category: "past-paper",
  course: "",
  year: "",
  semester: "",
  tags: "",
};

function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromName(name: string): string {
  return safeFilename(name).replace(/\.[a-z0-9]+$/i, "");
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function formFromResource(resource: AcademicResource): FormState {
  return {
    title: resource.title,
    description: resource.description ?? "",
    category: resource.category,
    course: resource.course ?? "",
    year: resource.year ? String(resource.year) : "",
    semester: resource.semester ? String(resource.semester) : "",
    tags: resource.tags.join(", "),
  };
}

export default function Academics() {
  const [resources, setResources] = useState<AcademicResource[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<AcademicResource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await getAuthClient()
      .from("academic_resources")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setStatus("error");
      return;
    }
    setResources(data ?? []);
    setStatus("ready");
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setFile(null);
    setOverwrite(false);
    setShowForm(false);
    setMessage("");
  }

  function startEdit(resource: AcademicResource) {
    setEditing(resource);
    setForm(formFromResource(resource));
    setFile(null);
    setShowForm(true);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    if (picked && !form.title) {
      setForm((current) => ({
        ...current,
        title: picked.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
      }));
    }
  }

  function parseCommon() {
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const semester = form.semester ? Number.parseInt(form.semester, 10) : null;
    if (semester && !tags.includes(`sem-${semester}`)) tags.push(`sem-${semester}`);
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      course: form.course.trim() || null,
      year: form.year ? Number.parseInt(form.year, 10) : null,
      semester,
      tags,
    };
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    const common = parseCommon();
    if (!common.title) {
      setMessage("A title is required.");
      setBusy(false);
      return;
    }

    try {
      if (editing) {
        const { error } = await getAuthClient()
          .from("academic_resources")
          .update(common)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        if (!file) {
          setMessage("Pick a PDF or DOCX file.");
          setBusy(false);
          return;
        }
        const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
        const mimeType = MIME_BY_EXTENSION[extension];
        if (!mimeType) {
          setMessage("Only .pdf and .docx files are allowed.");
          setBusy(false);
          return;
        }
        if (file.size > MAX_BYTES) {
          setMessage("File exceeds the 50 MB limit.");
          setBusy(false);
          return;
        }

        const filename = safeFilename(file.name);
        const storagePath = `${common.category}/${common.year ?? "undated"}/${filename}`;
        const supabase = getAuthClient();
        const upload = await supabase.storage.from("academic").upload(storagePath, file, {
          contentType: mimeType,
          cacheControl: "31536000",
          upsert: overwrite,
        });
        if (upload.error) throw upload.error;

        const { error } = await supabase.from("academic_resources").insert({
          ...common,
          storage_path: storagePath,
          slug: slugFromName(file.name),
          file_size: file.size,
          mime_type: mimeType,
        });
        if (error) {
          if (!overwrite) {
            await supabase.storage.from("academic").remove([storagePath]);
          }
          throw error;
        }
      }
      resetForm();
      await load();
      // Static pages refresh on the next build; fire-and-forget.
      void triggerRebuild();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(resource: AcademicResource) {
    if (!window.confirm(`Delete “${resource.title}” and its file? This cannot be undone.`)) {
      return;
    }
    const supabase = getAuthClient();
    await supabase.storage.from("academic").remove([resource.storage_path]);
    const { error } = await supabase.from("academic_resources").delete().eq("id", resource.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
    void triggerRebuild();
  }

  if (status === "loading") {
    return <p className="font-hand text-2xl text-pencil">opening the cabinet…</p>;
  }
  if (status === "error") {
    return <p className="text-accent-dark">Could not load the archive.</p>;
  }

  const filtered = resources.filter((resource) => {
    if (category !== "all" && resource.category !== category) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [resource.title, resource.course ?? "", resource.slug ?? "", ...resource.tags]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="title, course, slug…"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-hand text-base leading-none text-pencil">category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={inputClass}
          >
            <option value="all">all</option>
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="rounded-md border border-ink/80 bg-accent px-5 py-2 text-sm font-semibold text-white pop-sm transition hover:-translate-y-0.5 hover:bg-accent-dark"
        >
          {showForm ? "cancel" : "add document"}
        </button>
      </div>

      {showForm && (
        <section className="rounded-lg border border-ink/60 bg-white p-5">
          <h2 className="font-hand text-2xl">
            {editing ? `edit “${editing.title}”` : "add a document"}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-pencil">title</span>
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-pencil">description</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={2}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-pencil">category</span>
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className={inputClass}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-pencil">course</span>
              <input
                value={form.course}
                onChange={(event) => setForm({ ...form, course: event.target.value })}
                placeholder="CS201"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-pencil">year</span>
              <input
                type="number"
                value={form.year}
                onChange={(event) => setForm({ ...form, year: event.target.value })}
                placeholder="2024"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-pencil">semester</span>
              <input
                type="number"
                min={1}
                max={12}
                value={form.semester}
                onChange={(event) => setForm({ ...form, semester: event.target.value })}
                placeholder="4"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-pencil">tags (comma separated)</span>
              <input
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="math, final"
                className={inputClass}
              />
            </label>

            {!editing && (
              <>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs uppercase tracking-wide text-pencil">file (PDF or DOCX, ≤50 MB)</span>
                  <input type="file" accept=".pdf,.docx" onChange={onFile} className="text-sm" />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(event) => setOverwrite(event.target.checked)}
                  />
                  overwrite if the storage path already exists
                </label>
              </>
            )}
          </div>

          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-md border border-ink/80 bg-accent px-5 py-2 text-sm font-semibold text-white pop-sm transition hover:bg-accent-dark disabled:opacity-60"
            >
              {busy ? "saving…" : editing ? "save changes" : "upload & add"}
            </button>
            {message && <p className="text-sm text-accent-dark">{message}</p>}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-ink/60 bg-white">
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <h2 className="font-hand text-2xl">documents</h2>
          <span className="text-xs text-pencil">{filtered.length} of {resources.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-deep/50 text-xs uppercase tracking-wide text-pencil">
              <tr>
                <th className="px-4 py-2 font-medium">title</th>
                <th className="px-4 py-2 font-medium">category</th>
                <th className="px-4 py-2 font-medium">sem</th>
                <th className="px-4 py-2 font-medium">year</th>
                <th className="px-4 py-2 font-medium">size</th>
                <th className="px-4 py-2 font-medium">ocr</th>
                <th className="px-4 py-2 font-medium">updated</th>
                <th className="px-4 py-2 font-medium text-right">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filtered.map((resource) => (
                <tr key={resource.id} className="align-top">
                  <td className="max-w-[18rem] px-4 py-2">
                    <span className="block truncate" title={resource.title}>
                      {resource.title}
                    </span>
                    <span className="text-xs text-pencil">{resource.slug}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">{resource.category}</td>
                  <td className="px-4 py-2">{resource.semester ?? "—"}</td>
                  <td className="px-4 py-2">{resource.year ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {formatBytes(resource.file_size)}
                  </td>
                  <td className="px-4 py-2">
                    {resource.content_text ? (
                      <span className="text-pencil">yes</span>
                    ) : (
                      <span className="text-accent-dark">no</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-pencil">
                    {formatDateTime(resource.updated_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(resource)}
                      className="rounded-md border border-ink/60 bg-white px-2.5 py-1 font-hand text-base leading-tight transition hover:bg-marker"
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(resource)}
                      className="ml-2 rounded-md border border-ink/60 bg-white px-2.5 py-1 font-hand text-base leading-tight text-accent-dark transition hover:bg-marker"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-pencil">
                    nothing matches
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
