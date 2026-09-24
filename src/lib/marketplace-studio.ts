/**
 * Stock Studio — the admin pipeline that turns a prompt, a stock-library pick,
 * or an uploaded file into a publishable marketplace listing.
 *
 * Three sources feed one pipeline:
 *
 *   AI_IMAGE     prompt → Magnific text-to-image → bytes
 *   STOCK_IMPORT Magnific library pick → signed download → bytes
 *   UPLOAD       admin's own file → bytes
 *
 * From there every path is identical: store the full-resolution original
 * privately, derive a downscaled watermarked preview for the public gallery,
 * ask Gemini for the title/description/keywords, and hand the admin a draft to
 * price and publish.
 *
 * Why the original is never the preview: `images[]` renders to anyone browsing,
 * while `files[]` is served only through the purchase-gated signed-URL route
 * (`api/marketplace/listings/[id]/download`). Putting the sellable file in
 * `images[]` would give the whole catalogue away for free.
 */
import { generateJson } from "@/lib/gemini";
import {
  runTask,
  startTask,
  getStockDownload,
  type MagnificFeature,
  type MagnificResult,
  type StockKind,
} from "@/lib/magnific";
import { makeWatermarkedPreview, readImageSize } from "@/lib/watermark";
import { generateFileKey, uploadFile, isS3Configured, getDownloadUrl } from "@/lib/s3";
import { getCategory, ASSET_TYPE_LABEL } from "@/lib/marketplace-categories";

export type StudioSource = "AI_IMAGE" | "STOCK_IMPORT" | "UPLOAD";

/**
 * Image models the studio offers, cheapest-and-fastest first.
 *
 * Deliberately a short list rather than every model Magnific exposes: an admin
 * filling a catalogue wants "good and cheap" or "best quality", not a research
 * menu. `mystic` is the quality option; `fluxDev` is the volume option.
 */
export const STUDIO_IMAGE_MODELS: {
  id: MagnificFeature;
  label: string;
  hint: string;
}[] = [
  { id: "fluxDev", label: "Flux Dev — fast", hint: "Cheapest. Good for filling a catalogue." },
  { id: "hyperflux", label: "Hyperflux — fastest", hint: "Lowest latency, slightly softer detail." },
  { id: "mystic", label: "Mystic — best quality", hint: "Highest fidelity. Costs the most per image." },
  { id: "seedream", label: "Seedream 4.5", hint: "Strong at graphic and illustrated styles." },
  { id: "textToIcon", label: "Icon", hint: "Flat icon on a transparent background." },
];

const IMAGE_MODEL_IDS = new Set(STUDIO_IMAGE_MODELS.map((m) => m.id));

export function isStudioImageModel(id: string): id is MagnificFeature {
  return IMAGE_MODEL_IDS.has(id as MagnificFeature);
}

/**
 * Video models the studio offers.
 *
 * Only Hailuo. Its request contract was verified against the live API
 * (`prompt` required, the still goes in `first_frame_image`, `duration` must be
 * 6), whereas Kling accepts an empty body, starts a task and bills for it — a
 * single typo there is a silently wasted video generation, which is the most
 * expensive kind of mistake this pipeline can make.
 */
export const STUDIO_VIDEO_MODELS: { id: MagnificFeature; label: string; hint: string }[] = [
  {
    id: "hailuo",
    label: "Hailuo 02 — 1080p",
    hint: "Animates a still image into a 6-second 1080p clip.",
  },
];

/** Hailuo only accepts this exact duration; the API rejects anything else. */
const HAILUO_DURATION = 6;

/**
 * How long a Magnific result URL stays fetchable, measured from when the task
 * was created.
 *
 * Verified, because it decides the whole polling design: re-requesting a
 * finished task returns the SAME signed URL with the SAME expiry rather than
 * minting a fresh one, and once it lapses the asset is gone for good with the
 * credits already spent. Set below the observed ~1 hour so a task is abandoned
 * while the reason is still diagnosable, not silently 403ing.
 */
export const TASK_RESULT_TTL_MS = 50 * 60_000;

export type ListingMetadata = {
  title: string;
  description: string;
  richDescription: string;
  keywords: string[];
  niche: string;
};

/** Clamp to the column limits the create route enforces, so a chatty model
 *  cannot produce a draft that fails validation on publish. */
const LIMITS = { title: 100, description: 1000, rich: 20000, niche: 120 } as const;

function clampText(v: unknown, max: number, fallback = ""): string {
  const s = typeof v === "string" ? v.trim() : "";
  return (s || fallback).slice(0, max);
}

/**
 * Ask Gemini for the sales copy.
 *
 * The prompt asks for strict JSON and `generateJson` pins `responseMimeType`,
 * but the result is still clamped and defaulted field by field — a model that
 * returns a 300-character "title" must not be able to fail the publish call
 * after the credits for the image have already been spent.
 */
export async function generateListingMetadata(input: {
  assetType: string;
  subType?: string | null;
  /** What the admin asked for, or the source item's own title when importing. */
  subject: string;
  brandName?: string | null;
  audience?: string | null;
}): Promise<MagnificResult<ListingMetadata>> {
  const cat = getCategory(input.assetType);
  const typeLabel = cat?.label ?? ASSET_TYPE_LABEL[input.assetType] ?? input.assetType;
  const subject = input.subject.trim().slice(0, 600);

  if (!subject) return { success: false, error: "Nothing to describe" };

  const prompt = `You are writing a marketplace product listing for a digital goods store.

Item type: ${typeLabel}${input.subType ? ` (${input.subType})` : ""}
Subject: ${subject}
${input.brandName ? `Sold by: ${input.brandName}` : ""}
${input.audience ? `Target buyer: ${input.audience}` : ""}

Return ONLY a JSON object with exactly these keys:
{
  "title": "under 70 characters, specific and searchable, no quotes, no emoji",
  "description": "2 to 3 sentences, under 400 characters, plain text, says what the buyer receives",
  "richDescription": "markdown, 120-250 words: what it is, what is included, typical uses, licence note. Use short paragraphs and a bullet list. No headings above level 3.",
  "keywords": ["12 to 18 lowercase search keywords, single or two-word, no hashtags"],
  "niche": "2-4 word category niche, e.g. 'business photography'"
}
Write for buyers, not for search engines. Do not invent awards, review counts, download counts, or any statistic you cannot know.`;

  const res = await generateJson(prompt, { temperature: 0.8 });
  if (!res.success || !res.data) {
    return { success: false, error: res.error ?? "AI did not return usable copy" };
  }

  const d = res.data;
  const keywords = Array.isArray(d.keywords)
    ? d.keywords
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim().toLowerCase().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 24)
    : [];

  return {
    success: true,
    data: {
      title: clampText(d.title, LIMITS.title, subject.slice(0, LIMITS.title)),
      description: clampText(d.description, LIMITS.description, subject),
      richDescription: clampText(d.richDescription, LIMITS.rich),
      keywords,
      niche: clampText(d.niche, LIMITS.niche),
    },
  };
}

export type StoredAsset = {
  /** Full-resolution deliverable. Private; goes in `files[]`. */
  fileUrl: string;
  /**
   * The deliverable's raw S3 key. Kept because a presigned URL can only be
   * minted from the key, and handing an outside service (Magnific, for a video
   * source frame) a short-lived presigned link is how we let it read a private
   * object without making anything permanently public.
   */
  fileKey: string;
  /** Watermarked, downscaled. Public; goes in `images[]`. */
  previewUrl: string;
  width: number | null;
  height: number | null;
  /** Bytes of the deliverable, for the size hint on the review screen. */
  bytes: number;
};

/**
 * Put one asset into S3 as a deliverable + public preview pair.
 *
 * `watermarkAs` names the brand stamped across the preview. When the bytes are
 * not a decodable image (a video, an audio file, a PDF) there is no preview to
 * derive, and `previewUrl` comes back empty — the caller supplies a cover image
 * instead, which is what the EBOOK / STOCK_VIDEO category fields already ask
 * for.
 */
export async function storeStockAsset(input: {
  bytes: Buffer;
  filename: string;
  contentType: string;
  watermarkAs: string;
  /** Skip preview generation (already have a cover, or not an image). */
  previewable?: boolean;
}): Promise<MagnificResult<StoredAsset>> {
  if (!isS3Configured()) return { success: false, error: "S3 is not configured" };

  // Deliberately OUTSIDE the `media/` prefix. `/api/media/[...key]` will only
  // proxy `media/`, `task-proofs/` and `posts/`, so a deliverable stored here
  // has exactly one way out: the purchase-gated signed URL. Move it under
  // `media/` and the whole catalogue becomes free to anyone who guesses a key.
  const fileKey = generateFileKey("marketplace/stock", input.filename);
  const up = await uploadFile(fileKey, input.bytes, input.contentType);
  if (!up.success || !up.url) {
    return { success: false, error: up.error ?? "Could not store the deliverable" };
  }

  const size = input.previewable === false ? null : await readImageSize(input.bytes);

  let previewUrl = "";
  if (size) {
    const wm = await makeWatermarkedPreview(input.bytes, input.watermarkAs);
    if (wm.success) {
      // Under `media/` on purpose: that is one of the three prefixes both the
      // `/api/media` proxy route and `mediaSrc()` agree to serve, and the
      // bucket is private so an un-proxied URL renders blank. The two
      // allowlists have to match — see lib/media-url.ts.
      const previewKey = generateFileKey(
        "media/marketplace-previews",
        input.filename.replace(/\.[^.]+$/, "") + "-preview.jpg"
      );
      const pUp = await uploadFile(previewKey, wm.buffer, "image/jpeg");
      // A missing preview is recoverable (the admin can upload a cover), a
      // missing deliverable is not — so this failure is not fatal.
      if (pUp.success && pUp.url) previewUrl = pUp.url;
    }
  }

  return {
    success: true,
    data: {
      fileUrl: up.url,
      fileKey,
      previewUrl,
      width: size?.width ?? null,
      height: size?.height ?? null,
      bytes: input.bytes.length,
    },
  };
}

/**
 * Generate an image with Magnific and store it as a deliverable + preview.
 *
 * Magnific's own result URLs expire within hours, so the bytes are pulled
 * immediately rather than recorded as a link.
 */
export async function generateStockImage(input: {
  model: MagnificFeature;
  prompt: string;
  watermarkAs: string;
  aspectRatio?: string;
}): Promise<MagnificResult<StoredAsset & { sourceUrl: string }>> {
  const body: Record<string, unknown> = { prompt: input.prompt };
  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;

  const task = await runTask(input.model, body, { timeoutMs: 120_000 });
  if (!task.success) return task;

  const sourceUrl = task.data.generated[0];
  if (!sourceUrl) return { success: false, error: "The model returned no image" };

  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) {
    return { success: false, error: `Could not download the result (HTTP ${res.status})` };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";

  const stored = await storeStockAsset({
    bytes,
    filename: `${slugify(input.prompt).slice(0, 48) || "generated"}.${ext}`,
    contentType,
    watermarkAs: input.watermarkAs,
  });
  if (!stored.success) return stored;

  return { success: true, data: { ...stored.data, sourceUrl } };
}

/**
 * Import one item from the Magnific stock library.
 *
 * The download call is what consumes the plan's quota, so it runs once and the
 * bytes are stored immediately — the minted URL is short-lived too.
 */
export async function importStockResource(input: {
  resourceId: number | string;
  kind?: StockKind;
  watermarkAs: string;
}): Promise<MagnificResult<StoredAsset & { filename: string }>> {
  const dl = await getStockDownload(input.resourceId, input.kind ?? "resources");
  if (!dl.success) return dl;

  const res = await fetch(dl.data.url, { cache: "no-store" });
  if (!res.ok) {
    return { success: false, error: `Could not download the asset (HTTP ${res.status})` };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";

  // Icons come back named "coin" with no extension, which would store an
  // extensionless object that browsers refuse to render. Take the extension
  // from the URL path when the filename has none.
  let filename = dl.data.filename || `stock-${input.resourceId}`;
  if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
    const fromUrl = new URL(dl.data.url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    filename = `${filename}.${fromUrl?.[1] ?? "bin"}`;
  }

  // Library downloads arrive as .zip bundles (AI/EPS/JPG together) as often as
  // bare images, and a zip has no previewable pixels.
  const previewable = !/\.zip$/i.test(filename) && !contentType.includes("zip");

  const stored = await storeStockAsset({
    bytes,
    filename,
    contentType,
    watermarkAs: input.watermarkAs,
    previewable,
  });
  if (!stored.success) return stored;

  return { success: true, data: { ...stored.data, filename } };
}

/**
 * Kick off a video generation and return immediately.
 *
 * Deliberately does NOT wait: a clip takes minutes, well past the function
 * ceiling. The task id is handed back so the caller can park it on a listing
 * for the `magnific-tasks` scheduler job to settle later.
 *
 * The source still lives in our private bucket, so Magnific is given a
 * short-lived presigned URL rather than anything permanently public. It only
 * has to be readable while the clip renders.
 */
export async function startVideoTask(input: {
  model: MagnificFeature;
  prompt: string;
  /** S3 key of the still to animate (a StoredAsset's `fileKey`). */
  sourceKey: string;
}): Promise<MagnificResult<{ taskId: string; expiresAt: Date }>> {
  const signed = await getDownloadUrl(input.sourceKey, 3600);
  if (!signed.success || !signed.downloadUrl) {
    return { success: false, error: signed.error ?? "Could not share the source image" };
  }

  const started = await startTask(input.model, {
    prompt: input.prompt,
    first_frame_image: signed.downloadUrl,
    duration: HAILUO_DURATION,
  });
  if (!started.success) return started;

  return {
    success: true,
    data: {
      taskId: started.data.task_id,
      expiresAt: new Date(Date.now() + TASK_RESULT_TTL_MS),
    },
  };
}

export function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Turn a studio draft into the body the admin create-listing API expects.
 *
 * Keeping this in one place means the single-item screen and the batch runner
 * cannot drift into producing differently-shaped listings.
 */
export function buildListingPayload(input: {
  metadata: ListingMetadata;
  assetType: string;
  subType?: string | null;
  asset: StoredAsset;
  price: number;
  brandId?: string | null;
  coverImageUrl?: string | null;
  license?: string;
  aiGenerated: boolean;
  status: "ACTIVE" | "PENDING_REVIEW";
}) {
  const cat = getCategory(input.assetType);
  const preview = input.coverImageUrl || input.asset.previewUrl;

  // Only send `details` keys the category actually declares — the create route
  // validates the blob against the category schema and rejects unknown shapes.
  const declared = new Set((cat?.fields ?? []).map((f) => f.key));
  const candidate: Record<string, unknown> = {
    keywords: input.metadata.keywords.join(", "),
    aiGenerated: input.aiGenerated,
    license: input.license ?? "Standard (royalty-free)",
    resolution:
      input.asset.width && input.asset.height
        ? `${input.asset.width}×${input.asset.height}`
        : undefined,
    orientation:
      input.asset.width && input.asset.height
        ? input.asset.width === input.asset.height
          ? "Square"
          : input.asset.width > input.asset.height
            ? "Landscape"
            : "Portrait"
        : undefined,
    previewImage: preview || undefined,
    coverImage: preview || undefined,
  };
  const byKey = new Map((cat?.fields ?? []).map((f) => [f.key, f]));
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (v === undefined || !declared.has(k)) continue;
    // The same key can be free text in one category and a fixed dropdown in
    // another: `resolution` is TEXT on a stock photo but a SELECT of 720p/1080p/…
    // on a stock video. Feeding "1920×1080" into the SELECT would fail
    // `validateDetails` at publish time, after the asset is already paid for.
    const field = byKey.get(k);
    if (field?.type === "SELECT" && !(field.options ?? []).includes(String(v))) {
      continue;
    }
    details[k] = v;
  }

  return {
    title: input.metadata.title,
    description: input.metadata.description,
    richDescription: input.metadata.richDescription || null,
    category: cat?.label ?? input.assetType,
    assetType: input.assetType,
    subType: input.subType ?? null,
    details,
    price: input.price,
    currency: "USD",
    images: preview ? [preview] : [],
    files: [input.asset.fileUrl],
    niche: input.metadata.niche || null,
    brandId: input.brandId ?? null,
    status: input.status,
  };
}
