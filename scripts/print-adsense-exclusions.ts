import { INCENTIVISED_PREFIXES } from "../src/lib/ad-placements";

/**
 * Print the URL patterns to exclude in the AdSense console.
 *
 * Generated rather than hand-kept. The site has twenty-one paid surfaces and the
 * list grows every time a task type is added; retyping it into a console field
 * is exactly where one gets missed, and the one that gets missed is the one that
 * costs the account.
 *
 * The code already refuses to load Google's script on these paths
 * (`src/components/providers/network-scripts.tsx`). This is the second lock, for
 * the case where Auto ads are enabled account-wide and a path is reached some
 * way the header check does not see.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/print-adsense-exclusions.ts
 */

const site = process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app";
const host = site.replace(/^https?:\/\//, "").replace(/\/$/, "");

console.log(`
AdSense → Ads → By site → ${host} → Edit → Excluded URLs
(Ad Manager: Inventory → Ad exclusions)

Paste these, one per line. The trailing ** is AdSense's wildcard, so nested
routes under each are covered too.
`);

for (const p of INCENTIVISED_PREFIXES) {
  console.log(`${host}${p}**`);
}

console.log(`
${INCENTIVISED_PREFIXES.length} patterns.

Why: users are PAID to be on these pages. AdSense and Ad Manager both prohibit
ads on incentivised placements, and Auto ads inject wherever they like — which
is what makes an account-level exclusion necessary on top of the code check.
`);
