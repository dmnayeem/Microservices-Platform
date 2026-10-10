import { NextRequest, NextResponse } from "next/server";
import { AD_FILL_PROBE } from "@/lib/ad-networks/fill-probe";
import { prisma } from "@/lib/prisma";
import { adFrameHost } from "@/lib/ad-networks/frame";
import { getAdNetwork } from "@/lib/ad-networks/registry";
import { snippetHosts } from "@/lib/ad-networks/snippet";
import { SITE_URL } from "@/lib/seo/site-url";

export const runtime = "nodejs";

/**
 * The document a third-party HTML ad runs in, served from the SEPARATE ad
 * origin (`AD_FRAME_ORIGIN`, e.g. https://ads.revtype.com).
 *
 * See `src/lib/ad-networks/frame.ts` for why: network code that needs cookies
 * or storage cannot work in an opaque `srcDoc` frame, and must never be given
 * the app's own origin. Framed with `allow-same-origin` from a different host,
 * the ad gets an origin of its own and nothing of revtype.com.
 *
 * Hard rules, all enforced here rather than trusted to deployment:
 *
 *  - **404 unless AD_FRAME_ORIGIN is set.** Served from the main host, this
 *    document would run third-party script AS revtype.com — top-level, with
 *    the viewer's cookies on every same-origin request it makes.
 *  - **404 unless the request's Host is the frame host.** The same app answers
 *    on both names; only the ad name may serve ad code.
 *  - **No session is read.** The route never calls `auth()`, so nothing about
 *    the viewer reaches the ad.
 *  - **`frame-ancestors`** limits who may embed it to the app itself, so the
 *    frame cannot be stacked into somebody else's page to farm impressions.
 */

function requestHost(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-host");
  const raw = (fwd ? fwd.split(",")[0] : req.headers.get("host")) ?? "";
  return raw.trim().toLowerCase();
}

function appOrigins(): string[] {
  const out = new Set<string>();
  for (const raw of [SITE_URL, process.env.NEXTAUTH_URL, process.env.AUTH_URL]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      out.add(u.origin);
      // apex <-> www, whichever the visitor landed on.
      const alt = u.hostname.startsWith("www.")
        ? u.hostname.slice(4)
        : `www.${u.hostname}`;
      out.add(`${u.protocol}//${alt}${u.port ? `:${u.port}` : ""}`);
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

const notFound = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const frameHost = adFrameHost();
  if (!frameHost) return notFound();
  if (requestHost(request) !== frameHost) return notFound();

  const { id } = await params;
  const variant = request.nextUrl.searchParams.get("s") === "m" ? "m" : "d";

  const ad = await prisma.ad
    .findUnique({
      where: { id },
      select: {
        type: true,
        status: true,
        networkId: true,
        htmlContent: true,
        mobileHtmlContent: true,
      },
      // The URL carries `v=<updatedAt>`, so an edit is a new URL.
      cacheStrategy: { ttl: 60, swr: 300 },
    })
    .catch(() => null);
  if (!ad || ad.type !== "HTML" || ad.status !== "ACTIVE") return notFound();

  const snippet =
    (variant === "m" ? ad.mobileHtmlContent : null) || ad.htmlContent || "";
  if (!snippet.trim()) return notFound();

  // script-src: the network's registry hosts plus whatever the snippet itself
  // names. Networks that rotate domains (and untagged HTML) get `https:` —
  // an allowlist they outgrow next week would just blank the slot.
  const def = getAdNetwork(ad.networkId);
  const hosts = new Set<string>();
  if (def && !def.dynamicDomains) {
    for (const d of def.domains) {
      hosts.add(`https://${d}`);
      const parts = d.split(".");
      if (parts.length >= 2) hosts.add(`https://*.${parts.slice(-2).join(".")}`);
    }
    for (const h of snippetHosts(snippet)) hosts.add(`https://${h}`);
  }
  const scriptSrc =
    def && !def.dynamicDomains ? [...hosts].join(" ") : "https:";

  const ancestors = appOrigins();
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob: ${scriptSrc}`,
    "style-src 'unsafe-inline' https:",
    "img-src https: data: blob:",
    "media-src https: data: blob:",
    "font-src https: data:",
    "connect-src https: wss:",
    "frame-src https: blob: data:",
    "child-src https: blob:",
    "worker-src blob:",
    "form-action https:",
    "base-uri 'self'",
    `frame-ancestors ${ancestors.length ? ancestors.join(" ") : "'none'"}`,
  ].join("; ");

  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><base target="_blank"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body>${snippet}${AD_FILL_PROBE}</body></html>`;

  return new NextResponse(doc, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      // Versioned URL (`v`) — short cache is enough and keeps a pulled ad from
      // lingering at the edge.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
