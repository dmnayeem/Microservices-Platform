import { NextRequest, NextResponse } from "next/server";
import { countryOfIp } from "@/lib/geo";
import { clientIp } from "@/lib/rate-limit";
import { needsConsentBanner } from "@/lib/consent-region";

/**
 * GET — does this visitor need the cookie banner? Public (visitors have no
 * session), cheap, and per-visitor, so never cached by a CDN.
 *
 * Cloudflare's CF-IPCountry header first (the site sits behind Cloudflare),
 * then our own IP database. Unknown → `consent: true`: when we can't tell,
 * asking is the safe side.
 */
export function GET(req: NextRequest) {
  const fromEdge =
    req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || req.headers.get("x-geo-country");
  const edge = fromEdge && /^[A-Za-z]{2}$/.test(fromEdge) && fromEdge.toUpperCase() !== "XX" ? fromEdge.toUpperCase() : null;
  const country = edge ?? countryOfIp(clientIp(req));
  return NextResponse.json(
    { country: country ?? null, consent: country ? needsConsentBanner(country) : true },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
