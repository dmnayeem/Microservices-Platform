import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { builtInArticles } from "@/lib/blog";
import { blogGuard, refreshBlog } from "@/lib/blog-admin";

// POST /api/admin/blog/import — copy the built-in articles into the database
// so they can be edited here. Skips any whose URL already exists; safe to run
// twice.
export async function POST() {
  const g = await blogGuard(true);
  if ("status" in g) return NextResponse.json({ error: "Forbidden" }, { status: g.status });
  const existing = new Set((await prisma.blogPost.findMany({ select: { slug: true } })).map((p) => p.slug));
  const toAdd = builtInArticles().filter((a) => !existing.has(a.slug));
  for (const a of toAdd) {
    await prisma.blogPost.create({
      data: {
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        content: a.html,
        category: a.category,
        authorName: a.author,
        status: "PUBLISHED",
        publishedAt: new Date(a.publishedAt),
        readingMinutes: a.readMinutes,
        createdById: g.userId,
      },
    });
  }
  refreshBlog(toAdd.map((a) => a.slug));
  if (toAdd.length) {
    await writeAudit({
      actorId: g.userId,
      action: "BLOG_IMPORTED",
      entity: "BlogPost",
      summary: `Imported ${toAdd.length} built-in article(s)`,
    });
  }
  return NextResponse.json({ imported: toAdd.length });
}
