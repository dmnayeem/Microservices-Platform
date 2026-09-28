import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { blogData, blogSchema } from "@/lib/blog-input";
import { blogGuard, refreshBlog } from "@/lib/blog-admin";

export async function GET() {
  const g = await blogGuard(false);
  if ("status" in g) return NextResponse.json({ error: "Forbidden" }, { status: g.status });
  const posts = await prisma.blogPost.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      views: true,
      category: true,
      focusKeyword: true,
      coverImage: true,
    },
  });
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  const g = await blogGuard(true);
  if ("status" in g) return NextResponse.json({ error: "Forbidden" }, { status: g.status });
  const v = blogSchema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = blogData(v.data);
  if (await prisma.blogPost.findUnique({ where: { slug: data.slug }, select: { id: true } })) {
    return NextResponse.json(
      { error: `The URL /blog/${data.slug} is already used by another article.` },
      { status: 409 }
    );
  }
  const post = await prisma.blogPost.create({ data: { ...data, createdById: g.userId } });
  refreshBlog([post.slug]);
  await writeAudit({
    actorId: g.userId,
    action: "BLOG_CREATED",
    entity: "BlogPost",
    entityId: post.id,
    summary: `Created article "${post.title}" (${post.status})`,
  });
  return NextResponse.json({ post }, { status: 201 });
}
