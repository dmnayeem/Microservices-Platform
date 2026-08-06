import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isLocationType } from "@/lib/locations";
import { z } from "zod";

const createSchema = z.object({
  countryId: z.string().min(1),
  parentId: z.string().min(1).optional().nullable(),
  name: z.string().min(1).max(120),
  type: z.string().refine(isLocationType, { message: "Invalid location type" }),
  postalCode: z.string().max(20).optional().nullable(),
});

// POST /api/admin/locations — create a new location row.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  // Verify country exists
  const country = await prisma.country.findUnique({
    where: { id: v.data.countryId },
    select: { id: true },
  });
  if (!country) {
    return NextResponse.json({ error: "Country not found" }, { status: 404 });
  }

  // Verify parent (if any) belongs to the same country
  if (v.data.parentId) {
    const parent = await prisma.location.findUnique({
      where: { id: v.data.parentId },
      select: { id: true, countryId: true },
    });
    if (!parent || parent.countryId !== v.data.countryId) {
      return NextResponse.json(
        { error: "Parent location not found in this country" },
        { status: 400 }
      );
    }
  }

  // Reject duplicates (same parent + name + type within a country)
  const existing = await prisma.location.findFirst({
    where: {
      countryId: v.data.countryId,
      parentId: v.data.parentId ?? null,
      name: v.data.name.trim(),
      type: v.data.type,
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A location with this name already exists at this level" },
      { status: 400 }
    );
  }

  const created = await prisma.location.create({
    data: {
      countryId: v.data.countryId,
      parentId: v.data.parentId ?? null,
      name: v.data.name.trim(),
      type: v.data.type,
      postalCode: v.data.postalCode?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "LOCATION_CREATED",
      entity: "Location",
      entityId: created.id,
      newData: {
        countryId: created.countryId,
        parentId: created.parentId,
        name: created.name,
        type: created.type,
      },
    },
  });

  revalidateTag("locations:children", "max");
  return NextResponse.json({ location: created });
}
