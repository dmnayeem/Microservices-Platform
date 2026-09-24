import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  logo: z.string().url().nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  website: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
});

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 as const };
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return { error: "Forbidden", status: 403 as const };
  }
  return { actorId: session.user.id };
}

// PATCH /api/admin/marketplace/brands/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const v = patchSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }

  const before = await prisma.marketplaceBrand.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // The slug is intentionally not editable: it is the public storefront URL,
  // and changing it silently breaks every link already shared to that brand.
  const brand = await prisma.marketplaceBrand.update({
    where: { id },
    data: {
      ...(v.data.name !== undefined ? { name: v.data.name.trim() } : {}),
      ...(v.data.logo !== undefined ? { logo: v.data.logo } : {}),
      ...(v.data.bio !== undefined ? { bio: v.data.bio } : {}),
      ...(v.data.website !== undefined ? { website: v.data.website } : {}),
      ...(v.data.isActive !== undefined ? { isActive: v.data.isActive } : {}),
    },
  });

  await writeAudit({
    actorId: g.actorId,
    action: "MARKETPLACE_BRAND_UPDATE",
    entity: "MarketplaceBrand",
    entityId: brand.id,
    summary: `Updated marketplace brand "${brand.name}"`,
    meta: { before: { name: before.name, isActive: before.isActive }, after: v.data },
  });

  return NextResponse.json({ brand });
}

// DELETE /api/admin/marketplace/brands/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { id } = await params;
  const brand = await prisma.marketplaceBrand.findUnique({ where: { id } });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const listingCount = await prisma.marketplaceListing.count({ where: { brandId: id } });

  // Deleting sets brandId to null on every listing that used it (the FK is ON
  // DELETE SET NULL), which silently re-attributes live listings to the admin
  // account behind them. Deactivating keeps the storefront intact and just
  // stops new listings being filed under it, so that is what a brand with
  // listings gets.
  if (listingCount > 0) {
    const deactivated = await prisma.marketplaceBrand.update({
      where: { id },
      data: { isActive: false },
    });
    await writeAudit({
      actorId: g.actorId,
      action: "MARKETPLACE_BRAND_DEACTIVATE",
      entity: "MarketplaceBrand",
      entityId: id,
      summary: `Deactivated marketplace brand "${brand.name}" (${listingCount} listing(s) keep it)`,
    });
    return NextResponse.json({
      brand: deactivated,
      deactivated: true,
      message: `"${brand.name}" has ${listingCount} listing(s), so it was deactivated instead of deleted. Existing listings keep the storefront; new ones can't use it.`,
    });
  }

  await prisma.marketplaceBrand.delete({ where: { id } });
  await writeAudit({
    actorId: g.actorId,
    action: "MARKETPLACE_BRAND_DELETE",
    entity: "MarketplaceBrand",
    entityId: id,
    summary: `Deleted unused marketplace brand "${brand.name}"`,
  });

  return NextResponse.json({ deleted: true });
}
