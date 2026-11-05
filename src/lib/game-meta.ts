import "server-only";
import { prisma } from "@/lib/prisma";
import { guardUrl, safeFetchJson } from "@/lib/safe-fetch";
import { fetchRawBytes, fetchRawHtml } from "@/lib/link-preview";
import { inspectUpload } from "@/lib/upload-safety";
import { enforceDisplayImage } from "@/lib/image-compress-server";
import {
  uploadFile,
  isS3Configured,
  getMediaUrl,
  getMediaFileType,
  generateMediaFilename,
  getMediaS3KeyPath,
} from "@/lib/s3";

/**
 * What a game's own page says about itself: name, blurb, a square icon and a
 * wide cover. The admin pastes the game link first and the Basics tab fills
 * itself in from this.
 *
 *   cover ← og:image / twitter:image
 *   icon  ← the largest apple-touch-icon / sized <link rel=icon> / web app
 *           manifest icon; falls back to the cover
 *
 * Both images are copied into our media library, so a game never depends on
 * the other site keeping the file, and the player loads them from our CDN.
 * If copying fails the remote https address is used as-is (iconUrl accepts
 * any address, as bulk import already relies on).
 */
export interface GameMeta {
  title: string;
  description: string;
  iconUrl: string | null;
  coverUrl: string | null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/** Attributes of every tag named `tag`, lowercased keys. */
function tags(html: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  for (const m of html.matchAll(re)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[a[1].toLowerCase()] = decode(a[3] ?? a[4] ?? a[5] ?? "");
    }
    out.push(attrs);
  }
  return out;
}

function meta(html: string, names: string[]): string {
  const all = tags(html, "meta");
  for (const n of names) {
    const hit = all.find((t) => (t.property ?? t.name ?? "").toLowerCase() === n && t.content);
    if (hit) return hit.content;
  }
  return "";
}

const sizeOf = (sizes?: string) => {
  const m = (sizes ?? "").match(/(\d+)x(\d+)/i);
  return m ? Math.min(+m[1], +m[2]) : 0;
};

function abs(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Raster formats we keep, from the bytes rather than the file name. */
function sniffMime(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return null;
}

/** Copy a remote image into the media library; the remote URL when that fails. */
async function mirror(url: string, purpose: "thumbnail" | "cover", userId: string): Promise<string | null> {
  const bytes = await fetchRawBytes(url, { userId });
  const mime = bytes ? sniffMime(bytes) : null;
  if (!bytes || !mime) return null; // not a usable image at all
  if (!isS3Configured()) return url.startsWith("https://") ? url : null;
  try {
    const name = `game-${purpose}.${mime.split("/")[1]}`;
    if (inspectUpload(name, mime, bytes).block.length) return null;
    const stored = await enforceDisplayImage(bytes, mime, name, purpose);
    const filename = generateMediaFilename(stored.fileName);
    const s3Key = getMediaS3KeyPath(stored.mime, filename);
    const up = await uploadFile(s3Key, stored.buffer, stored.mime, { originalFilename: name, uploadedBy: userId });
    if (!up.success) return url.startsWith("https://") ? url : null;
    const { s3Url, cloudFrontUrl } = getMediaUrl(s3Key);
    await prisma.media.create({
      data: {
        filename,
        originalFilename: name,
        fileType: getMediaFileType(stored.mime),
        mimeType: stored.mime,
        fileSize: stored.buffer.length,
        s3Key,
        s3Url,
        cloudFrontUrl,
        uploadedById: userId,
      },
    });
    return cloudFrontUrl || s3Url;
  } catch (e) {
    console.error("[game-meta] mirror failed:", e);
    return url.startsWith("https://") ? url : null;
  }
}

async function manifestIcon(html: string, base: URL, userId: string): Promise<string | null> {
  const link = tags(html, "link").find((t) => (t.rel ?? "").toLowerCase().split(/\s+/).includes("manifest") && t.href);
  const href = link ? abs(link.href, base) : null;
  if (!href) return null;
  try {
    const { body: m } = await safeFetchJson<{ icons?: { src?: string; sizes?: string }[] }>(href, {
      timeoutMs: 8_000,
      maxBytes: 256 * 1024,
      userId,
      purpose: "game_meta",
    });
    const best = (m.icons ?? [])
      .filter((i) => i.src && !/\.svg($|\?)/i.test(i.src))
      .sort((a, b) => sizeOf(b.sizes) - sizeOf(a.sizes))[0];
    return best?.src ? abs(best.src, new URL(href)) : null;
  } catch {
    return null;
  }
}

export async function fetchGameMeta(rawUrl: string, userId: string): Promise<GameMeta | null> {
  const base = await guardUrl(rawUrl);
  const html = await fetchRawHtml(base.toString(), undefined, undefined, { userId });
  if (!html) return null;

  const title =
    meta(html, ["og:title", "twitter:title", "application-name", "apple-mobile-web-app-title"]) ||
    decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  const description = meta(html, ["og:description", "twitter:description", "description"]);

  const coverSrc = meta(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]);
  const cover = coverSrc ? abs(coverSrc, base) : null;

  // Largest declared icon first; apple-touch-icon is usually 180px and square.
  const iconLinks = tags(html, "link")
    .filter((t) => {
      const rel = (t.rel ?? "").toLowerCase();
      return t.href && (rel.includes("apple-touch-icon") || rel.split(/\s+/).includes("icon")) && !/\.(svg|ico)($|\?)/i.test(t.href);
    })
    .map((t) => ({
      href: abs(t.href, base),
      size: sizeOf(t.sizes) || ((t.rel ?? "").toLowerCase().includes("apple-touch-icon") ? 180 : 0),
    }))
    .filter((t): t is { href: string; size: number } => !!t.href)
    .sort((a, b) => b.size - a.size);

  const manifest = await manifestIcon(html, base, userId);
  const iconCandidates = [...iconLinks.map((i) => i.href), ...(manifest ? [manifest] : [])];

  let iconUrl: string | null = null;
  for (const c of iconCandidates.slice(0, 4)) {
    iconUrl = await mirror(c, "thumbnail", userId);
    if (iconUrl) break;
  }
  const coverUrl = cover ? await mirror(cover, "cover", userId) : null;
  if (!iconUrl && coverUrl) iconUrl = coverUrl;

  return {
    title: title.slice(0, 120),
    description: description.slice(0, 2000),
    iconUrl,
    coverUrl,
  };
}
