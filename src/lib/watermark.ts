/**
 * Preview generation for sellable stock media.
 *
 * A stock listing has to show the buyer what they are buying without handing
 * it over. Two things make a preview safe to publish, and it needs both: it is
 * downscaled (so the public copy is useless at print or 4K size) and it carries
 * a tiled diagonal watermark across the whole frame (so cropping one corner
 * does not clean it up).
 *
 * The full-resolution original never becomes public — it goes to `files[]`,
 * behind the purchase-gated signed-URL route.
 *
 * jimp is pure JS and already a dependency (see `lib/phash.ts`), so this adds
 * no native build step. Everything is loaded lazily: the fonts are ~1MB of
 * bitmap glyphs that a request which never watermarks should not pay for.
 */
/** Longest edge of the public preview, in pixels. */
export const PREVIEW_MAX_EDGE = 1280;

/** How dark the watermark sits over the image (0 = invisible, 1 = solid). */
const WATERMARK_OPACITY = 0.38;

export type WatermarkResult =
  | { success: true; buffer: Buffer; mime: string; width: number; height: number }
  | { success: false; error: string };

/**
 * Downscale + watermark an image.
 *
 * `text` is normally the brand name, so a scraped preview still advertises who
 * it belongs to. Returns JPEG regardless of input: a preview has no reason to
 * carry an alpha channel, and JPEG keeps the public file small.
 */
export async function makeWatermarkedPreview(
  bytes: Buffer,
  text: string,
  opts: { maxEdge?: number } = {}
): Promise<WatermarkResult> {
  const label = (text || "PREVIEW").trim().slice(0, 40) || "PREVIEW";
  const maxEdge = opts.maxEdge ?? PREVIEW_MAX_EDGE;

  try {
    const { Jimp, JimpMime, loadFont, measureText, measureTextHeight } = await import("jimp");
    const fonts = await import("jimp/fonts");

    const img = await Jimp.read(bytes);

    // Only ever shrink. Upscaling a small source would invent detail and make
    // the preview look worse than the file being sold.
    const longest = Math.max(img.width, img.height);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      img.resize({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) });
    }

    // Pick a glyph size proportional to the image so the mark reads the same on
    // a square icon and a wide banner.
    const fontPath =
      img.width >= 900 ? fonts.SANS_32_WHITE : img.width >= 450 ? fonts.SANS_16_WHITE : fonts.SANS_8_WHITE;
    const font = await loadFont(fontPath);

    const textW = measureText(font, label);
    const textH = measureTextHeight(font, label, textW + 8);

    // The text layer is drawn oversized and square, then rotated and centre-
    // cropped. Rotating a layer that only covers the image would leave bare
    // triangles in the corners — exactly where a cropper would aim.
    const diag = Math.ceil(Math.sqrt(img.width ** 2 + img.height ** 2)) + textH * 2;
    const layer = new Jimp({ width: diag, height: diag, color: 0x00000000 });

    const stepX = textW + Math.round(textW * 0.9);
    const stepY = textH * 4;
    let row = 0;
    for (let y = 0; y < diag; y += stepY) {
      // Offset alternate rows so the marks do not line up into clean vertical
      // lanes that are easy to mask out.
      const offset = row % 2 === 0 ? 0 : Math.round(stepX / 2);
      for (let x = -stepX; x < diag; x += stepX) {
        layer.print({ font, x: x + offset, y, text: label });
      }
      row++;
    }

    layer.rotate(-30);
    // rotate() grows the canvas; take the centre back out at image size.
    layer.crop({
      x: Math.max(0, Math.round((layer.width - img.width) / 2)),
      y: Math.max(0, Math.round((layer.height - img.height) / 2)),
      w: Math.min(layer.width, img.width),
      h: Math.min(layer.height, img.height),
    });
    layer.opacity(WATERMARK_OPACITY);

    img.composite(layer, 0, 0);

    const buffer = await img.getBuffer(JimpMime.jpeg, { quality: 82 });
    return { success: true, buffer, mime: "image/jpeg", width: img.width, height: img.height };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Read an image's pixel dimensions without watermarking it.
 *
 * Used to prefill the `resolution` detail field, so the admin is not retyping
 * what the file already states.
 */
export async function readImageSize(
  bytes: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const { Jimp } = await import("jimp");
    const img = await Jimp.read(bytes);
    return { width: img.width, height: img.height };
  } catch {
    return null;
  }
}
