import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { toNum } from "@/lib/money";
import {
  getCategory,
  validateDetails,
  resolveSaleMode,
} from "@/lib/marketplace-categories";
import { buildListingPayload } from "@/lib/marketplace-studio";
import { z } from "zod";

/**
 * Publish one studio draft as a marketplace listing.
 *
 * Separate from the general admin create route because the shape is different:
 * the studio already holds a stored asset and generated copy, and needs the
 * payload assembled server-side — `buildListingPayload` lives next to the
 * pipeline that produced the asset, and pulling it into the browser would drag
 * the S3 and Magnific clients with it.
 *
 * The listing's `sellerId` is the publishing admin. A brand only changes the
 * name the buyer sees; payouts, escrow and the deliverable download gate all
 * still key off the real account.
 */
export const runtime = "nodejs";

const schema = z.object({
  assetType: z.string().min(2).max(40),
  subType: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  price: z.number().positive().max(1_000_000),
  license: z.string().max(60).optional(),
  aiGenerated: z.boolean().default(false),
  status: z.enum(["ACTIVE", "PENDING_REVIEW"]).default("ACTIVE"),
  coverImageUrl: z.string().url().nullable().optional(),
  asset: z.object({
    fileUrl: z.string().url(),
    fileKey: z.string().default(""),
    previewUrl: z.string().default(""),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    bytes: z.number().optional(),
  }),
  metadata: z.object({
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(1000),
    richDescription: z.string().max(20000).default(""),
    keywords: z.array(z.string()).default([]),
    niche: z.string().max(120).default(""),
  }),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }
  const d = v.data;

  const cat = getCategory(d.assetType);
  if (!cat) {
    return NextResponse.json({ error: `Unknown asset type "${d.assetType}"` }, { status: 400 });
  }
  if (d.subType && !cat.subTypes?.some((s) => s.slug === d.subType)) {
    return NextResponse.json(
      { error: `"${d.subType}" is not a sub-type of ${cat.label}` },
      { status: 400 }
    );
  }

  let brandName: string | null = null;
  if (d.brandId) {
    const brand = await prisma.marketplaceBrand.findUnique({
      where: { id: d.brandId },
      select: { name: true, isActive: true },
    });
    if (!brand) return NextResponse.json({ error: "That brand no longer exists" }, { status: 400 });
    if (!brand.isActive) {
      return NextResponse.json({ error: `"${brand.name}" is deactivated` }, { status: 400 });
    }
    brandName = brand.name;
  }

  const payload = buildListingPayload({
    metadata: {
      title: d.metadata.title,
      description: d.metadata.description,
      richDescription: d.metadata.richDescription,
      keywords: d.metadata.keywords,
      niche: d.metadata.niche,
    },
    assetType: d.assetType,
    subType: d.subType ?? null,
    asset: {
      fileUrl: d.asset.fileUrl,
      fileKey: d.asset.fileKey,
      previewUrl: d.asset.previewUrl,
      width: d.asset.width ?? null,
      height: d.asset.height ?? null,
      bytes: d.asset.bytes ?? 0,
    },
    price: d.price,
    brandId: d.brandId ?? null,
    coverImageUrl: d.coverImageUrl ?? null,
    license: d.license,
    aiGenerated: d.aiGenerated,
    status: d.status,
  });

  // The category schema is the same gate the seller-facing form goes through;
  // a required field the studio could not fill (a cover image for an ebook,
  // say) has to surface here rather than producing a half-formed listing.
  const detailsErr = validateDetails(d.assetType, d.subType ?? null, payload.details);
  if (detailsErr) {
    return NextResponse.json({ error: detailsErr }, { status: 400 });
  }

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: session.user.id,
      brandId: payload.brandId,
      title: payload.title,
      description: payload.description,
      richDescription: payload.richDescription,
      category: payload.category,
      assetType: payload.assetType,
      subType: payload.subType,
      // Studio output is stock: a photo or clip is licensed to every buyer who
      // wants it, so it must not leave the shop after the first $5 sale.
      // resolveSaleMode clamps this back to ONE_OFF for any category that
      // cannot be sold repeatedly.
      saleMode: resolveSaleMode(d.assetType, "UNLIMITED"),
      details: JSON.parse(JSON.stringify(payload.details)),
      price: payload.price,
      currency: payload.currency,
      images: payload.images,
      files: payload.files,
      niche: payload.niche,
      status: payload.status,
    },
    select: { id: true, title: true, price: true, status: true },
  });

  await writeAudit({
    actorId: session.user.id,
    action: "MARKETPLACE_STUDIO_PUBLISH",
    entity: "MarketplaceListing",
    entityId: listing.id,
    summary: `Published "${listing.title}" from Stock Studio${brandName ? ` as ${brandName}` : ""} at $${toNum(listing.price)}`,
    meta: {
      assetType: d.assetType,
      subType: d.subType ?? null,
      brand: brandName,
      aiGenerated: d.aiGenerated,
      status: listing.status,
    },
  });

  return NextResponse.json({
    listing: { ...listing, price: toNum(listing.price) },
  });
}
