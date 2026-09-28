import { z } from "zod";
import { readingMinutes, slugify } from "@/lib/blog-seo";

const urlOrPath = z
  .string()
  .max(1000)
  .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v), "Use a full https:// link or a path");

export const blogSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(200),
  slug: z.string().max(120).optional(),
  content: z.string().max(500_000),
  excerpt: z.string().max(600).optional().nullable(),
  coverImage: urlOrPath.optional().nullable(),
  coverAlt: z.string().max(200).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  authorName: z.string().max(80).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  publishedAt: z.string().datetime().optional().nullable().or(z.literal("")),
  metaTitle: z.string().max(120).optional().nullable(),
  metaDescription: z.string().max(400).optional().nullable(),
  focusKeyword: z.string().max(80).optional().nullable(),
  canonicalUrl: z.string().url().optional().nullable().or(z.literal("")),
  noindex: z.boolean().optional(),
});

export function blogData(v: z.infer<typeof blogSchema>) {
  const status = v.status ?? "DRAFT";
  const slug = slugify(v.slug?.trim() || v.title);
  return {
    title: v.title,
    slug: slug || `post-${Date.now().toString(36)}`,
    content: v.content,
    excerpt: v.excerpt?.trim() || null,
    coverImage: v.coverImage || null,
    coverAlt: v.coverAlt?.trim() || null,
    category: v.category?.trim() || null,
    tags: [...new Set((v.tags ?? []).map((t) => t.trim()).filter(Boolean))],
    authorName: v.authorName?.trim() || null,
    status,
    // Publishing without a date means now; a future date schedules it.
    publishedAt: v.publishedAt ? new Date(v.publishedAt) : status === "PUBLISHED" ? new Date() : null,
    metaTitle: v.metaTitle?.trim() || null,
    metaDescription: v.metaDescription?.trim() || null,
    focusKeyword: v.focusKeyword?.trim() || null,
    canonicalUrl: v.canonicalUrl || null,
    noindex: v.noindex ?? false,
    readingMinutes: readingMinutes(v.content),
  };
}
