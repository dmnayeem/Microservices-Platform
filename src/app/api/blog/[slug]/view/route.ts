import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/blog/:slug/view — the read counter on /admin/blog. Public and
// best-effort: a built-in article (not in the database) simply is not counted.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limited = enforceRateLimit(request, "blog-view", 30, 60_000);
  if (limited) return limited;
  const { slug } = await params;
  await prisma.blogPost
    .updateMany({ where: { slug, status: "PUBLISHED" }, data: { views: { increment: 1 } } })
    .catch(() => null);
  return NextResponse.json({ ok: true });
}
