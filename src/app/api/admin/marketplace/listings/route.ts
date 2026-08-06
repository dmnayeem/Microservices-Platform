import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { z } from "zod";
import {
  validateDetails,
  getCategory,
} from "@/lib/marketplace-categories";

const ASSET_TYPES = [
  "DOMAIN",
  "WEBSITE",
  "SOCIAL_ACCOUNT",
  "POD_ACCOUNT",
  "PLAYSTORE_ACCOUNT",
  "APPLE_DEV_ACCOUNT",
  "MOBILE_APP",
  "MOBILE_GAME",
  "SAAS_PRODUCT",
  "DIGITAL_PRODUCT",
  "SERVICE",
  "OTHER",
] as const;

const createListingSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
  richDescription: z.string().max(20000).nullable().optional(),
  category: z.string().min(1),
  assetType: z.enum(ASSET_TYPES).default("DIGITAL_PRODUCT"),
  subType: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  price: z.number().positive(),
  currency: z.string().default("USD"),
  images: z.array(z.string().url()).optional(),
  screenshots: z.array(z.string().url()).optional(),
  attachments: z.array(z.string().url()).optional(),
  files: z.array(z.string().url()).optional(),
  reasonsForSelling: z.string().max(2000).nullable().optional(),
  whatsIncluded: z.string().max(2000).nullable().optional(),
  whatsNotIncluded: z.string().max(2000).nullable().optional(),
  monthlyRevenue: z.number().nullable().optional(),
  monthlyProfit: z.number().nullable().optional(),
  monthlyExpenses: z.number().nullable().optional(),
  monthlyTraffic: z.number().int().nullable().optional(),
  assetAgeMonths: z.number().int().nullable().optional(),
  niche: z.string().max(120).nullable().optional(),
  nsfw: z.boolean().optional(),
  ndaGated: z.boolean().optional(),
  verifiedMetrics: z.boolean().optional(),
  auctionMode: z.boolean().optional(),
  startingBid: z.number().nullable().optional(),
  reservePrice: z.number().nullable().optional(),
  buyNowPrice: z.number().nullable().optional(),
  auctionEndsAt: z.string().nullable().optional(),
  isFeatured: z.boolean().optional(),
  isPromoted: z.boolean().optional(),
  commissionRateBps: z.number().int().min(0).max(10000).nullable().optional(),
  status: z.enum(["ACTIVE", "SOLD", "CANCELLED", "EXPIRED"]).default("ACTIVE"),
});

// POST /api/admin/marketplace/listings - Create a new listing (admin)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = createListingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Validate sub-type belongs to the asset type
    if (data.subType) {
      const cat = getCategory(data.assetType);
      const subTypeOk = cat?.subTypes?.some((s) => s.slug === data.subType);
      if (!subTypeOk) {
        return NextResponse.json(
          {
            error: `subType "${data.subType}" is not valid for asset type "${data.assetType}"`,
          },
          { status: 400 }
        );
      }
    }

    // Validate the category-specific `details` blob
    const detailsErr = validateDetails(
      data.assetType,
      data.subType ?? null,
      data.details ?? {}
    );
    if (detailsErr) {
      return NextResponse.json({ error: detailsErr }, { status: 400 });
    }

    // Auction sanity checks
    if (data.auctionMode) {
      if (!data.auctionEndsAt) {
        return NextResponse.json(
          { error: "Auction mode needs an end date" },
          { status: 400 }
        );
      }
      if (data.startingBid != null && data.reservePrice != null && data.startingBid > data.reservePrice) {
        return NextResponse.json(
          { error: "Starting bid can't be higher than the reserve price" },
          { status: 400 }
        );
      }
    }

    const listing = await prisma.marketplaceListing.create({
      data: {
        sellerId: session.user.id,
        title: data.title,
        description: data.description,
        richDescription: data.richDescription ?? null,
        category: data.category,
        assetType: data.assetType,
        subType: data.subType ?? null,
        // Prisma JSON expects a plain JSON value — strip undefined.
        details: data.details ? JSON.parse(JSON.stringify(data.details)) : null,
        price: data.price,
        currency: data.currency,
        images: data.images ?? [],
        screenshots: data.screenshots ?? [],
        attachments: data.attachments ?? [],
        files: data.files ?? [],
        reasonsForSelling: data.reasonsForSelling ?? null,
        whatsIncluded: data.whatsIncluded ?? null,
        whatsNotIncluded: data.whatsNotIncluded ?? null,
        monthlyRevenue: data.monthlyRevenue ?? null,
        monthlyProfit: data.monthlyProfit ?? null,
        monthlyExpenses: data.monthlyExpenses ?? null,
        monthlyTraffic: data.monthlyTraffic ?? null,
        assetAgeMonths: data.assetAgeMonths ?? null,
        niche: data.niche ?? null,
        nsfw: data.nsfw ?? false,
        ndaGated: data.ndaGated ?? false,
        verifiedMetrics: data.verifiedMetrics ?? false,
        auctionMode: data.auctionMode ?? false,
        startingBid: data.startingBid ?? null,
        reservePrice: data.reservePrice ?? null,
        buyNowPrice: data.buyNowPrice ?? null,
        auctionEndsAt: data.auctionEndsAt ? new Date(data.auctionEndsAt) : null,
        isFeatured: data.isFeatured ?? false,
        featuredUntil: null,
        isPromoted: data.isPromoted ?? false,
        promotedUntil: null,
        commissionRateBps: data.commissionRateBps ?? null,
        status: data.status,
      },
    });

    return NextResponse.json({
      message: "Listing created successfully",
      listing: {
        ...listing,
        price: toNum(listing.price),
        monthlyRevenue: toNumOrNull(listing.monthlyRevenue),
        monthlyProfit: toNumOrNull(listing.monthlyProfit),
        monthlyExpenses: toNumOrNull(listing.monthlyExpenses),
        startingBid: toNumOrNull(listing.startingBid),
        reservePrice: toNumOrNull(listing.reservePrice),
        buyNowPrice: toNumOrNull(listing.buyNowPrice),
      },
    });
  } catch (error) {
    console.error("Error creating listing:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create listing" },
      { status: 500 }
    );
  }
}
