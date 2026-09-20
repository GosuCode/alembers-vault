import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      heroImage: image().optional(),
      heroImageAlt: z.string().optional(),
      sourceUrl: z.url().optional(),
    }),
});

const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      featured: z.boolean().default(false),
      program: z.string().optional(),
      semester: z.number().int().min(1).max(12).optional(),
      year: z.number().int().optional(),
      yearBs: z.number().int().optional(),
      status: z.enum(["coursework", "maintained", "archived"]).optional(),
      tech: z.array(z.string()).default([]),
      links: z
        .array(
          z.object({
            label: z.string(),
            href: z.url(),
            kind: z
              .enum(["repo", "demo", "dashboard", "docs"])
              .default("repo"),
          }),
        )
        .default([]),
      reports: z
        .array(
          z.object({
            label: z.string(),
            path: z.string(),
            kind: z.enum(["pdf", "docx"]),
            role: z
              .enum(["report", "source", "proposal", "presentation", "guideline"])
              .default("report"),
            note: z.string().optional(),
          }),
        )
        .default([]),
      heroImage: image().optional(),
      gallery: z
        .array(z.object({ src: image(), caption: z.string() }))
        .default([]),
      notice: z.string().optional(),
    }),
});

export const collections = { blog, projects };
