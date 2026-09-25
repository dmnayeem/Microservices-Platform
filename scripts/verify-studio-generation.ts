/**
 * Checks the Stock Studio's image pipeline end to end, per provider.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-studio-generation.ts [gemini|openai|fluxDev]
 *
 * Defaults to `gemini` because it is the cheapest of the three to prove with —
 * this script really does generate an image and really does bill for it.
 *
 * What is being asserted is the whole chain, because every link of it had a
 * fault the admin screen reported as something else:
 *
 *   - the shape ids reach the provider translated, not verbatim (the route's
 *     `aspectRatio` cap of 12 characters rejected every shape but Square with a
 *     bare "Invalid input" before any call was made);
 *   - the deliverable lands OUTSIDE `media/` so it stays purchase-gated;
 *   - the watermarked preview lands INSIDE `media/` so the proxy will serve it;
 *   - `previewUrl` is non-empty, because an empty one is what made publishing
 *     fail with `"Watermarked preview" is required`.
 */
import { generateStockImage, studioImageModel } from "../src/lib/marketplace-studio";
import { isGeminiConfigured } from "../src/lib/gemini";
import { isOpenAIConfigured } from "../src/lib/openai-images";
import { isMagnificConfigured } from "../src/lib/magnific";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const id = process.argv[2] || "gemini";
  const model = studioImageModel(id);
  if (!model) {
    console.log(`Unknown model "${id}".`);
    process.exit(1);
  }

  const ready =
    model.provider === "GEMINI"
      ? await isGeminiConfigured()
      : model.provider === "OPENAI"
        ? await isOpenAIConfigured()
        : await isMagnificConfigured();
  if (!ready) {
    console.log(`No key saved for ${model.provider}. Nothing to test.`);
    process.exit(0);
  }

  console.log(`${model.label} (${model.provider}) — generating one 16:9 image…`);
  const t = Date.now();
  const res = await generateStockImage({
    model: id,
    // The shape that used to be rejected outright, on purpose.
    aspectRatio: "widescreen_16_9",
    prompt: "A calm empty wooden desk by a window, soft morning light, top-down",
    watermarkAs: "Preview",
  });
  console.log(`elapsed ${((Date.now() - t) / 1000).toFixed(1)}s`);

  if (!res.success) {
    check("generation succeeded", false, res.error);
    process.exit(1);
  }
  const a = res.data;

  check("a deliverable was stored", !!a.fileUrl, a.fileUrl);
  check(
    "the deliverable is NOT under media/ — it stays purchase-gated",
    a.fileKey.startsWith("marketplace/stock/"),
    a.fileKey
  );
  check("the watermarked preview exists", !!a.previewUrl, a.previewError ?? "");
  check(
    "the preview IS under media/ — the proxy only serves that prefix",
    a.previewUrl.includes("/media/marketplace-previews/"),
    a.previewUrl
  );
  check("nothing reported a preview problem", !a.previewError, a.previewError ?? "");
  check("pixel size was read", !!(a.width && a.height), `${a.width}x${a.height}`);
  check(
    "the shape reached the provider — the image is wider than it is tall",
    !!(a.width && a.height && a.width > a.height),
    `${a.width}x${a.height}`
  );

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  console.log("Note: this left one asset + preview in S3. Delete them if you do not want them.");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
