import { NextResponse } from "next/server";
import { Jimp, JimpMime } from "jimp";
import { getSeoSettings } from "@/lib/seo-settings";
import { homeIconSource } from "@/lib/brand-icons";
import { ownMediaKey } from "@/lib/media-url";
import { getObjectStream, isS3Configured } from "@/lib/s3";

/**
 * The home-screen icon at an exact size. Android will not install an app
 * without a 192 and a 512 px icon, and iOS asks for 180 — while the admin
 * uploads one square image of whatever size. This resizes that upload
 * (Apple / home-screen icon, else the logo). Falls back to the stock icon on
 * anything unexpected, so the manifest never points at a broken image.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOCK: Record<string, string> = {
  "180": "/apple-touch-icon.png",
  "192": "/icon-192.png",
  "512": "/icon-512.png",
  // Maskable: the mark inset into Android's safe zone (see maskableIconUrl).
  "512m": "/icon-512-maskable.png",
};

async function readSource(src: string): Promise<Buffer | null> {
  const key = src.startsWith("/api/media/")
    ? decodeURIComponent(src.slice("/api/media/".length))
    : ownMediaKey(src);
  if (key) {
    if (!isS3Configured()) return null;
    const { body } = await getObjectStream(key);
    if (!body) return null;
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  return null;
}

/**
 * The small status-bar icon of a push notification (`badge`).
 *
 * Android draws a badge from its alpha channel alone, in white. Push used the
 * full-colour square icon for it, which is fully opaque, so every RevType push
 * showed a plain white square in the status bar. This cuts the logo out of its
 * background: a pixel's opacity is how far its colour is from the icon's
 * background colour, so the mark comes out white on transparent.
 */
async function badge(req: Request): Promise<NextResponse> {
  const s = await getSeoSettings().catch(() => null);
  const src = s ? homeIconSource(s) : null;
  let bytes: Buffer | null = null;
  if (src && !(src.startsWith("/") && !src.startsWith("/api/media/"))) {
    bytes = await readSource(src).catch(() => null);
  }
  if (!bytes) {
    const res = await fetch(new URL(STOCK["192"], req.url)).catch(() => null);
    bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  if (!bytes) return NextResponse.json({ error: "not found" }, { status: 404 });

  const n = 96;
  const img = await Jimp.read(bytes);
  img.cover({ w: n, h: n });
  // Background = the first opaque colour just inside a corner (the corners
  // themselves are often rounded off to transparent).
  const inset = Math.round(n * 0.1);
  let bg: { r: number; g: number; b: number } | null = null;
  for (const [x, y] of [[inset, inset], [n - inset, inset], [inset, n - inset], [n - inset, n - inset]]) {
    const c = img.getPixelColor(x, y);
    if ((c & 0xff) > 200) {
      bg = { r: (c >>> 24) & 0xff, g: (c >>> 16) & 0xff, b: (c >>> 8) & 0xff };
      break;
    }
  }
  const out = new Jimp({ width: n, height: n, color: 0x00000000 });
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = img.getPixelColor(x, y);
      const a = c & 0xff;
      if (a < 16) continue;
      let alpha = a;
      if (bg) {
        const d = Math.hypot(((c >>> 24) & 0xff) - bg.r, ((c >>> 16) & 0xff) - bg.g, ((c >>> 8) & 0xff) - bg.b);
        alpha = Math.round(Math.max(0, Math.min(1, (d - 40) / 90)) * a);
      }
      if (alpha > 0) out.setPixelColor(((0xffffff00 | alpha) >>> 0), x, y);
    }
  }
  const png = await out.getBuffer(JimpMime.png);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (size === "badge") {
    try {
      return await badge(req);
    } catch (e) {
      console.warn("[app-icon] could not build badge:", (e as Error)?.message);
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  const stock = STOCK[size];
  if (!stock) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fallback = () => NextResponse.redirect(new URL(stock, req.url), 302);

  const s = await getSeoSettings().catch(() => null);
  const src = s ? homeIconSource(s) : null;
  // Nothing uploaded, or a file in /public: the stock icons are already sized.
  if (!src || (src.startsWith("/") && !src.startsWith("/api/media/"))) return fallback();

  try {
    const bytes = await readSource(src);
    if (!bytes) return fallback();
    const maskable = size === "512m";
    const n = maskable ? 512 : Number(size);
    const img = await Jimp.read(bytes);
    const ratio = img.width / Math.max(1, img.height);
    let png: Buffer;
    if (maskable) {
      // The icon's own background colour (just inside a corner) fills the
      // canvas, and the mark sits in the middle 78% — inside the safe zone.
      const sq = img.clone();
      sq.cover({ w: n, h: n });
      const c = sq.getPixelColor(Math.round(n * 0.12), Math.round(n * 0.12));
      const bg = (c & 0xff) > 200 ? ((c | 0xff) >>> 0) : 0x08120dff;
      const inner = Math.round(n * 0.78);
      img.scaleToFit({ w: inner, h: inner });
      const canvas = new Jimp({ width: n, height: n, color: bg });
      canvas.composite(img, Math.round((n - img.width) / 2), Math.round((n - img.height) / 2));
      png = await canvas.getBuffer(JimpMime.png);
    } else if (ratio > 0.87 && ratio < 1.15) {
      // Square enough: fill the icon.
      img.cover({ w: n, h: n });
      png = await img.getBuffer(JimpMime.png);
    } else {
      // A wordmark cropped to a square loses its letters ("evTy"): fit it
      // whole, centred on the app's own background with a safe margin
      // (Android masks the outer ~10% of a maskable icon).
      const inner = Math.round(n * 0.78);
      img.scaleToFit({ w: inner, h: inner });
      const canvas = new Jimp({ width: n, height: n, color: 0x08120dff });
      canvas.composite(img, Math.round((n - img.width) / 2), Math.round((n - img.height) / 2));
      png = await canvas.getBuffer(JimpMime.png);
    }
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // The URL carries ?v=<hash of the upload>, so a new upload is a new URL.
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e) {
    console.warn("[app-icon] could not build icon, using stock:", (e as Error)?.message);
    return fallback();
  }
}
