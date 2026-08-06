import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ALL_LOCATION_TYPES } from "@/lib/locations";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  iso2: z.string().length(2).optional(),
  iso3: z.string().length(3).nullable().optional(),
  phoneCode: z.string().max(10).nullable().optional(),
  flag: z.string().max(20).nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  isActive: z.boolean().optional(),
  enabledLevels: z
    .array(z.string())
    .optional()
    .refine(
      (arr) => !arr || arr.every((s) => (ALL_LOCATION_TYPES as string[]).includes(s)),
      { message: "Invalid location type in enabledLevels" }
    ),
});

// PATCH /api/admin/countries/[id] — edit a country's basic info or
// enabledLevels (which dropdowns the LocationSelector shows for it).
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
  const existing = await prisma.country.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Country not found" }, { status: 404 });
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
    iso2?: string;
    iso3?: string | null;
    phoneCode?: string | null;
    flag?: string | null;
    currency?: string | null;
    isActive?: boolean;
    enabledLevels?: string[];
  } = {};
  if (v.data.name !== undefined) data.name = v.data.name.trim();
  if (v.data.iso2 !== undefined) data.iso2 = v.data.iso2.toUpperCase();
  if (v.data.iso3 !== undefined) data.iso3 = v.data.iso3?.toUpperCase() ?? null;
  if (v.data.phoneCode !== undefined) data.phoneCode = v.data.phoneCode || null;
  if (v.data.flag !== undefined) data.flag = v.data.flag || null;
  if (v.data.currency !== undefined) data.currency = v.data.currency || null;
  if (v.data.isActive !== undefined) data.isActive = v.data.isActive;
  if (v.data.enabledLevels !== undefined) data.enabledLevels = v.data.enabledLevels;

  const updated = await prisma.country.update({
    where: { id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "COUNTRY_UPDATED",
      entity: "Country",
      entityId: id,
      oldData: {
        name: existing.name,
        iso2: existing.iso2,
        enabledLevels: existing.enabledLevels,
        isActive: existing.isActive,
      },
      newData: data,
    },
  });

  revalidateTag("locations:countries", "max");
  revalidateTag("locations:children", "max");
  return NextResponse.json({ country: updated });
}
