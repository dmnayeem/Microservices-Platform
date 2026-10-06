import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveEventCountry } from "@/lib/ad-geo";
import { fallbackDestination, ingestAdEvent } from "@/lib/ad-measure";
import { parseSignalsParam } from "@/lib/ad-ivt";

/**
 * Ad click redirect: `/api/spaces/go?st=<serve token>&sg=<signals>&a=<adId>`.
 *
 * Every own / house ad links here instead of straight to its destination, so a
 * click is counted whatever way it happens — left click, middle click, "open
 * in new tab", keyboard — and is validated, IVT-judged and (when billable)
 * charged exactly once per delivery BEFORE the browser leaves.
 *
 * Open-redirect safe: the destination is always the ad's STORED url, looked up
 * by the id inside the signed token (or, when the token cannot be read, by
 * `a=`), never anything the query supplies. Navigation never depends on the
 * verdict — an invalid click still reaches the advertiser's page; it is just
 * not counted or billed.
 *
 * Public (auth/config.ts `publicApiPrefixes`): logged-out clicks are recorded
 * too (billing still requires a signed-in viewer — unchanged).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const adParam = (sp.get("a") ?? "").slice(0, 64) || null;

  const limited = enforceRateLimit(request, "ad-go", 60, 60_000);
  if (limited) {
    // Over the limit: still take the person where they were going.
    const dest = await fallbackDestination(adParam);
    return redirect(dest, request);
  }

  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;
  const country = await resolveEventCountry({ userId }).catch(() => null);

  const r = await ingestAdEvent({
    st: sp.get("st"),
    kind: "CLICK",
    signals: parseSignalsParam(sp.get("sg")),
    headers: request.headers,
    sessionUserId: userId,
    country,
  });
  return redirect(r.destination ?? (await fallbackDestination(adParam)), request);
}

function redirect(dest: string | null, request: NextRequest) {
  const target = new URL(dest ?? "/", request.nextUrl.origin);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
