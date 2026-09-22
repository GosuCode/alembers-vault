#!/usr/bin/env node
// Fill academic_resources.content_text for PDFs and DOCX files.
//
// Strategy (cheap first):
//   - PDF  → `pdftotext` reads the embedded text layer. Only if that comes back
//            empty do we fall back to rasterise (ghostscript) + OCR (tesseract).
//            This avoids wasting minutes OCR-ing born-digital reports.
//   - DOCX → unzip `word/document.xml` and strip the markup.
//
// That text is rendered on each paper page, which is the biggest SEO lever
// (searches can match document contents). Project reports are extracted too so
// the text is available if/when the project pages render it.
//
// Tools: `pdftotext` always; `gs` + `tesseract` only for scanned PDFs; `unzip`
// only for DOCX.
//   sudo apt-get install -y poppler-utils ghostscript tesseract-ocr unzip
//
// Usage:
//   node --env-file=.env scripts/ocr-papers.mjs [--force] [--limit N] [--only CACS251]
//
// Idempotent: skips rows that already have content_text unless --force.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  if (key === "force") {
    flags.force = true;
    continue;
  }
  flags[key] = args[i + 1];
  i += 1;
}

function hasCommand(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasCommand("pdftotext")) {
  console.error(
    'Error: "pdftotext" not found on PATH.\n' +
      "Install with: sudo apt-get install -y poppler-utils",
  );
  process.exit(1);
}

const OCR_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

/** Pull the embedded text layer from a PDF, if any. */
function pdfText(file) {
  try {
    return execFileSync("pdftotext", ["-q", file, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

/** Rasterise + OCR a scanned PDF page by page. */
function pdfOcr(file, dir) {
  if (!hasCommand("gs") || !hasCommand("tesseract")) {
    throw new Error("scanned PDF needs ghostscript + tesseract (not installed)");
  }
  execFileSync(
    "gs",
    ["-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r300", `-sOutputFile=${dir}/page-%03d.png`, file],
    { stdio: "ignore" },
  );
  const pages = readdirSync(dir).filter((name) => name.endsWith(".png")).sort();
  let text = "";
  for (const page of pages) {
    text +=
      execFileSync("tesseract", [join(dir, page), "stdout", "-l", "eng"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }) + "\n";
  }
  return text;
}

/** Extract readable text from a DOCX without adding a dependency. */
function docxText(file) {
  if (!hasCommand("unzip")) {
    throw new Error("DOCX extraction needs the `unzip` command (not installed)");
  }
  const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalize(text) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let request = supabase
  .from("academic_resources")
  .select("id, title, storage_path, mime_type")
  .in("mime_type", [PDF_MIME, OCR_MIME])
  .order("semester", { ascending: true });

if (!flags.force) request = request.is("content_text", null);
if (flags.only) request = request.ilike("course", flags.only);

const { data, error } = await request;
if (error) {
  console.error(`Could not load resources: ${error.message}`);
  process.exit(1);
}

const rows = flags.limit ? data.slice(0, Number(flags.limit)) : data;
if (rows.length === 0) {
  console.log("Nothing to do (all files already have text; use --force to redo).");
  process.exit(0);
}

console.log(`Extracting text for ${rows.length} file(s)`);

let ok = 0;
let failed = 0;

for (const row of rows) {
  const { data: pub } = supabase.storage.from("academic").getPublicUrl(row.storage_path);
  const dir = mkdtempSync(join(tmpdir(), "text-"));
  try {
    const res = await fetch(pub.publicUrl);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const extension = extname(row.storage_path).toLowerCase();
    const file = join(dir, `source${extension || ""}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));

    let raw = "";
    let via = "";
    if (row.mime_type === PDF_MIME) {
      raw = pdfText(file);
      if (raw.replace(/\s/g, "").length >= 200) {
        via = "embedded";
      } else {
        raw = pdfOcr(file, dir);
        via = "ocr";
      }
    } else if (row.mime_type === OCR_MIME) {
      raw = docxText(file);
      via = "docx";
    } else {
      throw new Error(`unsupported type ${row.mime_type}`);
    }

    const text = normalize(raw);
    if (text.length < 50) throw new Error("no text extracted");

    const { error: updateError } = await supabase
      .from("academic_resources")
      .update({ content_text: text })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    console.log(`  ✓ ${row.title} (${via}, ${text.length} chars)`);
    ok += 1;
  } catch (err) {
    console.error(`  ✗ ${row.title}: ${err.message}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`Done. ${ok} updated, ${failed} failed.`);
