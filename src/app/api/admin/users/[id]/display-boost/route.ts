import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  displayFollowersBoost: z.number().int().min(-1_000_000).max(1_000_000),
  displayFollowingBoost: z.number().int().min(-1_000_000).max(1_000_000),
  displayPostsBoost: z.number().int().min(-1_000_000).max(1_000_000),
});

// PATCH /api/admin/users/[id]/display-boost
// Update the admin-set vanity offsets for followers / following / posts.
// Display = max(0, real + boost). Boost can be negative.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      displayFollowersBoost: true,
      displayFollowingBoost: true,
      displayPostsBoost: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      displayFollowersBoost: v.data.displayFollowersBoost,
      displayFollowingBoost: v.data.displayFollowingBoost,
      displayPostsBoost: v.data.displayPostsBoost,
    },
    select: {
      displayFollowersBoost: true,
      displayFollowingBoost: true,
      displayPostsBoost: true,
    },
  });

  await writeAudit({
    actorId: session.user.id,
    action: "USER_DISPLAY_BOOST_UPDATED",
    entity: "User",
    entityId: id,
    targetUserId: id,
    summary: `Set display boost — followers ${updated.displayFollowersBoost}, following ${updated.displayFollowingBoost}, posts ${updated.displayPostsBoost}`,
    meta: { before: existing, after: updated },
  });

  return NextResponse.json({ success: true, boost: updated });
}
