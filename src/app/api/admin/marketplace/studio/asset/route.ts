import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isMagnificConfigured } from "@/lib/magnific";
import { isGeminiConfigured } from "@/lib/gemini";
import {
  generateStockImage,
  importStockResource,
  generateListingMetadata,
  isStudioImageModel,
} from "@/lib/marketplace-studio";
import { z } from "zod";

/**
 * Produce one studio asset: generate it, or import it from the stock library,
 * then write the sales copy for it.
 *
 * Nothing is published here. The route returns a draft the admin reviews,
 * edits and prices; publishing goes through the existing create-listing API so
 * there is one code path validating what reaches the database.
 *
 * One item per request on purpose. Image generation runs 5-20 seconds and the
 * deployment's function ceiling is 60; looping a batch server-side would time
 * out halfway and leave the admin billed for images they never received. The
 * batch mode in the UI calls this repeatedly instead, so each item either
 * lands or fails on its own.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  source: z.enum(["AI_IMAGE", "STOCK_IMPORT"]),
  assetType: z.string().min(2).max(40),
  subType: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  // AI_IMAGE
  model: z.string().optional(),
  prompt: z.string().max(2000).optional(),
  aspectRatio: z.string().max(12).optional(),
  // STOCK_IMPORT
  resourceId: z.union([z.string(), z.number()]).optional(),
  kind: z.enum(["resources", "icons", "videos"]).optional(),
  sourceTitle: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isMagnificConfigured())) {
    return NextResponse.json(
      { error: "MAGNIFIC_API_KEY is not set — add it in Settings → Integrations" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }
  const d = v.data;

  // The brand is only a watermark label at this stage, but resolving it now
  // means a deleted brand fails before any credits are spent.
  let brandName = "Preview";
  if (d.brandId) {
    const brand = await prisma.marketplaceBrand.findUnique({
      where: { id: d.brandId },
      select: { name: true, isActive: true },
    });
    if (!brand) {
      return NextResponse.json({ error: "That brand no longer exists" }, { status: 400 });
    }
    if (!brand.isActive) {
      return NextResponse.json(
        { error: `"${brand.name}" is deactivated — pick an active brand` },
        { status: 400 }
      );
    }
    brandName = brand.name;
  }

  let asset;
  let subject: string;

  if (d.source === "AI_IMAGE") {
    const prompt = (d.prompt ?? "").trim();
    if (prompt.length < 3) {
      return NextResponse.json({ error: "Describe what to generate" }, { status: 400 });
    }
    if (!d.model || !isStudioImageModel(d.model)) {
      return NextResponse.json({ error: "Pick a generation model" }, { status: 400 });
    }
    const gen = await generateStockImage({
      model: d.model,
      prompt,
      watermarkAs: brandName,
      aspectRatio: d.aspectRatio,
    });
    if (!gen.success) {
      return NextResponse.json({ error: gen.error }, { status: gen.status ?? 502 });
    }
    asset = gen.data;
    subject = prompt;
  } else {
    if (d.resourceId === undefined) {
      return NextResponse.json({ error: "Pick an item to import" }, { status: 400 });
    }
    const imported = await importStockResource({
      resourceId: d.resourceId,
      kind: d.kind ?? "resources",
      watermarkAs: brandName,
    });
    if (!imported.success) {
      return NextResponse.json({ error: imported.error }, { status: imported.status ?? 502 });
    }
    asset = imported.data;
    subject = (d.sourceTitle ?? imported.data.filename).trim();
  }

  // The asset is already stored and paid for, so a copywriting failure must not
  // discard it — hand back the asset with empty copy and let the admin type it.
  let metadata = null;
  let metadataError: string | null = null;
  if (await isGeminiConfigured()) {
    const meta = await generateListingMetadata({
      assetType: d.assetType,
      subType: d.subType ?? null,
      subject,
      brandName: d.brandId ? brandName : null,
    });
    if (meta.success) metadata = meta.data;
    else metadataError = meta.error ?? "AI copy failed";
  } else {
    metadataError = "GEMINI_API_KEY is not set — write the copy manually";
  }

  return NextResponse.json({ asset, metadata, metadataError, subject });
}
