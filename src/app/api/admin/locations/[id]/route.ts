import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  postalCode: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/admin/locations/[id] — rename / set postal code / soft-disable.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const body = await req.json();
  const v = patchSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const data: {
    name?: string;
    postalCode?: string | null;
    isActive?: boolean;
  } = {};
  if (v.data.name !== undefined) data.name = v.data.name.trim();
  if (v.data.postalCode !== undefined)
    data.postalCode = v.data.postalCode?.trim() || null;
  if (v.data.isActive !== undefined) data.isActive = v.data.isActive;

  const updated = await prisma.location.update({
    where: { id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "LOCATION_UPDATED",
      entity: "Location",
      entityId: id,
      oldData: {
        name: existing.name,
        postalCode: existing.postalCode,
        isActive: existing.isActive,
      },
      newData: data,
    },
  });

  revalidateTag("locations:children", "max");
  return NextResponse.json({ location: updated });
}

// DELETE /api/admin/locations/[id] — soft delete (isActive=false). Cascades
// the soft delete to descendants so the cascading dropdown stops showing the
// whole subtree.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // Walk the subtree (BFS) and collect every descendant id, then mark all
  // inactive in a single updateMany. Capped at depth 8 (matches LEVEL_ORDER).
  const allIds: string[] = [id];
  let frontier = [id];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const children = await prisma.location.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    if (childIds.length === 0) break;
    allIds.push(...childIds);
    frontier = childIds;
  }

  const result = await prisma.location.updateMany({
    where: { id: { in: allIds } },
    data: { isActive: false },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "LOCATION_DISABLED",
      entity: "Location",
      entityId: id,
      newData: { disabledIds: allIds, count: result.count },
    },
  });

  revalidateTag("locations:children", "max");
  return NextResponse.json({ success: true, disabledCount: result.count });
}
