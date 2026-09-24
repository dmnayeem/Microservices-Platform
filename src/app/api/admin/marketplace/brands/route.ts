import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/marketplace-studio";
import { z } from "zod";

/**
 * Storefront names that admin-curated listings are published under.
 *
 * A brand is a label over a real seller account, not a user — see the model
 * comment on `MarketplaceBrand`. Listing it here rather than deriving names
 * from listing rows is what lets the publisher offer a picker and the public
 * site offer a "by company" filter.
 */

const brandSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  logo: z.string().url().nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  website: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/marketplace/brands — list brands with their listing counts
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const brands = await prisma.marketplaceBrand.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  // One count per brand rather than a `_count` include or a groupBy: neither
  // types correctly against this model in the generated client (the include is
  // silently dropped, the groupBy result widens to `{}`), and a count that
  // compiles but always reads zero is worse than an extra query. The list is
  // admin-curated and small, so the round trips are cheap.
  const counts = await Promise.all(
    brands.map((b) => prisma.marketplaceListing.count({ where: { brandId: b.id } }))
  );
  const countByBrand = new Map(brands.map((b, i) => [b.id, counts[i]]));

  return NextResponse.json({
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logo: b.logo,
      bio: b.bio,
      website: b.website,
      isActive: b.isActive,
      listingCount: countByBrand.get(b.id) ?? 0,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}

// POST /api/admin/marketplace/brands — create a brand
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const v = brandSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const base = v.data.slug || slugify(v.data.name);
  if (!base) {
    return NextResponse.json(
      { error: "That name has no letters or digits to build a URL from" },
      { status: 400 }
    );
  }

  // Suffix rather than reject: an admin typing "Nova Studio" twice wants a
  // second brand, and making them invent a unique slug by hand is friction for
  // a field nobody sees.
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const clash = await prisma.marketplaceBrand.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!clash) break;
    slug = `${base}-${n}`;
  }

  const brand = await prisma.marketplaceBrand.create({
    data: {
      name: v.data.name.trim(),
      slug,
      logo: v.data.logo ?? null,
      bio: v.data.bio ?? null,
      website: v.data.website ?? null,
      isActive: v.data.isActive ?? true,
    },
  });

  await writeAudit({
    actorId: session.user.id,
    action: "MARKETPLACE_BRAND_CREATE",
    entity: "MarketplaceBrand",
    entityId: brand.id,
    summary: `Created marketplace brand "${brand.name}"`,
    meta: { slug: brand.slug },
  });

  return NextResponse.json({ brand });
}
