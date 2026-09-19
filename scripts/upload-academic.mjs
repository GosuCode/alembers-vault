#!/usr/bin/env node
// Upload an academic PDF to the `academic` bucket and register its metadata.
//
// Usage:
//   node --env-file=.env scripts/upload-academic.mjs <file.pdf> --title "..." \
//     [--description "..."] [--category past-paper|project-pdf|notes|other] \
//     [--course "..."] [--year 2024] [--tags math,final] [--overwrite]
//
// Requires PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const file = args.shift();

if (!file || file.startsWith("--")) {
  console.error("Error: provide a PDF file path as the first argument.");
  process.exit(1);
}

const flags = {};
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  if (key === "overwrite") {
    flags.overwrite = true;
    continue;
  }
  flags[key] = args[i + 1];
  i += 1;
}

const { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Run with: node --env-file=.env scripts/upload-academic.mjs ...",
  );
  process.exit(1);
}

const CATEGORIES = ["past-paper", "project-pdf", "notes", "other"];
const category = flags.category ?? "past-paper";
if (!CATEGORIES.includes(category)) {
  console.error(`Error: --category must be one of ${CATEGORIES.join(", ")}`);
  process.exit(1);
}

const title = flags.title;
if (!title) {
  console.error('Error: --title is required, e.g. --title "Data Structures Final 2024".');
  process.exit(1);
}

const year = flags.year ? Number.parseInt(flags.year, 10) : null;
if (flags.year && Number.isNaN(year)) {
  console.error("Error: --year must be a number.");
  process.exit(1);
}

if (extname(file).toLowerCase() !== ".pdf") {
  console.error("Error: only .pdf uploads are supported by the academic bucket.");
  process.exit(1);
}

const { size } = await stat(file);
const MAX_BYTES = 50 * 1024 * 1024;
if (size > MAX_BYTES) {
  console.error(
    `Error: ${(size / 1024 / 1024).toFixed(1)} MB exceeds the 50 MB free-tier limit.`,
  );
  process.exit(1);
}

const slug = basename(file)
  .toLowerCase()
  .replace(/[^a-z0-9.]+/g, "-")
  .replace(/^-+|-+$/g, "");
const storagePath = `${category}/${year ?? "undated"}/${slug}`;

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const body = await readFile(file);

const upload = await supabase.storage.from("academic").upload(storagePath, body, {
  contentType: "application/pdf",
  upsert: Boolean(flags.overwrite),
});

if (upload.error) {
  console.error(`Upload failed: ${upload.error.message}`);
  process.exit(1);
}

const tags = flags.tags
  ? flags.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
  : [];

const record = {
  title,
  description: flags.description ?? null,
  category,
  course: flags.course ?? null,
  year,
  tags,
  storage_path: storagePath,
  file_size: size,
  mime_type: "application/pdf",
};

if (flags.overwrite) {
  const { error } = await supabase
    .from("academic_resources")
    .upsert(record, { onConflict: "storage_path" });
  if (error) {
    console.error(`Metadata upsert failed: ${error.message}`);
    process.exit(1);
  }
} else {
  const { error } = await supabase.from("academic_resources").insert(record);
  if (error) {
    console.error(`Metadata insert failed: ${error.message}`);
    process.exit(1);
  }
}

console.log(`Uploaded ${storagePath} (${(size / 1024).toFixed(0)} KB)`);
console.log(`Registered: ${title}`);
