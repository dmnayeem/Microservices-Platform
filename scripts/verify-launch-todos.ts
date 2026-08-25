import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  ANCHOR_DENY_PREFIXES,
  INCENTIVISED_PREFIXES,
  anchorAllowedOnPath,
  isIncentivisedPath,
} from "../src/lib/ad-placements";

/**
 * The four launch TODOs — the half of each that lives in code.
 *
 * The load-bearing check here is the FIRST one: every prefix in
 * `INCENTIVISED_PREFIXES` must resolve to a route that actually exists. A page
 * rename would otherwise silently drop that page out of the protected set, and
 * nothing would look wrong until Google's ads appeared on a screen that pays
 * users to be there — which is an account ban, not a bug report.
 *
 * The same reasoning drives the firewall-doc check. Two rules in
 * `docs/RATE-LIMITING.md` pointed at routes deleted long ago, and a firewall
 * rule matching a dead path is worse than no rule: it reads as coverage.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-launch-todos.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
/** Source with comments stripped, so a rule can't be "satisfied" by prose. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Does a user-facing route directory exist for this path prefix? */
function routeExists(prefix: string): boolean {
  const seg = prefix.replace(/^\//, "");
  const candidates = [
    path.join(root, "src", "app", "(main)", seg),
    path.join(root, "src", "app", seg),
  ];
  return candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isDirectory());
}

async function main() {
  console.log("\n=== Launch TODOs ===\n");

  /* ───────────────────── 1. Incentivised routes ── */
  console.log("1. The paid-surface list is real and complete");
  {
    const missing = INCENTIVISED_PREFIXES.filter((p) => !routeExists(p));
    check(
      `all ${INCENTIVISED_PREFIXES.length} incentivised prefixes resolve to a real route`,
      missing.length === 0,
      missing.join(", ")
    );

    check(
      "an exact path matches",
      isIncentivisedPath("/tasks") && isIncentivisedPath("/watch-ads")
    );
    check(
      "a nested path matches",
      isIncentivisedPath("/tasks/abc123") &&
        isIncentivisedPath("/video-tasks/9/proof")
    );
    // The bug a naive `startsWith` would introduce.
    check(
      "a lookalike path does NOT match",
      !isIncentivisedPath("/tasksomething") &&
        !isIncentivisedPath("/taskslist") &&
        !isIncentivisedPath("/earnings")
    );
    check(
      "ordinary pages do not match",
      !isIncentivisedPath("/dashboard") &&
        !isIncentivisedPath("/social") &&
        !isIncentivisedPath("/wallet") &&
        !isIncentivisedPath("/marketplace")
    );
    check(
      "the anchor bar is denied everywhere the paid list covers",
      ANCHOR_DENY_PREFIXES.every((p) => !anchorAllowedOnPath(p)) &&
        anchorAllowedOnPath("/dashboard")
    );
    // It used to be its own narrower array; deriving it is what stops the drift.
    check(
      "ANCHOR_DENY_PREFIXES is derived from the paid list, not a second copy",
      ANCHOR_DENY_PREFIXES.length === INCENTIVISED_PREFIXES.length
    );
    check(
      "the historic /watch-ads case is still covered",
      isIncentivisedPath("/watch-ads")
    );
  }

  /* ───────────────────── 2. Script suppression ── */
  console.log("\n2. Google's scripts cannot reach a paid page");
  {
    const tags = code("src/components/providers/network-script-tags.tsx");
    const parent = code("src/components/providers/network-scripts.tsx");

    check(
      "the gate returns null on an incentivised path",
      /isIncentivisedPath\(pathname\)\)\s*return null/.test(tags)
    );
    // The x-pathname header is NOT usable here — NextAuth discards the
    // pass-through response `authorized` builds, so it arrives empty. Measured.
    // `usePathname` resolves during SSR too, so the tag is absent from the
    // server-rendered HTML as well, which is what Google's reviewer fetches.
    check(
      "the path comes from usePathname, not the undelivered header",
      /usePathname\(\)/.test(tags) && !/x-pathname/.test(tags)
    );
    check(
      "the gate runs before any script tag is emitted",
      tags.indexOf("isIncentivisedPath(pathname)") <
        tags.indexOf("pagead2.googlesyndication.com")
    );
    check(
      "every Google script sits behind the gate",
      ["pagead2.googlesyndication.com", "fundingchoicesmessages.google.com", "securepubads.g.doubleclick.net"].every(
        (host) => tags.includes(host) && !parent.includes(host)
      )
    );
    check(
      "nothing is emitted at all without a publisher id",
      /if \(!client && !gam\) return null/.test(parent)
    );
    check(
      "NetworkScripts is still mounted in the root layout",
      /<NetworkScripts \/>/.test(read("src/app/layout.tsx"))
    );
    check(
      "the module the gate imports is client-safe",
      /must stay client-safe/.test(read("src/lib/ad-placements.ts"))
    );
  }

  /* ───────────────────── 3. Consent ── */
  console.log("\n3. One consent surface, not two");
  {
    const layout = code("src/app/layout.tsx");
    check(
      "the cookie banner stands down when Google's CMP is on",
      /<CookieConsent enabled=\{ui\.cookiesPopup && !googleCmp\} \/>/.test(layout)
    );
    check(
      "the CMP setting is read server-side in the layout",
      /getSetting<boolean>\("ads\.google_cmp_enabled", false\)/.test(layout)
    );
    check(
      "the CMP script is still gated on the same setting",
      /ads\.google_cmp_enabled/.test(
        code("src/components/providers/network-scripts.tsx")
      )
    );
    // Non-EEA traffic still relies on the stored preference.
    check(
      "the stored consent preference is still what ad slots read",
      /CONSENT_STORAGE_KEY/.test(
        code("src/components/user/primitives/cookie-consent.tsx")
      ) && fs.existsSync(path.join(root, "src/lib/ad-consent.ts"))
    );
  }

  /* ───────────────────── 4. Invoice details ── */
  console.log("\n4. Invoice details reach the PDF");
  {
    const form = code("src/components/admin/monetization/monetization-view.tsx");
    const KEYS = [
      "billing.seller_name",
      "billing.seller_address",
      "billing.seller_email",
      "billing.seller_phone",
      "billing.tax_pct",
      "billing.tax_label",
      "billing.tax_id",
    ];
    for (const k of KEYS) {
      check(`the Monetization form saves ${k}`, form.includes(`"${k}"`));
    }
    const lib = code("src/lib/invoices.ts");
    check(
      "getSellerConfig / getTaxConfig read the same keys",
      KEYS.every((k) => lib.includes(`"${k}"`))
    );

    const pdf = code("src/lib/invoice-pdf.ts");
    // He has no BIN yet, so the empty case has to print nothing at all rather
    // than a bare label.
    check(
      "a blank tax id prints no label",
      /if \(inv\.seller\.taxId\) \{/.test(pdf)
    );
    // Bangladesh issues a BIN, not a VAT number — printing "Tax ID" over a BIN
    // is wrong on a document an auditor reads.
    check(
      "the tax label is the configured one, not hardcoded",
      /\$\{taxIdLabel\}: \$\{inv\.seller\.taxId\}/.test(pdf) &&
        !/`Tax ID: \$\{/.test(pdf)
    );
    check(
      "it falls back to 'Tax ID' when no label is set",
      /taxIdLabel = safe\(inv\.taxLabel \|\| ""\)\.trim\(\) \|\| "Tax ID"/.test(pdf)
    );
    check(
      "the finance console warns while the details are blank",
      /billingIncomplete/.test(code("src/app/admin/finance/page.tsx"))
    );

    // What is actually set right now — reported, not asserted: these are the
    // owner's to fill in, and the console already warns about them.
    const rows = await prisma.systemSetting.findMany({
      where: { key: { startsWith: "billing." } },
      select: { key: true },
    });
    console.log(
      `       (live: ${rows.length}/7 billing keys set${
        rows.length === 0 ? " — invoices will carry a blank header" : ""
      })`
    );
  }

  /* ───────────────────── 5. Firewall ── */
  console.log("\n5. The firewall rules point at routes that exist");
  {
    const doc = read("docs/RATE-LIMITING.md");
    // Every /api/... path named anywhere in the doc.
    const paths = [...new Set([...doc.matchAll(/`(\/api\/[a-z0-9/[\]._-]*)`/gi)].map((m) => m[1]))];
    check("the doc names some API paths", paths.length > 0);

    const dead = paths.filter((p) => {
      const seg = p.replace(/^\/api\/?/, "").replace(/\/$/, "");
      if (!seg) return false; // bare /api/ is the catch-all, not a route
      return !fs.existsSync(path.join(root, "src", "app", "api", seg));
    });
    check(
      "every path named in RATE-LIMITING.md exists under src/app/api",
      dead.length === 0,
      dead.join(", ")
    );

    // The two that were dead, named explicitly so a revert is caught.
    check(
      "the removed dead rules have not come back",
      !/\/api\/spaces\/panel/.test(doc) &&
        !/\/api\/withdrawal-ticker\/stream/.test(doc)
    );
    check(
      "the media proxy is now covered",
      /`\/api\/media`/.test(doc)
    );
    check(
      "there is genuinely no SSE endpoint left to rate limit",
      !fs
        .readdirSync(path.join(root, "src/app/api"), { recursive: true })
        .some(
          (f) =>
            String(f).endsWith("route.ts") &&
            read(path.join("src/app/api", String(f))).includes("text/event-stream")
        )
    );

    const sh = read("scripts/apply-firewall.sh");
    check(
      "the apply script exists and covers all six rules",
      (sh.match(/^add_rule /gm) ?? []).length === 6
    );
    check(
      "the catch-all is applied first, so it is the one that lands on Hobby",
      sh.indexOf("Catch-all API writes") < sh.indexOf("Auth brute force")
    );
    check(
      "a plan refusal is reported, not treated as a crash",
      /limit\|plan\|upgrade\|maximum\|exceed/.test(sh)
    );
    check(
      "it is re-runnable without duplicating rules",
      /already present/.test(sh)
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
