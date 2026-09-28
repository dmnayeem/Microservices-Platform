import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { blogData, blogSchema } from "@/lib/blog-input";
import { blogGuard, refreshBlog } from "@/lib/blog-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_r: NextRequest, { params }: Ctx) {
  const g = await blogGuard(false);
  if ("status" in g) return NextResponse.json({ error: "Forbidden" }, { status: g.status });
  const post = await prisma.blogPost.findUnique({ where: { id: (await params).id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const g = await blogGuard(true);
  if ("status" in g) return NextResponse.json({ error: "Forbidden" }, { status: g.status });
  const { id } = await params;
  const before = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true, status: true, publishedAt: true },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = blogSchema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = blogData(v.data);
  // Re-saving a published article keeps its original date unless one was given.
  if (!v.data.publishedAt && data.status === "PUBLISHED" && before.publishedAt) {
    data.publishedAt = before.publishedAt;
  }
  if (data.slug !== before.slug) {
    const clash = await prisma.blogPost.findUnique({ where: { slug: data.slug }, select: { id: true } });
    if (clash) {
      return NextResponse.json(
        { error: `The URL /blog/${data.slug} is already used by another article.` },
        { status: 409 }
      );
    }
  }
  const post = await prisma.blogPost.update({ where: { id }, data });
  refreshBlog([before.slug, post.slug]);
  await writeAudit({
    actorId: g.userId,
    action: "BLOG_UPDATED",
    entity: "BlogPost",
    entityId: id,
    summary:
      before.status !== post.status
        ? `${post.status === "PUBLISHED" ? "Published" : "Unpublished"} "${post.title}"`
        : `Edited "${post.title}"`,
  });
  return NextResponse.json({ post });
}

export async function DELETE(_r: NextRequest, { params }: Ctx) {
  const g = await blogGuard(true);
  if ("status" in g) return NextResponse.json({ error: "Forbidden" }, { status: g.status });
  const { id } = await params;
  const post = await prisma.blogPost.delete({ where: { id } }).catch(() => null);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  refreshBlog([post.slug]);
  await writeAudit({
    actorId: g.userId,
    action: "BLOG_DELETED",
    entity: "BlogPost",
    entityId: id,
    summary: `Deleted article "${post.title}"`,
    meta: { snapshot: { slug: post.slug, title: post.title, status: post.status, views: post.views } },
  });
  return NextResponse.json({ ok: true });
}
