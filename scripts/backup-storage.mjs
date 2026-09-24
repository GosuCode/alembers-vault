#!/usr/bin/env node
// Download every object in a Supabase Storage bucket to a local directory.
// Complements the database dump (which only stores object metadata, not bytes).
//
// Usage:
//   node --env-file=.env scripts/backup-storage.mjs --out backup/<stamp>/storage \
//     [--bucket academic]
//
// Requires PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = { bucket: "academic", out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--bucket") args.bucket = argv[++i];
  }
  return args;
}

const { bucket, out } = parseArgs(process.argv.slice(2));
if (!out) {
  console.error("Error: --out <dir> is required.");
  process.exit(1);
}

const { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Run with: node --env-file=.env scripts/backup-storage.mjs --out <dir>",
  );
  process.exit(1);
}

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function listAll(path, acc) {
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, { limit, offset });
    if (error) throw new Error(`list ${path || "/"}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const child = path ? `${path}/${entry.name}` : entry.name;
      if (entry.metadata) acc.push(child);
      else await listAll(child, acc);
    }
    if (data.length < limit) break;
  }
}

const objects = [];
await listAll("", objects);
console.log(`Found ${objects.length} objects in bucket "${bucket}".`);

let bytes = 0;
for (const objectPath of objects) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw new Error(`download ${objectPath}: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  const target = join(out, bucket, objectPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  bytes += buffer.byteLength;
  console.log(`  ${objectPath} (${buffer.byteLength} bytes)`);
}

const manifest = {
  bucket,
  generated_at: new Date().toISOString(),
  object_count: objects.length,
  total_bytes: bytes,
  objects,
};
await mkdir(join(out, bucket), { recursive: true });
await writeFile(join(out, bucket, "_manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Backed up ${objects.length} objects (${bytes} bytes) to ${out}.`);
