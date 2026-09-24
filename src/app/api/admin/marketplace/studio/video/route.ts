import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { isMagnificConfigured, type MagnificFeature } from "@/lib/magnific";
import {
  getCategory,
  validateDetails,
  resolveSaleMode,
} from "@/lib/marketplace-categories";
import {
  startVideoTask,
  generateListingMetadata,
  STUDIO_VIDEO_MODELS,
} from "@/lib/marketplace-studio";
import { isGeminiConfigured } from "@/lib/gemini";
import { z } from "zod";

/**
 * Queue a video generation.
 *
 * Returns as soon as the provider accepts the task — a clip renders for
 * minutes, which no request here can wait out. The listing is created
 * immediately in `PENDING_REVIEW` with no deliverable and the task parked in
 * its `details`; the `magnific-tasks` scheduler job attaches the file when it
 * is ready. `PENDING_REVIEW` is not served to buyers (the public query filters
 * on `ACTIVE`), so a half-built listing is never visible.
 *
 * No webhook is involved. Nothing has to be configured at the provider, and
 * there is no inbound endpoint to secure.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const VIDEO_MODEL_IDS = STUDIO_VIDEO_MODELS.map((m) => m.id) as [string, ...string[]];

const schema = z.object({
  model: z.enum(VIDEO_MODEL_IDS),
  prompt: z.string().min(3).max(2000),
  assetType: z.string().min(2).max(40).default("STOCK_VIDEO"),
  subType: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  price: z.number().positive().max(1_000_000),
  license: z.string().max(60).default("Standard (royalty-free)"),
  /** The still to animate — produced by an earlier studio step. */
  source: z.object({
    fileKey: z.string().min(1),
    previewUrl: z.string().default(""),
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

  const cat = getCategory(d.assetType);
  if (!cat) {
    return NextResponse.json({ error: `Unknown asset type "${d.assetType}"` }, { status: 400 });
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

  // Write the copy BEFORE spending on the clip. If Gemini is down the admin
  // gets a plain fallback rather than a paid-for video attached to a listing
  // that could not be described.
  let metadata = {
    title: d.prompt.slice(0, 100),
    description: d.prompt,
    richDescription: "",
    keywords: [] as string[],
    niche: "",
  };
  if (await isGeminiConfigured()) {
    const meta = await generateListingMetadata({
      assetType: d.assetType,
      subType: d.subType ?? null,
      subject: d.prompt,
      brandName,
    });
    if (meta.success) metadata = meta.data;
  }

  const details: Record<string, unknown> = {
    license: d.license,
    aiGenerated: true,
    keywords: metadata.keywords.join(", "),
  };
  // Validate against the category BEFORE starting the task — a listing that
  // cannot be saved must not cost a video generation first.
  const detailsErr = validateDetails(d.assetType, d.subType ?? null, details);
  if (detailsErr) {
    return NextResponse.json({ error: detailsErr }, { status: 400 });
  }

  const started = await startVideoTask({
    model: d.model as MagnificFeature,
    prompt: d.prompt,
    sourceKey: d.source.fileKey,
  });
  if (!started.success) {
    return NextResponse.json({ error: started.error }, { status: started.status ?? 502 });
  }

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: session.user.id,
      brandId: d.brandId ?? null,
      title: metadata.title,
      description: metadata.description || d.prompt,
      richDescription: metadata.richDescription || null,
      category: cat.label,
      assetType: d.assetType,
      subType: d.subType ?? null,
      // Stock footage, same as the still it came from: licensed repeatedly.
      saleMode: resolveSaleMode(d.assetType, "UNLIMITED"),
      details: {
        ...details,
        // Picked up by `settleMagnificTasks`. Kept on the listing rather than
        // in a queue table: this row IS the pending item, and it shows up in
        // the admin review queue the moment it is queued.
        magnificTaskId: started.data.taskId,
        magnificFeature: d.model,
        magnificExpiresAt: started.data.expiresAt.toISOString(),
        magnificPrompt: d.prompt,
      },
      price: d.price,
      currency: "USD",
      // The still the clip is built from, as a poster until the video lands.
      images: d.source.previewUrl ? [d.source.previewUrl] : [],
      files: [],
      niche: metadata.niche || null,
      status: "PENDING_REVIEW",
    },
    select: { id: true, title: true },
  });

  await writeAudit({
    actorId: session.user.id,
    action: "MARKETPLACE_STUDIO_VIDEO_QUEUED",
    entity: "MarketplaceListing",
    entityId: listing.id,
    summary: `Queued a video generation for "${listing.title}"${brandName ? ` as ${brandName}` : ""}`,
    meta: { model: d.model, taskId: started.data.taskId, prompt: d.prompt },
  });

  return NextResponse.json({
    listing,
    taskId: started.data.taskId,
    expiresAt: started.data.expiresAt.toISOString(),
    message:
      "Queued. The clip renders in the background — it lands in Marketplace → Pending review when it is done.",
  });
}
