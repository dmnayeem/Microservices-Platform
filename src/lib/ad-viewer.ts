import "server-only";
import { headers } from "next/headers";
import { adViewerKey, shortHash } from "@/lib/ad-serve-token";

/**
 * Who is looking, as the ad measurement layer sees it — derived from request
 * headers so the serve path (route handlers AND server components) and the
 * beacon routes compute it the same way.
 */
export interface AdViewer {
  userId: string | null;
  ua: string;
  ip: string;
  /** What the serve token binds to (`u:<id>` | `a:<uaHash>`). */
  viewerKey: string;
  /** What the per-viewer rate rules key on (`u:<id>` | `a:<hash(ip|ua)>`). */
  viewerHash: string;
  /** hash(ip|ua) — the burst rule. */
  netHash: string;
}

/** Same precedence as `clientIp()` in rate-limit.ts, for a bare Headers. */
export function ipFromHeaders(h: Headers): string {
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return "unknown";
}

export function viewerFromHeaders(h: Headers | null, userId: string | null | undefined): AdViewer {
  const ua = (h?.get("user-agent") ?? "").slice(0, 400);
  const ip = h ? ipFromHeaders(h) : "unknown";
  const net = shortHash(`${ip}|${ua}`);
  return {
    userId: userId ?? null,
    ua,
    ip,
    viewerKey: adViewerKey(userId, ua),
    viewerHash: userId ? `u:${userId}` : `a:${net}`,
    netHash: net,
  };
}

/** The current request's viewer. Works outside a request too (empty headers). */
export async function currentAdViewer(userId: string | null | undefined): Promise<AdViewer> {
  let h: Headers | null = null;
  try {
    h = (await headers()) as unknown as Headers;
  } catch {
    h = null;
  }
  return viewerFromHeaders(h, userId);
}
