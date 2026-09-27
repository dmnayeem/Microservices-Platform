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

const STOCK: Record<string, string> = { "180": "/apple-touch-icon.png", "192": "/icon-192.png", "512": "/icon-512.png" };

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

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
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
    const n = Number(size);
    const img = await Jimp.read(bytes);
    const ratio = img.width / Math.max(1, img.height);
    let png: Buffer;
    if (ratio > 0.87 && ratio < 1.15) {
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
