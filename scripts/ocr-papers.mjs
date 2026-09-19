#!/usr/bin/env node
// OCR scanned question-paper PDFs and store the extracted text in
// academic_resources.content_text. That text is rendered on each paper page,
// which is the single biggest SEO lever (searches can match paper contents).
//
// Requires `gs` (ghostscript) and `tesseract` on PATH:
//   sudo apt-get install -y tesseract-ocr ghostscript
//
// Usage:
//   node --env-file=.env scripts/ocr-papers.mjs [--force] [--limit N] [--only CACS251]
//
// Idempotent: skips rows that already have content_text unless --force.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

for (const tool of ["gs", "tesseract"]) {
  if (!hasCommand(tool)) {
    console.error(
      `Error: "${tool}" not found on PATH.\n` +
        "Install with:\n" +
        "  sudo apt-get install -y tesseract-ocr ghostscript",
    );
    process.exit(1);
  }
}

const { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
  );
  process.exit(1);
}

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let request = supabase
  .from("academic_resources")
  .select("id, title, storage_path, mime_type")
  .eq("mime_type", "application/pdf")
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
  console.log("Nothing to do (all PDFs already have text; use --force to redo).");
  process.exit(0);
}

console.log(`OCR: ${rows.length} PDF(s)`);

let ok = 0;
let failed = 0;

for (const row of rows) {
  const { data: pub } = supabase.storage
    .from("academic")
    .getPublicUrl(row.storage_path);
  const dir = mkdtempSync(join(tmpdir(), "ocr-"));
  try {
    const res = await fetch(pub.publicUrl);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const pdf = join(dir, "paper.pdf");
    writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));

    execFileSync(
      "gs",
      [
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=png16m",
        "-r300",
        `-sOutputFile=${dir}/page-%03d.png`,
        pdf,
      ],
      { stdio: "ignore" },
    );

    const pages = readdirSync(dir)
      .filter((file) => file.endsWith(".png"))
      .sort();

    let text = "";
    for (const page of pages) {
      text +=
        execFileSync("tesseract", [join(dir, page), "stdout", "-l", "eng"], {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        }) + "\n";
    }

    text = text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) throw new Error("no text extracted");

    const { error: updateError } = await supabase
      .from("academic_resources")
      .update({ content_text: text })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    console.log(`  ✓ ${row.title} (${pages.length}p, ${text.length} chars)`);
    ok += 1;
  } catch (err) {
    console.error(`  ✗ ${row.title}: ${err.message}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`Done. ${ok} updated, ${failed} failed.`);
