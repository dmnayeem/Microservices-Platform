import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { userCanFeature } from "@/lib/packages";
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

const createSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(10),
  category: z.string().min(1),
  price: z.number().positive(),
  currency: z.string().default("USD"),
  images: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Selling is an admin-granted capability.
  if (!(await userCanFeature(session.user.id, "sellMarketplace"))) {
    return NextResponse.json(
      { error: "Selling on the marketplace isn't enabled for your account." },
      { status: 403 }
    );
  }
  const body = await request.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: session.user.id,
      title: v.data.title,
      description: v.data.description,
      category: v.data.category,
      price: v.data.price,
      currency: v.data.currency,
      images: v.data.images,
      status: "ACTIVE",
    },
  });

  return NextResponse.json(
    { success: true, listing: { id: listing.id, title: listing.title } },
    { status: 201 }
  );
}
