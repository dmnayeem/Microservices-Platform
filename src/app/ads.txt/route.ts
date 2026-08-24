import { NextResponse } from "next/server";
import { getSetting } from "@/lib/system-settings";
import { getNetworkGlobals, safeToken } from "@/lib/ad-network";

/**
 * `/ads.txt` — the IAB authorised-sellers file.
 *
 * Programmatic demand (including AdSense/AdX) checks this file before bidding.
 * Without it, a large share of buyers simply refuse to buy the inventory, so the
 * space serves house ads at $0 instead of network ads at a real CPM. It is a
 * plain-text file at the domain root and nothing else — no auth, no HTML.
 *
 * Contents come from a `SystemSetting` (`ads.txt_content`) so the owner can paste
 * the lines each network gives them. When that is empty the AdSense line is
 * derived from the configured publisher id, which is the only line most
 * publishers ever need:
 *
 *     google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
 *
 * When nothing at all is configured this returns **404**, not an empty 200.
 * An empty ads.txt is a positive declaration that *no one* may sell the
 * inventory — worse than having no file, which means "unrestricted". Crawlers
 * treat a 404 as absence, which is the correct state before an account exists.
 *
 * A route handler (rather than a file in `public/`) so it stays editable from
 * the admin panel without a redeploy. Follows the `robots.ts` precedent.
 */

/** Google's fixed certification-authority id for AdSense/AdX. */
const GOOGLE_TAG_ID = "f08c47fec0942fa0";

export async function GET() {
  const custom = String((await getSetting<string>("ads.txt_content", "")) || "").trim();

  let body = custom;
  if (!body) {
    const { adsenseClient } = await getNetworkGlobals();
    // "ca-pub-…" is the tag form; ads.txt wants the bare "pub-…" seller id.
    const pub = safeToken(adsenseClient).replace(/^ca-/, "");
    if (pub) body = `google.com, ${pub}, DIRECT, ${GOOGLE_TAG_ID}`;
  }

  if (!body) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(body.endsWith("\n") ? body : `${body}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Crawlers re-read this daily at most; a long cache costs nothing and the
      // file changes perhaps twice in a platform's life.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
