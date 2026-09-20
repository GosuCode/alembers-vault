#!/usr/bin/env node
// Import selected Medium posts from a Medium data export into the vault blog.
//
// Usage:
//   pnpm import:medium [--export <dir>] [--force]
//
// The export is only read; every post is written to src/content/blog/<slug>.md
// with its images downloaded into src/content/blog/<slug>/. Re-running skips
// posts whose target file exists unless --force is passed.

import { mkdir, readFile, writeFile, access, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(repoRoot, "src/content/blog");

const args = process.argv.slice(2);
const force = args.includes("--force");
const exportFlag = args.indexOf("--export");
const exportDir =
  exportFlag !== -1 && args[exportFlag + 1]
    ? resolve(args[exportFlag + 1])
    : resolve(repoRoot, "../Medium Blog");

// The curated selection. `id` finds the export file (`*<id>.html`) and rewrites
// links between imported posts.
const POSTS = [
  { id: "7d90ab7dbb57", slug: "api-gateway-krakend-microservices", tags: ["api-gateway", "microservices", "krakend", "devops"] },
  { id: "a67ac3a9f1f5", slug: "what-is-redis", tags: ["redis", "caching", "backend", "databases"] },
  { id: "ac94b3ac1c9a", slug: "node-api-rate-limiting", tags: ["node", "rate-limiting", "redis", "security"] },
  { id: "e39174f6d955", slug: "docker-env-backend-vs-frontend", tags: ["docker", "ci-cd", "env", "node"] },
  { id: "742d025d1042", slug: "cors-explained", tags: ["cors", "security", "web", "http"] },
  { id: "63e9178924a6", slug: "free-nodejs-hosting-vercel", tags: ["vercel", "node", "deployment", "hosting"] },
  { id: "ca831d678e13", slug: "nodejs-event-loop-explained", tags: ["node", "event-loop", "javascript", "async"] },
];

const MEMBER_BOILERPLATE =
  /open to everyone|non-member readers|click this link to read|friend link/i;

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripTags = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function fileFor(id) {
  const dir = join(exportDir, "posts");
  const names = await readdir(dir);
  const match = names.find((n) => n.endsWith(`${id}.html`) && !n.startsWith("draft_"));
  if (!match) throw new Error(`No export file for post id ${id}`);
  return join(dir, match);
}

function sanitizeImageName(url, imageId) {
  let raw = imageId || basename(url.split("?")[0]);
  if (!/\.[a-z0-9]+$/i.test(raw)) {
    const ext = (basename(url.split("?")[0]).match(/\.[a-z0-9]+$/i) || [".png"])[0];
    raw += ext;
  }
  return raw.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function imageCandidates(src) {
  const upgraded = src
    .replace(/\/max\/\d+\//, "/max/1600/")
    .replace(/\/resize:fit:\d+\//, "/resize:fit:1600/");
  return [...new Set([upgraded, src])];
}

async function downloadImage(src, dest) {
  for (const url of imageCandidates(src)) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      return true;
    } catch {
      /* try the next candidate */
    }
  }
  return false;
}

// The export repeats the title (and subtitle) at the top of the body, sometimes
// after a leading divider. Drop those duplicates.
function stripLeadingDuplicate(markdown, title, subtitle) {
  const normalize = (s) =>
    s.replace(/[*_`>#\s]+/g, " ").replace(/[^\w\s]/g, "").toLowerCase().trim();
  const lines = markdown.split("\n");
  const dropLeadingBlanks = () => {
    while (lines.length && lines[0].trim() === "") lines.shift();
  };

  dropLeadingBlanks();
  if (lines[0]?.trim() === "---") {
    lines.shift();
    dropLeadingBlanks();
  }

  const asText = (line) => normalize(line.replace(/^#{1,6}\s*/, ""));
  if (lines[0] && asText(lines[0]) === normalize(title)) {
    lines.shift();
    dropLeadingBlanks();
  }
  if (subtitle && lines[0] && asText(lines[0]) === normalize(subtitle)) {
    lines.shift();
    dropLeadingBlanks();
  }

  return lines.join("\n").trim();
}

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    linkStyle: "inlined",
  });
  td.use(gfm);

  td.addRule("mediumCodeBlock", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const lang = node.getAttribute("data-code-block-lang") || "";
      const code = node.textContent.replace(/\u00a0/g, " ").replace(/\s+$/, "");
      const longest = (code.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 2);
      const fence = "`".repeat(Math.max(3, longest + 1));
      return `\n\n${fence}${lang}\n${code}\n${fence}\n\n`;
    },
  });

  return td;
}

async function convertPost(post) {
  const target = join(contentDir, `${post.slug}.md`);
  if (existsSync(target) && !force) {
    console.log(`skip  ${post.slug}.md (exists; use --force to redo)`);
    return { skipped: true };
  }

  const html = await readFile(await fileFor(post.id), "utf8");

  const title =
    stripTags((html.match(/<h1[^>]*class="p-name"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "") ||
    stripTags((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
  const canonical = (html.match(/<a[^>]+href="([^"]+)"[^>]*class="p-canonical"/) || [])[1] || null;
  const published = (html.match(/<time[^>]*class="dt-published"[^>]*datetime="([^"]+)"/) || [])[1] || null;

  let subtitle = stripTags(
    (html.match(/<section[^>]*data-field="subtitle"[^>]*>([\s\S]*?)<\/section>/) || [])[1] || "",
  );
  if (!subtitle || MEMBER_BOILERPLATE.test(subtitle)) subtitle = "";

  const bodyStart = html.indexOf('<section data-field="body"');
  const bodyOpen = html.indexOf(">", bodyStart) + 1;
  let body = html
    .slice(bodyOpen, html.indexOf("<footer"))
    .replace(/(\s*<\/section>\s*)+$/, "")
    .replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/, "");

  await mkdir(join(contentDir, post.slug), { recursive: true });

  // --- images ---------------------------------------------------------------
  const srcMap = new Map();
  let heroPath = null;

  for (const tag of body.match(/<img\b[^>]*>/g) || []) {
    const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
    if (!src || src.startsWith("data:") || srcMap.has(src)) continue;
    const imageId = (tag.match(/data-image-id="([^"]+)"/) || [])[1] || "";
    const name = sanitizeImageName(src, imageId);
    const dest = join(contentDir, post.slug, name);
    const ok = existsSync(dest) || (await downloadImage(src, dest));
    if (!ok) {
      console.warn(`  ! image failed, left remote: ${src}`);
      continue;
    }
    srcMap.set(src, `./${post.slug}/${name}`);
    if (!heroPath && /data-is-featured="true"/.test(tag)) heroPath = srcMap.get(src);
    if (!heroPath && (body.match(/<img\b[^>]*>/g) || []).length === 1) heroPath = srcMap.get(src);
  }

  // No featured flag? Use the first image as the hero.
  if (!heroPath && srcMap.size > 0) heroPath = srcMap.values().next().value;

  // --- replace figures/images with tokens -----------------------------------
  let counter = 0;
  const tokens = new Map();
  body = body.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>|<img\b[^>]*>/g, (block) => {
    const img = (block.match(/<img\b[^>]*>/) || [])[0];
    if (!img) return "";
    const src = (img.match(/\bsrc="([^"]+)"/) || [])[1];
    if (!src || !srcMap.has(src)) return "";
    const caption = stripTags((block.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/) || [])[1] || "");
    const token = `MEDIAIMAGE${counter++}`;
    tokens.set(token, { path: srcMap.get(src), caption });
    return `\n\n<p>${token}</p>\n\n`;
  });

  const heroToken = [...tokens.entries()].find(([, v]) => v.path === heroPath)?.[0] ?? null;

  body = body.replace(
    /<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/g,
    (_m, src) => `<p><a href="${src}">${src}</a></p>`,
  );
  body = body.replace(/<pre\b[\s\S]*?<\/pre>/g, (pre) => pre.replace(/<br\s*\/?>/g, "\n"));

  let markdown = makeTurndown().turndown(body);

  // featured image is the hero, so it is dropped from the body
  if (heroToken) markdown = markdown.replace(new RegExp(heroToken, "g"), "");
  for (const [token, { path, caption }] of tokens) {
    markdown = markdown.replace(new RegExp(token, "g"), `![${caption.replace(/]/g, "")}](${path})`);
  }

  // links to other imported posts point at the vault (never the post itself)
  for (const other of POSTS) {
    if (other.id === post.id) continue;
    markdown = markdown.replace(
      new RegExp(`\\(https?://[^)]*${other.id}[^)]*\\)`, "g"),
      `(/blogs/${other.slug}/)`,
    );
  }

  // Medium member CTAs are meaningless once republished here
  markdown = markdown
    .replace(
      /^\s*>\s*.*(not a medium member|not a member|read for free|read full text|click here to read|click me to read).*$/gim,
      "",
    )
    .replace(/\n{3,}/g, "\n\n");

  markdown = markdown
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  markdown = stripLeadingDuplicate(markdown, title, subtitle);

  const description =
    subtitle || stripTags((body.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "").slice(0, 158);
  const pubDate = published ? published.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const frontmatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `pubDate: ${pubDate}`,
    `tags: ${JSON.stringify(post.tags)}`,
    heroPath ? `heroImage: ${JSON.stringify(heroPath)}` : null,
    heroPath ? `heroImageAlt: ${JSON.stringify(title)}` : null,
    canonical ? `sourceUrl: ${JSON.stringify(canonical)}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  await writeFile(target, `${frontmatter}\n\n${markdown}\n`);
  console.log(
    `write ${post.slug}.md  (${title.slice(0, 46)} | ${tokens.size} img, hero ${heroPath ? "yes" : "no"})`,
  );
  return { skipped: false };
}

async function main() {
  await access(exportDir).catch(() => {
    throw new Error(`Export dir not found: ${exportDir}`);
  });
  console.log(`export: ${exportDir}`);
  let written = 0;
  for (const post of POSTS) {
    const result = await convertPost(post);
    if (!result.skipped) written += 1;
  }
  console.log(`Done. ${written} written, ${POSTS.length - written} skipped.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
