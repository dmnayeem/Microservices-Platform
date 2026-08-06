import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ANNOUNCE_SCHEMA = z.object({ isAnnouncement: z.boolean() }).strict();

/**
 * PATCH /api/admin/feed/[id]/announce
 *
 * Toggle a post's OFFICIAL announcement flag. Useful for promoting an
 * existing organic post to announcement status (or revoking it).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "social.post"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ANNOUNCE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const updated = await prisma.post.update({
    where: { id },
    data: { isAnnouncement: parsed.data.isAnnouncement },
    select: { id: true, isAnnouncement: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: parsed.data.isAnnouncement
        ? "POST_ANNOUNCED"
        : "POST_UNANNOUNCED",
      entity: "Post",
      entityId: id,
    },
  });

  return NextResponse.json({ ok: true, ...updated });
}
