import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { toNum } from "@/lib/money";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20)
  );

  const where: Prisma.MarketplaceListingWhereInput = { status: "ACTIVE" };
  if (category && category !== "ALL") where.category = category;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [listings, total] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.marketplaceListing.count({ where }),
  ]);

  // Fetch sellers
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, name: true, avatar: true },
  });
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  return NextResponse.json({
    listings: listings.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      price: toNum(l.price),
      images: l.images,
      views: l.views,
      createdAt: l.createdAt.toISOString(),
      seller: {
        name: sellerMap.get(l.sellerId)?.name ?? null,
        avatar: sellerMap.get(l.sellerId)?.avatar ?? null,
      },
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// POST /api/marketplace (a legacy "create listing" path) was removed. Nothing
// called it, and it published straight to ACTIVE — skipping the
// PENDING_REVIEW moderation, typed categories and file checks of
// POST /api/marketplace/listings, which is the only way to list now.
