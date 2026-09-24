import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { validateMediaFile } from "@/lib/s3";
import { isGeminiConfigured } from "@/lib/gemini";
import { storeStockAsset, generateListingMetadata } from "@/lib/marketplace-studio";

/**
 * The third studio source: the admin's own file.
 *
 * Goes through exactly the same store-and-watermark path as a generated or
 * imported asset, so an uploaded photo is protected the same way — the
 * full-resolution file stays behind the purchase gate and only a watermarked
 * downscale is public.
 *
 * Multipart rather than a presigned direct-to-S3 upload because the server has
 * to read the bytes anyway to derive the preview.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Keep well under the platform body limit; bigger deliverables belong in the
 *  existing multipart uploader, not in a one-shot studio post. */
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/epub+zip",
  "application/zip",
];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }

  const check = validateMediaFile(file.type || "application/octet-stream", file.size, ALLOWED, MAX_BYTES);
  if (!check.isValid) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const assetType = String(form.get("assetType") ?? "DIGITAL_PRODUCT");
  const subType = (form.get("subType") as string) || null;
  const brandId = (form.get("brandId") as string) || null;

  let brandName = "Preview";
  if (brandId) {
    const brand = await prisma.marketplaceBrand.findUnique({
      where: { id: brandId },
      select: { name: true, isActive: true },
    });
    if (!brand) return NextResponse.json({ error: "That brand no longer exists" }, { status: 400 });
    if (!brand.isActive) {
      return NextResponse.json({ error: `"${brand.name}" is deactivated` }, { status: 400 });
    }
    brandName = brand.name;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeStockAsset({
    bytes,
    filename: file.name || "upload",
    contentType: file.type || "application/octet-stream",
    watermarkAs: brandName,
    // Only images have pixels to watermark. Anything else keeps its cover
    // image from the category fields instead.
    previewable: (file.type || "").startsWith("image/"),
  });
  if (!stored.success) {
    return NextResponse.json({ error: stored.error }, { status: 502 });
  }

  const subject = (form.get("subject") as string) || file.name || "digital asset";

  let metadata = null;
  let metadataError: string | null = null;
  if (await isGeminiConfigured()) {
    const meta = await generateListingMetadata({
      assetType,
      subType,
      subject,
      brandName: brandId ? brandName : null,
    });
    if (meta.success) metadata = meta.data;
    else metadataError = meta.error ?? "AI copy failed";
  } else {
    metadataError = "GEMINI_API_KEY is not set — write the copy manually";
  }

  return NextResponse.json({ asset: stored.data, metadata, metadataError, subject });
}
