/**
 * End-to-end check of the Stock Studio pipeline.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-marketplace-studio.ts
 *
 * Exercises the real path an admin takes: store an asset, derive a watermarked
 * preview, write the copy with Gemini, assemble the listing payload, validate
 * it against the category schema, and write the row. Then it asserts the two
 * properties that make a stock listing safe to publish, and cleans up after
 * itself so it can be run against production without leaving debris.
 *
 * Add `--import` to also pull one real icon from the Magnific library. That
 * spends one download from the plan, so it is off by default.
 */
import { prisma } from "./_q";
import {
  storeStockAsset,
  importStockResource,
  generateListingMetadata,
  buildListingPayload,
  slugify,
} from "../src/lib/marketplace-studio";
import { makeWatermarkedPreview, PREVIEW_MAX_EDGE } from "../src/lib/watermark";
import { validateDetails } from "../src/lib/marketplace-categories";
import { isMagnificConfigured } from "../src/lib/magnific";
import { isGeminiConfigured } from "../src/lib/gemini";
import { isS3Configured } from "../src/lib/s3";
import { ownMediaKey } from "../src/lib/media-url";

const DO_IMPORT = process.argv.includes("--import");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

/** A small synthetic PNG so the run costs no generation credits. */
async function testImageBytes(): Promise<Buffer> {
  const { Jimp, JimpMime } = await import("jimp");
  const img = new Jimp({ width: 1600, height: 1200, color: 0x0f766eff });
  for (let x = 0; x < 1600; x += 200) {
    for (let y = 0; y < 1200; y += 200) {
      if (((x / 200) | 0) % 2 === ((y / 200) | 0) % 2) {
        for (let dx = 0; dx < 200; dx++)
          for (let dy = 0; dy < 200; dy++) img.setPixelColor(0xfbbf24ff, x + dx, y + dy);
      }
    }
  }
  return Buffer.from(await img.getBuffer(JimpMime.png));
}

async function main() {
  console.log("Configuration");
  const [magnific, gemini] = await Promise.all([isMagnificConfigured(), isGeminiConfigured()]);
  check("MAGNIFIC_API_KEY set", magnific);
  check("GEMINI_API_KEY set", gemini);
  check("S3 configured", isS3Configured());
  if (!isS3Configured()) {
    console.log("\nS3 is required for the rest of this check.");
    process.exit(1);
  }

  console.log("\nWatermarking");
  const bytes = await testImageBytes();
  const wm = await makeWatermarkedPreview(bytes, "Verify Studio");
  check("preview generated", wm.success, wm.success ? `${wm.width}x${wm.height}` : wm.error);
  check(
    "preview is downscaled below the source",
    wm.success && wm.width < 1600,
    wm.success ? `${wm.width}px wide` : ""
  );
  // Not asserting the preview is smaller on disk: the synthetic source here is
  // flat colour, which PNG stores in a few KB while any JPEG of it is larger.
  // What actually has to hold is the cap on pixel dimensions (above) and that
  // the preview is re-encoded as JPEG rather than passed through.
  check(
    "preview is re-encoded as JPEG",
    wm.success && wm.mime === "image/jpeg" && wm.buffer.subarray(0, 2).toString("hex") === "ffd8",
    wm.success ? wm.mime : ""
  );
  check(
    "preview respects the max-edge cap",
    wm.success && Math.max(wm.width, wm.height) <= PREVIEW_MAX_EDGE,
    wm.success ? `${Math.max(wm.width, wm.height)} ≤ ${PREVIEW_MAX_EDGE}` : ""
  );

  console.log("\nStorage");
  const stored = await storeStockAsset({
    bytes,
    filename: "verify-studio.png",
    contentType: "image/png",
    watermarkAs: "Verify Studio",
  });
  check("asset stored", stored.success, stored.success ? "" : stored.error);
  if (!stored.success) process.exit(1);

  // The whole security model of a stock listing is this pair of assertions.
  check(
    "preview is served by the media proxy (public)",
    ownMediaKey(stored.data.previewUrl) !== null,
    stored.data.previewUrl
  );
  check(
    "deliverable is NOT served by the media proxy (purchase-gated only)",
    ownMediaKey(stored.data.fileUrl) === null,
    stored.data.fileUrl
  );

  let importedOk = true;
  if (DO_IMPORT && magnific) {
    console.log("\nStock library import (spends one download)");
    const imported = await importStockResource({
      resourceId: 3665566,
      kind: "icons",
      watermarkAs: "Verify Studio",
    });
    importedOk = imported.success;
    check("icon imported", imported.success, imported.success ? imported.data.filename : imported.error);
    check(
      "imported filename carries an extension",
      imported.success && /\.[a-z0-9]{2,5}$/i.test(imported.data.filename),
      imported.success ? imported.data.filename : ""
    );
  }

  console.log("\nAI copy");
  const meta = await generateListingMetadata({
    assetType: "STOCK_PHOTO",
    subject: "abstract teal and amber checkerboard pattern for backgrounds",
    brandName: "Verify Studio",
  });
  check("metadata generated", meta.success, meta.success ? meta.data.title : meta.error);
  check(
    "title fits the column limit",
    !meta.success || meta.data.title.length <= 100,
    meta.success ? `${meta.data.title.length} chars` : ""
  );
  check(
    "keywords returned",
    !meta.success || meta.data.keywords.length > 0,
    meta.success ? `${meta.data.keywords.length}` : ""
  );

  const metadata = meta.success
    ? meta.data
    : {
        title: "Verify Studio test asset",
        description: "A synthetic asset created by the studio verification script.",
        richDescription: "",
        keywords: ["test"],
        niche: "test",
      };

  console.log("\nPayload + category validation");
  const payload = buildListingPayload({
    metadata,
    assetType: "STOCK_PHOTO",
    subType: null,
    asset: stored.data,
    price: 4.5,
    brandId: null,
    aiGenerated: true,
    status: "PENDING_REVIEW",
  });
  const detailsErr = validateDetails("STOCK_PHOTO", null, payload.details);
  check("payload passes the category schema", detailsErr === null, detailsErr ?? "");
  check("deliverable is in files[]", payload.files.length === 1, payload.files[0] ?? "none");
  check(
    "only the watermarked preview is in images[]",
    payload.images.length === 1 && payload.images[0] === stored.data.previewUrl,
    payload.images[0] ?? "none"
  );
  check(
    "the sellable file never appears in images[]",
    !payload.images.includes(stored.data.fileUrl)
  );

  console.log("\nDatabase round trip");
  const seller = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  check("an admin account exists to own the listing", !!seller);
  if (!seller) process.exit(1);

  const brandName = `Verify Studio ${Date.now()}`;
  const brand = await prisma.marketplaceBrand.create({
    data: { name: brandName, slug: slugify(brandName) },
  });
  check("brand created", !!brand.id, brand.slug);

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: seller.id,
      brandId: brand.id,
      title: payload.title,
      description: payload.description,
      richDescription: payload.richDescription,
      category: payload.category,
      assetType: payload.assetType,
      subType: payload.subType,
      details: JSON.parse(JSON.stringify(payload.details)),
      price: payload.price,
      currency: payload.currency,
      images: payload.images,
      files: payload.files,
      niche: payload.niche,
      status: "PENDING_REVIEW",
    },
    select: { id: true, brandId: true, status: true },
  });
  check("listing created", !!listing.id, listing.id);
  check("brand is attached", listing.brandId === brand.id);
  check("batch-style output lands in the review queue", listing.status === "PENDING_REVIEW");

  const readBack = await prisma.marketplaceListing.findUnique({
    where: { id: listing.id },
    select: { brand: { select: { name: true, slug: true } } },
  });
  check(
    "brand reads back through the relation",
    readBack?.brand?.name === brandName,
    readBack?.brand?.slug ?? "none"
  );

  console.log("\nCleanup");
  await prisma.marketplaceListing.delete({ where: { id: listing.id } });
  await prisma.marketplaceBrand.delete({ where: { id: brand.id } });
  check("test rows removed", true);

  console.log(
    `\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}` +
      (DO_IMPORT ? "" : "  (stock import skipped — pass --import to include it)")
  );
  if (!importedOk) failures++;
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
