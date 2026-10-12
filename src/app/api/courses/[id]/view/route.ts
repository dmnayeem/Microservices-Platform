import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { realIp } from "@/lib/client-ip";

// POST /api/courses/:id/view
// Records a view + bumps Course.uniqueViewers if this sessionHash hasn't been
// seen for this course before. Mirrors the marketplace view pattern.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;

    // Build a stable sessionHash: prefer userId, fall back to IP + UA
    const ip = realIp(req.headers) ?? "anon";
    const ua = req.headers.get("user-agent") ?? "anon";
    const seed = userId ?? `${ip}|${ua}`;
    const sessionHash = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);

    // Resolve to a real course (the param may be slug OR id)
    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true },
    });
    if (!course) return NextResponse.json({ ok: false }, { status: 404 });

    // Dedupe inside a 24h window
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await prisma.courseListingView.findFirst({
      where: {
        courseId: course.id,
        sessionHash,
        viewedAt: { gte: cutoff },
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.$transaction([
        prisma.courseListingView.create({
          data: {
            courseId: course.id,
            userId,
            sessionHash,
            source: req.headers.get("referer") ?? null,
          },
        }),
        prisma.course.update({
          where: { id: course.id },
          data: { uniqueViewers: { increment: 1 } },
        }),
      ]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Course view track failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
