#!/usr/bin/env node
// Fill academic_resources.content_text for PDFs and DOCX files.
//
// Strategy (cheap first):
//   - PDF  → `pdftotext -layout` reads the embedded text layer, keeping the
//            original reading order/spacing (matters for mark-allocation
//            columns like "[2+3]"). Only if that comes back empty do we fall
//            back to OCR (tesseract), most papers here being phone photos of
//            a printed paper turned into a PDF, not born-digital text.
//            For the OCR path we prefer the embedded photo at its native
//            resolution (`pdfimages`) over re-rasterising at a fixed 300dpi
//            (`gs`), since a re-rasterise only downsamples a phone photo that's
//            usually well above 300dpi. `gs` is kept as a fallback for pages
//            that aren't a single full-page scan (e.g. a born-digital PDF with
//            small inline images, where `pdfimages` would return fragments).
//   - DOCX → unzip `word/document.xml` and strip the markup.
//
// That text is rendered on each paper page, which is the biggest SEO lever
// (searches can match document contents). Project reports are extracted too so
// the text is available if/when the project pages render it.
//
// Tools: `pdftotext`/`pdfimages` always; `gs` + `tesseract` only for scanned
// PDFs; `unzip` only for DOCX.
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
    return execFileSync("pdftotext", ["-q", "-layout", file, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

/**
 * If every page is a single full-bleed photo (a phone-scanned paper), pull
 * those images out at their native resolution instead of re-rasterising with
 * `gs` at a fixed 300dpi. Returns null when the PDF doesn't look like that
 * (e.g. a born-digital PDF whose only images are small inline figures), so
 * the caller can fall back to `gs`.
 */
function scannedPageImages(file, dir) {
  let listing;
  try {
    listing = execFileSync("pdfimages", ["-list", file], { encoding: "utf8" });
  } catch {
    return null;
  }
  const rows = listing.trim().split("\n").slice(2).filter(Boolean);
  const looksLikeFullPageScans =
    rows.length > 0 &&
    rows.every((row) => {
      const cols = row.trim().split(/\s+/);
      const width = Number(cols[3]);
      const height = Number(cols[4]);
      return Math.min(width, height) >= 1000;
    });
  if (!looksLikeFullPageScans) return null;

  execFileSync("pdfimages", ["-all", file, join(dir, "scan")], { stdio: "ignore" });
  const pages = readdirSync(dir)
    .filter((name) => name.startsWith("scan"))
    .sort()
    .map((name) => join(dir, name));
  return pages.length > 0 ? pages : null;
}

/** Rasterise a PDF to one PNG per page with `gs` (fallback path). */
function rasterisePages(file, dir) {
  execFileSync(
    "gs",
    ["-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r300", `-sOutputFile=${dir}/page-%03d.png`, file],
    { stdio: "ignore" },
  );
  return readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => join(dir, name));
}

/** OCR a scanned PDF page by page. */
function pdfOcr(file, dir) {
  if (!hasCommand("tesseract")) {
    throw new Error("scanned PDF needs tesseract (not installed)");
  }

  let pages = scannedPageImages(file, dir);
  if (!pages) {
    if (!hasCommand("gs")) {
      throw new Error("scanned PDF needs ghostscript (not installed)");
    }
    pages = rasterisePages(file, dir);
  }

  let text = "";
  for (const page of pages) {
    // --psm 6 (uniform block of text) reads a single-column exam paper more
    // reliably than the default automatic layout detection (psm 3), which was
    // prone to dropping question numbers and truncating the last line.
    text +=
      execFileSync("tesseract", [page, "stdout", "-l", "eng", "--psm", "6"], {
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
