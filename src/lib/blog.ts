import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { BlogPost as BlogPostRow } from "@/generated/prisma/client";
import { BLOG_POSTS, type BlogPost as StaticPost } from "@/lib/blog-posts";
import { sanitizeRichHtml } from "@/lib/rich-html";

/**
 * The blog, as the public pages, the sitemap and llms.txt read it.
 *
 * Articles are written at /admin/blog and stored in `BlogPost`. The five
 * articles that used to be hard-coded in lib/blog-posts.ts are the fallback
 * while nothing is published yet (or the database cannot be reached), so the
 * blog is never empty; once one article is published, the database is the
 * only source. /admin/blog can import them so they can be edited.
 */

export const BLOG_TAG = "blog-posts";

export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: string;
  /** ISO timestamps. */
  publishedAt: string;
  updatedAt: string;
  readMinutes: number;
  coverImage: string | null;
  coverAlt: string | null;
  /** Emoji tile for articles without a cover (the built-in ones). */
  emoji: string | null;
  /** Sanitised HTML. */
  html: string;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fromStatic(p: StaticPost): Article {
  const html = p.body
    .map(
      (b) =>
        (b.heading ? `<h2>${esc(b.heading)}</h2>` : "") +
        b.paragraphs.map((x) => `<p>${esc(x)}</p>`).join("") +
        (b.bullets ? `<ul>${b.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "")
    )
    .join("");
  const iso = new Date(`${p.date}T00:00:00Z`).toISOString();
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    category: p.category,
    tags: [],
    author: p.author,
    publishedAt: iso,
    updatedAt: iso,
    readMinutes: p.readMinutes,
    coverImage: null,
    coverAlt: null,
    emoji: p.emoji,
    html,
    metaTitle: null,
    metaDescription: null,
    focusKeyword: null,
    canonicalUrl: null,
    noindex: false,
  };
}

/** Built-in articles converted to the editor's HTML — for the one-time import. */
export function builtInArticles(): Article[] {
  return BLOG_POSTS.map(fromStatic);
}

type Row = BlogPostRow;

function fromRow(r: Row): Article {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    category: r.category || "Articles",
    tags: r.tags,
    author: r.authorName || "The RevType Team",
    publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    readMinutes: r.readingMinutes,
    coverImage: r.coverImage,
    coverAlt: r.coverAlt,
    emoji: null,
    html: sanitizeRichHtml(r.content),
    metaTitle: r.metaTitle,
    metaDescription: r.metaDescription,
    focusKeyword: r.focusKeyword,
    canonicalUrl: r.canonicalUrl,
    noindex: r.noindex,
  };
}

const loadAll = unstable_cache(
  async (): Promise<{ published: Article[] }> => {
    const rows = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" },
      take: 500,
    });
    return { published: rows.map(fromRow) };
  },
  ["blog-published"],
  // A scheduled article appears within five minutes of its time.
  { revalidate: 300, tags: [BLOG_TAG] }
);

/** Every published article, newest first. */
export async function getArticles(): Promise<Article[]> {
  try {
    const { published } = await loadAll();
    return published.length === 0 ? builtInArticles() : published;
  } catch {
    return builtInArticles();
  }
}

export async function getArticle(slug: string): Promise<Article | null> {
  return (await getArticles()).find((a) => a.slug === slug) ?? null;
}

export function formatArticleDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** h2/h3 headings → a table of contents, with ids added to the HTML. */
export function withTableOfContents(html: string): { html: string; toc: Array<{ id: string; text: string; level: 2 | 3 }> } {
  const toc: Array<{ id: string; text: string; level: 2 | 3 }> = [];
  const used = new Set<string>();
  const out = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    let id = text.toLowerCase().replace(/&[a-z]+;/g, "").replace(/[^a-z0-9ঀ-৿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
    while (used.has(id)) id += "-";
    used.add(id);
    toc.push({ id, text, level: Number(lvl) as 2 | 3 });
    const cleanAttrs = attrs.replace(/\sid\s*=\s*("[^"]*"|'[^']*')/i, "");
    return `<h${lvl}${cleanAttrs} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}
