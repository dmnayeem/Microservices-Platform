import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MarketplaceListingStatus, Prisma } from "@/generated/prisma";
import {
  validateDetails,
  getCategory,
  requiresDeliverable,
  getDeliverableKind,
} from "@/lib/marketplace-categories";
import { extractMediaMetadata, type MediaMeta } from "@/lib/media-metadata";
import { hammingDistance, PHASH_HAMMING_THRESHOLD } from "@/lib/phash";
import { assertPublicUrl } from "@/lib/link-preview";
import { inngest, EVENTS } from "@/lib/inngest/client";
import { userCanFeature } from "@/lib/packages";
import { toNum, toNumOrNull } from "@/lib/money";
import { z } from "zod";

// Cap how many bytes we pull back to analyse a deliverable (bounds bandwidth
// for large stock video; images/audio are usually far smaller). For a bigger
// file this is a partial read — enough for EXIF/container tags + a fingerprint.
const PARSE_BYTE_CAP = 30 * 1024 * 1024;

async function fetchDeliverableBytes(url: string): Promise<Buffer | null> {
  try {
    await assertPublicUrl(url); // files[] is client-supplied → guard SSRF
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { Range: `bytes=0-${PARSE_BYTE_CAP - 1}` },
    });
    if (!res.ok && res.status !== 206) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab.byteLength > PARSE_BYTE_CAP ? ab.slice(0, PARSE_BYTE_CAP) : ab);
  } catch {
    return null;
  }
}

/** Extract micro-data for a stock-media deliverable + flag perceptual dupes. */
async function analyseDeliverable(
  assetType: string,
  fileUrl: string,
  sellerId: string
): Promise<MediaMeta | null> {
  const bytes = await fetchDeliverableBytes(fileUrl);
  if (!bytes) return null;
  const kind = getDeliverableKind(assetType) ?? "file";
  const meta = await extractMediaMetadata(bytes, "", kind);
  // Perceptual duplicate scan (images) against other sellers' recent listings.
  if (meta.image?.pHash) {
    const recent = await prisma.marketplaceListing.findMany({
      where: { assetType, sellerId: { not: sellerId } },
      select: { id: true, fileMeta: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    for (const r of recent) {
      const ph = (r.fileMeta as { image?: { pHash?: string } } | null)?.image?.pHash;
      if (typeof ph === "string" && hammingDistance(ph, meta.image.pHash) <= PHASH_HAMMING_THRESHOLD) {
        meta.hints.duplicateOf = r.id;
        break;
      }
    }
  }
  return meta;
}

// GET /api/marketplace/listings - Get marketplace listings
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const assetType = searchParams.get("assetType");
    const subType = searchParams.get("subType");
    const search = searchParams.get("search");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const minAgeMonths = searchParams.get("minAgeMonths");
    const maxAgeMonths = searchParams.get("maxAgeMonths");
    const verifiedOnly = searchParams.get("verified") === "true";
    const monetizedOnly = searchParams.get("monetized") === "true";
    const auctionOnly = searchParams.get("auction") === "true";
    const featuredOnly = searchParams.get("featured") === "true";
    const includeNsfw = searchParams.get("nsfw") === "true";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrderRaw = searchParams.get("sortOrder") || "desc";
    const sortOrder: "asc" | "desc" = sortOrderRaw === "asc" ? "asc" : "desc";
    const sellerId = searchParams.get("sellerId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Self-heal expired promotions so they stop floating to the top.
    void prisma.marketplaceListing
      .updateMany({
        where: { isFeatured: true, featuredUntil: { lt: new Date() } },
        data: { isFeatured: false },
      })
      .catch(() => {});

    const where: Prisma.MarketplaceListingWhereInput = {
      status: MarketplaceListingStatus.ACTIVE,
    };

    if (sellerId) {
      where.sellerId = sellerId;
      if (session?.user?.id === sellerId) {
        delete (where as Record<string, unknown>).status;
      }
    }
    if (category) where.category = category;
    if (assetType) where.assetType = assetType;
    if (subType) where.subType = subType;
    if (verifiedOnly) where.verifiedMetrics = true;
    if (auctionOnly) where.auctionMode = true;
    if (featuredOnly) where.isFeatured = true;
    if (!includeNsfw) where.nsfw = false;

    if (monetizedOnly) {
      where.monthlyRevenue = { gt: 0 };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { niche: { contains: search, mode: "insensitive" } },
      ];
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) (where.price as Record<string, number>).gte = parseFloat(minPrice);
      if (maxPrice) (where.price as Record<string, number>).lte = parseFloat(maxPrice);
    }

    // Asset-age filter (months). Buckets like "<1yr" / "3yr+" map to min/max here.
    if (minAgeMonths || maxAgeMonths) {
      const age: Record<string, number> = {};
      if (minAgeMonths) age.gte = parseInt(minAgeMonths, 10);
      if (maxAgeMonths) age.lte = parseInt(maxAgeMonths, 10);
      where.assetAgeMonths = age;
    }

    // Featured listings always float to the top; secondary sort = chosen sortBy
    const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput[] = [
      { isFeatured: "desc" },
    ];
    if (sortBy === "price") orderBy.push({ price: sortOrder });
    else if (sortBy === "views") orderBy.push({ views: sortOrder });
    else if (sortBy === "revenue") orderBy.push({ monthlyRevenue: sortOrder });
    else orderBy.push({ createdAt: sortOrder });

    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        include: {
          seller: {
            select: { id: true, name: true, avatar: true, level: true },
          },
          _count: { select: { purchases: true, watches: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.marketplaceListing.count({ where }),
    ]);

    type ListingWithCounts = (typeof listings)[number] & {
      _count: { purchases: number; watches: number };
    };

    // Which of these has the current viewer watched?
    let myWatchedIds = new Set<string>();
    if (session?.user?.id && listings.length > 0) {
      const watched = await prisma.marketplaceWatch.findMany({
        where: {
          userId: session.user.id,
          listingId: { in: listings.map((l) => l.id) },
        },
        select: { listingId: true },
      });
      myWatchedIds = new Set(watched.map((w) => w.listingId));
    }

    const formatted = (listings as unknown as ListingWithCounts[]).map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description?.substring(0, 240),
      images: l.images,
      screenshots: l.screenshots,
      category: l.category,
      assetType: l.assetType,
      subType: l.subType,
      price: toNum(l.price),
      currency: l.currency,
      status: l.status,
      views: l.views,
      uniqueViewers: l.uniqueViewers,
      salesCount: l._count.purchases,
      watchCount: l._count.watches,
      isWatched: myWatchedIds.has(l.id),
      monthlyRevenue: toNumOrNull(l.monthlyRevenue),
      monthlyProfit: toNumOrNull(l.monthlyProfit),
      monthlyTraffic: l.monthlyTraffic,
      assetAgeMonths: l.assetAgeMonths,
      niche: l.niche,
      verifiedMetrics: l.verifiedMetrics,
      isFeatured: l.isFeatured,
      isPromoted: l.isPromoted,
      auctionMode: l.auctionMode,
      buyNowPrice: toNumOrNull(l.buyNowPrice),
      startingBid: toNumOrNull(l.startingBid),
      auctionEndsAt: l.auctionEndsAt,
      createdAt: l.createdAt,
      seller: l.seller,
      isOwner: session?.user?.id === l.sellerId,
    }));

    // Asset-type facets (replace category facets for the new UI)
    const assetTypeGroupsRaw = await prisma.marketplaceListing.groupBy({
      by: ["assetType"],
      where: { status: MarketplaceListingStatus.ACTIVE, nsfw: false },
      _count: { _all: true },
    });
    const assetTypeGroups = assetTypeGroupsRaw as unknown as Array<{
      assetType: string;
      _count: { _all: number };
    }>;
    const assetTypeFacets = assetTypeGroups
      .map((g) => ({ assetType: g.assetType, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      listings: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      facets: { assetTypes: assetTypeFacets },
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}

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
  "PLATFORM",
  "STOCK_PHOTO",
  "STOCK_VIDEO",
  "MUSIC",
  "EBOOK",
  "DIGITAL_PRODUCT",
  "SERVICE",
  "OTHER",
] as const;

const userCreateSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
  richDescription: z.string().max(20000).nullable().optional(),
  category: z.string().min(1),
  assetType: z.enum(ASSET_TYPES).default("DIGITAL_PRODUCT"),
  subType: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  price: z.number().positive(),
  currency: z.string().default("USD"),
  // Seller-set affiliate reward (from the seller's cut).
  affiliateCommissionType: z.enum(["PERCENT", "FIXED"]).nullable().optional(),
  affiliateCommissionValue: z.number().min(0).nullable().optional(),
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
  auctionMode: z.boolean().optional(),
  startingBid: z.number().nullable().optional(),
  reservePrice: z.number().nullable().optional(),
  buyNowPrice: z.number().nullable().optional(),
  auctionEndsAt: z.string().nullable().optional(),
});

// POST /api/marketplace/listings — user-side listing creation. Listings start
// in PENDING_REVIEW; an admin approves (→ ACTIVE) or rejects (→ REJECTED, with a
// reason). Stock-media deliverables are analysed (EXIF/codec/hash/pHash) so the
// admin can judge original vs downloaded/edited.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await userCanFeature(session.user.id, "marketplace"))) {
      return NextResponse.json({ error: "Marketplace is disabled for your plan" }, { status: 403 });
    }

    const body = await request.json();
    const v = userCreateSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const data = v.data;

    if (data.subType) {
      const cat = getCategory(data.assetType);
      const ok = cat?.subTypes?.some((s) => s.slug === data.subType);
      if (!ok) {
        return NextResponse.json(
          { error: `subType "${data.subType}" not valid for asset type "${data.assetType}"` },
          { status: 400 }
        );
      }
    }
    const err = validateDetails(
      data.assetType,
      data.subType ?? null,
      data.details ?? {}
    );
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    if (data.auctionMode && !data.auctionEndsAt) {
      return NextResponse.json(
        { error: "Auction mode needs an end date" },
        { status: 400 }
      );
    }

    // Stock media: analyse the uploaded deliverable (files[0]) so the admin can
    // judge original vs downloaded/edited. Best-effort — never blocks creation.
    let fileMeta: MediaMeta | null = null;
    if (requiresDeliverable(data.assetType) && data.files && data.files.length > 0) {
      fileMeta = await analyseDeliverable(
        data.assetType,
        data.files[0],
        session.user.id
      );
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
        details: data.details ? JSON.parse(JSON.stringify(data.details)) : null,
        price: data.price,
        currency: data.currency,
        affiliateCommissionType:
          data.affiliateCommissionValue && data.affiliateCommissionValue > 0
            ? (data.affiliateCommissionType ?? "PERCENT")
            : null,
        affiliateCommissionValue:
          data.affiliateCommissionValue && data.affiliateCommissionValue > 0
            ? data.affiliateCommissionValue
            : null,
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
        auctionMode: data.auctionMode ?? false,
        startingBid: data.startingBid ?? null,
        reservePrice: data.reservePrice ?? null,
        buyNowPrice: data.buyNowPrice ?? null,
        auctionEndsAt: data.auctionEndsAt ? new Date(data.auctionEndsAt) : null,
        fileMeta: fileMeta ? JSON.parse(JSON.stringify(fileMeta)) : undefined,
        // User listings now go through admin moderation before going live.
        status: MarketplaceListingStatus.PENDING_REVIEW,
      },
    });

    // Schedule an exact-time auction close via Inngest (fires at auctionEndsAt).
    if (listing.auctionMode && listing.auctionEndsAt) {
      void inngest.send({
        name: EVENTS.AUCTION_CREATED,
        data: {
          listingId: listing.id,
          auctionEndsAt: listing.auctionEndsAt.toISOString(),
        },
      });
    }

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    console.error("Error creating listing:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create listing" },
      { status: 500 }
    );
  }
}
