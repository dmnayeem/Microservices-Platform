import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PROMOTE_SCHEMA = z
  .object({
    isPromoted: z.boolean(),
    until: z.string().datetime().optional().nullable(),
    note: z.string().max(120).optional().nullable(),
  })
  .strict();

/**
 * PATCH /api/admin/feed/[id]/promote
 *
 * Toggle a post's PROMOTED status. When `isPromoted=true`, the post
 * shows the PROMOTED badge in the feed and is interleaved every ~4
 * organic posts. `until` (optional ISO timestamp) auto-expires the
 * promotion. `note` (optional, ≤120 chars) is shown next to the badge
 * (e.g. "NordVPN").
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "social.promote"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PROMOTE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { isPromoted, until, note } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const updated = await prisma.post.update({
    where: { id },
    data: {
      isPromoted,
      promotedUntil: isPromoted
        ? until
          ? new Date(until)
          : null
        : null,
      promotedNote: isPromoted ? (note?.trim() || null) : null,
    },
    select: {
      id: true,
      isPromoted: true,
      promotedUntil: true,
      promotedNote: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: isPromoted ? "POST_PROMOTED" : "POST_UNPROMOTED",
      entity: "Post",
      entityId: id,
      newData: { until: updated.promotedUntil, note: updated.promotedNote },
    },
  });

  return NextResponse.json({ ok: true, ...updated });
}
