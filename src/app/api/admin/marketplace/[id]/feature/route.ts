import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/admin/marketplace/:id/feature
// Toggle isFeatured / isPromoted and optionally set an "until" date.
//
//   { isFeatured?: boolean, featuredUntil?: ISO|null }
//   { isPromoted?: boolean, promotedUntil?: ISO|null }
//
// When the corresponding boolean flips to false (or omitted with the date
// nulled), the matching "until" column is cleared so stale future-dates
// don't keep surfacing it.
const schema = z.object({
  isFeatured: z.boolean().optional(),
  featuredUntil: z.string().datetime().nullable().optional(),
  isPromoted: z.boolean().optional(),
  promotedUntil: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const v = schema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }

    const data = v.data;
    const update: Record<string, unknown> = {};
    if (data.isFeatured !== undefined) {
      update.isFeatured = data.isFeatured;
      // If turning off, clear the until date
      if (!data.isFeatured) update.featuredUntil = null;
    }
    if (data.featuredUntil !== undefined) {
      update.featuredUntil = data.featuredUntil
        ? new Date(data.featuredUntil)
        : null;
    }
    if (data.isPromoted !== undefined) {
      update.isPromoted = data.isPromoted;
      if (!data.isPromoted) update.promotedUntil = null;
    }
    if (data.promotedUntil !== undefined) {
      update.promotedUntil = data.promotedUntil
        ? new Date(data.promotedUntil)
        : null;
    }

    const listing = await prisma.marketplaceListing.update({
      where: { id },
      data: update,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "MARKETPLACE_LISTING_FEATURE_TOGGLE",
        entity: "MarketplaceListing",
        entityId: id,
        // Audit JSON — serialize the patch so dates etc. round-trip cleanly
        newData: JSON.parse(JSON.stringify(update)),
      },
    });

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Feature toggle failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
