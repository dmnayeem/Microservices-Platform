import { NextResponse } from "next/server";
import { getSetting } from "@/lib/system-settings";
import { getNetworkGlobals, safeToken } from "@/lib/ad-network";
import { getNetworkSettings } from "@/lib/ad-networks/settings";
import { AD_NETWORKS, adsTxtLineFor } from "@/lib/ad-networks/registry";

/**
 * `/ads.txt` — the IAB authorised-sellers file.
 *
 * Programmatic demand (including AdSense/AdX) checks this file before bidding.
 * Without it, a large share of buyers simply refuse to buy the inventory, so the
 * space serves house ads at $0 instead of network ads at a real CPM. It is a
 * plain-text file at the domain root and nothing else — no auth, no HTML.
 *
 * Contents: the derived AdSense line, the lines of every enabled network in
 * /admin/ads/networks, and the owner's custom text (`ads.txt_content`). The
 * AdSense line is derived from the configured publisher id:
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

/**
 * Comparison key for de-duplication: ads.txt fields are comma-separated and
 * case-insensitive in the domain / relationship columns, and owners paste the
 * same line with different spacing. Comments and variables keep their text.
 */
function lineKey(line: string): string {
  const t = line.trim();
  if (!t || t.startsWith("#") || /^[a-z]+=/i.test(t)) return t;
  return t
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .join(",");
}

/**
 * The file is assembled from three sources, in this order, then de-duplicated:
 *
 *  1. The derived Google line, ALWAYS, whenever a publisher id is configured.
 *     It used to be emitted only when the custom box was empty — so the first
 *     time the owner pasted another network's line, the Google line silently
 *     vanished and AdSense demand dropped with it.
 *  2. One line per ENABLED registry network that has a publisher id and a
 *     template, plus any extra lines entered for that network.
 *  3. The owner's own custom text (`ads.txt_content`).
 */
export async function GET() {
  const [customRaw, { adsenseClient }, settings] = await Promise.all([
    getSetting<string>("ads.txt_content", ""),
    getNetworkGlobals(),
    getNetworkSettings().catch(() => null),
  ]);

  const lines: string[] = [];
  // "ca-pub-…" is the tag form; ads.txt wants the bare "pub-…" seller id.
  const pub = safeToken(adsenseClient).replace(/^ca-/, "");
  if (pub) lines.push(`google.com, ${pub}, DIRECT, ${GOOGLE_TAG_ID}`);

  if (settings) {
    for (const def of AD_NETWORKS) {
      const entry = settings.networks[def.id];
      if (!entry?.enabled) continue;
      const line = adsTxtLineFor(def, entry.publisherId);
      if (line) lines.push(line);
      for (const extra of entry.adsTxt.split(/\r?\n/)) {
        if (extra.trim()) lines.push(extra.trim());
      }
    }
  }

  for (const l of String(customRaw || "").split(/\r?\n/)) {
    if (l.trim()) lines.push(l.trim());
  }

  const seen = new Set<string>();
  const body = lines
    .filter((l) => {
      const k = lineKey(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join("\n");

  if (!body) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(`${body}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Short enough that a newly enabled network's line is live within
      // minutes — buyers that find no line for a seller refuse to bid.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
