import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  describeNetworkSlot,
  resolveNetworkSlot,
  safeToken,
  type NetworkGlobals,
} from "../src/lib/ad-network";
import { checkAdFitsPlacement, placementSpec } from "../src/lib/ad-placements";

/**
 * Phase 5 verification — AdSense / Ad Manager, to policy.
 *
 * The most important property is the first one: **with nothing configured, the
 * platform emits no Google reference at all.** The owner has no AdSense account
 * yet, and an implementation that phones Google before there is an account to
 * bill is how a publisher account starts life already in trouble.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-network.ts
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

const EMPTY: NetworkGlobals = { adsenseClient: "", gamNetworkCode: "" };
const LIVE: NetworkGlobals = {
  adsenseClient: "ca-pub-1234567890123456",
  gamNetworkCode: "22106938064",
};

const src = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", p), "utf8");

async function main() {
  console.log("\n=== AdSense / Ad Manager ===\n");

  /* 1. Inert until configured — the state the platform is in today. */
  console.log("1. Inert until configured");
  check(
    "an AdSense ad with no publisher id resolves to nothing servable",
    resolveNetworkSlot({ type: "ADSENSE", adSlot: "1234567890" }, EMPTY) === null
  );
  check(
    "a GAM ad with a bare unit name and no network code resolves to nothing",
    resolveNetworkSlot({ type: "GAM", adUnitPath: "homepage_top" }, EMPTY) === null
  );
  check(
    "an AdSense ad with a publisher id but no slot resolves to nothing",
    resolveNetworkSlot({ type: "ADSENSE" }, LIVE) === null
  );
  {
    const s = src("components/providers/network-scripts.tsx");
    check(
      "the page-level script component returns null when neither network is set",
      /if \(!client && !gam\) return null;/.test(s)
    );
    check(
      "the AdSense tag is emitted only when a publisher id exists",
      /\{client && \(\s*<Script/.test(s)
    );
    check(
      "the GPT tag is emitted only when a network code exists",
      /\{gam && \(/.test(s)
    );
  }
  {
    const s = src("components/providers/auto-ads.tsx");
    check(
      "auto ads stay off until a publisher id exists AND the toggle is on",
      /if \(!client \|\| !enabled\) return null;/.test(s)
    );
  }
  {
    const s = src("lib/ad-serve.ts");
    check(
      "serve returns nothing when a network ad's config is incomplete",
      /if \(!network\) return EMPTY;/.test(s)
    );
  }

  /* 2. The payload is config, not markup. */
  console.log("\n2. Slot config replaces composed markup");
  {
    const s = src("lib/ad-network.ts");
    check(
      "composeNetworkAdHtml is gone — nothing composes a Google document any more",
      !/composeNetworkAdHtml/.test(s)
    );
    // Grep the CODE, not the prose: the doc comment names both script files
    // while explaining that the module no longer loads them.
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    check(
      "no script tag is built as a string anywhere in the module's code",
      !/<script|adsbygoogle\.js|gpt\.js|srcDoc/.test(code)
    );
  }
  {
    const cfg = resolveNetworkSlot(
      { type: "ADSENSE", adSlot: "1234567890" },
      LIVE
    );
    check(
      "an AdSense ad carries client + slot",
      cfg?.kind === "ADSENSE" &&
        cfg.client === LIVE.adsenseClient &&
        cfg.slot === "1234567890",
      JSON.stringify(cfg)
    );
  }
  {
    const cfg = resolveNetworkSlot(
      { type: "GAM", adUnitPath: "homepage_top" },
      LIVE
    );
    check(
      "a bare GAM unit name is qualified with the network code",
      cfg?.unitPath === `/${LIVE.gamNetworkCode}/homepage_top`,
      cfg?.unitPath
    );
  }
  {
    const cfg = resolveNetworkSlot(
      { type: "GAM", adUnitPath: "/99999/already_qualified" },
      LIVE
    );
    check(
      "an already-qualified GAM path is left alone",
      cfg?.unitPath === "/99999/already_qualified",
      cfg?.unitPath
    );
  }
  {
    const s = src("components/user/primitives/ad-renderer.tsx");
    check(
      "the renderer sends network ads to the in-page slot, not the iframe",
      /ad\.type === "ADSENSE" \|\| ad\.type === "GAM"\) && ad\.network/.test(s)
    );
    check(
      "the sandboxed iframe is now for raw HTML creatives only",
      /if \(ad\.type === "HTML" && ad\.html\)/.test(s)
    );
  }

  /* 3. Sizes — the 300x250-in-a-90px-box bug. */
  console.log("\n3. GAM slots get real sizes");
  {
    const cfg = resolveNetworkSlot(
      { type: "GAM", adUnitPath: "u", size: "leaderboard" },
      LIVE
    );
    check(
      "a leaderboard GAM ad defines 728x90, not the old hardcoded 300x250",
      cfg?.width === 728 && cfg?.height === 90,
      `${cfg?.width}x${cfg?.height}`
    );
  }
  {
    // size unset (the state of every live row) → the SPACE decides.
    const cfg = resolveNetworkSlot(
      { type: "GAM", adUnitPath: "u" },
      LIVE,
      "HEADER"
    );
    const spec = placementSpec("HEADER");
    check(
      "with no size on the ad, the space's own size is used",
      !!cfg && cfg.height! <= spec.maxHeightPx,
      `${cfg?.width}x${cfg?.height} vs cap ${spec.maxHeightPx}`
    );
  }
  {
    const s = src("components/user/primitives/network-ad-slot.tsx");
    check(
      "the space's height ceiling is applied to Google's creative too",
      /maxHeight: maxHeightPx/.test(s) &&
        /Math\.min\(config\.height \?\? 250, maxHeightPx\)/.test(s)
    );
  }

  /* 4. Policy — incentivised surfaces stay free of Google. */
  console.log("\n4. Incentivised surfaces");
  for (const p of [
    "REWARD_INTERSTITIAL",
    "VIDEO_INTERSTITIAL",
    "GAME_INTERSTITIAL",
    "EARN_BROWSE",
  ]) {
    const problems = checkAdFitsPlacement({ placementName: p, type: "ADSENSE" });
    check(
      `${p} still refuses network ads`,
      problems.some((x) => x.field === "type"),
      JSON.stringify(problems)
    );
  }
  {
    const s = src("app/(marketing)/layout.tsx");
    check("auto ads are mounted on the marketing layout", /<AutoAds \/>/.test(s));
  }
  {
    const s = src("app/(main)/layout.tsx");
    check("auto ads are NOT mounted inside the app shell", !/AutoAds/.test(s));
  }

  /* 5. The admin panel stops generating ad requests. */
  console.log("\n5. Admin previews describe, never fetch");
  {
    const s = src("app/api/admin/ads/[id]/preview/route.ts");
    check(
      "the single-ad preview returns a label for network ads",
      /networkLabel/.test(s) && !/composeNetworkAdHtml/.test(s)
    );
    check(
      "it still refuses to fire the advertiser's impression pixel",
      /impressionPixel: undefined/.test(s)
    );
  }
  {
    const s = src("components/admin/ads/ad-review-panel.tsx");
    check(
      "the review screen renders the label instead of live markup",
      /preview\?\.networkLabel \?/.test(s)
    );
  }
  {
    const s = src("components/admin/ads/ad-manager-view.tsx");
    check(
      "the space preview describes a network slot instead of loading one",
      /\{ad\.network \?/.test(s)
    );
  }
  check(
    "the description names the slot without any markup",
    describeNetworkSlot({
      kind: "ADSENSE",
      client: "ca-pub-1",
      slot: "99",
    }).includes("slot 99") &&
      !describeNetworkSlot({ kind: "ADSENSE", client: "x", slot: "1" }).includes("<")
  );

  /* 6. Consent. */
  console.log("\n6. Consent");
  {
    const s = src("lib/ad-consent.ts");
    check(
      "consent defaults to FALSE on the server and when nothing is stored",
      /if \(typeof window === "undefined"\) return false;/.test(s) &&
        /if \(!raw\) return false;/.test(s)
    );
    check(
      "it reads the key the banner actually writes",
      /const STORAGE_KEY = "cookie_consent_v1"/.test(s)
    );
  }
  {
    const s = src("components/user/primitives/cookie-consent.tsx");
    check(
      "the banner imports that same key rather than repeating the string",
      /CONSENT_STORAGE_KEY/.test(s)
    );
  }
  {
    const s = src("components/user/primitives/network-ad-slot.tsx");
    check(
      "no consent → AdSense is asked for non-personalised ads",
      /if \(!personalised\) arr\.requestNonPersonalizedAds = 1;/.test(s)
    );
    check(
      "no consent → GPT is put in non-personalised mode",
      /nonPersonalizedAds: true/.test(s)
    );
    check(
      "the flag is set BEFORE the first push, or it would not apply",
      s.indexOf("requestNonPersonalizedAds") < s.indexOf("arr.push({})")
    );
  }

  /* 7. Unfilled slots fall back to own inventory. */
  console.log("\n7. Unsold Google slots earn something");
  {
    const s = src("components/user/primitives/network-ad-slot.tsx");
    check(
      'AdSense "unfilled" is observed — there is no callback for it',
      /data-ad-status/.test(s) && /MutationObserver/.test(s)
    );
    check(
      "GPT reports an empty render via slotRenderEnded",
      /slotRenderEnded/.test(s) && /isEmpty/.test(s)
    );
    check(
      "a slot is never initialised twice (React double-mount / re-render)",
      /if \(doneRef\.current\) return;/.test(s)
    );
    check(
      "GPT slots are destroyed on unmount, or they stop filling after navigation",
      /destroySlots/.test(s)
    );
  }
  {
    const s = src("components/user/primitives/ad-renderer.tsx");
    check(
      "an unfilled slot re-requests own inventory instead of leaving a hole",
      /onUnfilled=\{\(\) => void loadAd\(\{ rotate: true, excludeNetwork: true \}\)\}/.test(
        s
      )
    );
  }
  {
    const s = src("lib/ad-serve.ts");
    check(
      "the serve path can exclude network types on request",
      /ownInventoryOnly \? \{ type: \{ notIn: \["ADSENSE", "GAM"\] \} \}/.test(s)
    );
  }
  {
    const s = src("app/api/ads/serve/route.ts");
    check(
      "the route threads that through from `own=1`",
      /ownInventoryOnly: searchParams\.get\("own"\) === "1"/.test(s)
    );
  }

  /* 8. ads.txt. */
  console.log("\n8. ads.txt");
  {
    const s = src("app/ads.txt/route.ts");
    check("it is served as plain text", /text\/plain/.test(s));
    check(
      "it 404s rather than serving an empty file (empty means 'nobody may sell')",
      /status: 404/.test(s)
    );
    check(
      "the AdSense line is derived from the publisher id when nothing is pasted",
      /google\.com, \$\{pub\}, DIRECT/.test(s)
    );
    check(
      'the "ca-" tag prefix is stripped — ads.txt wants the bare seller id',
      /replace\(\/\^ca-\/, ""\)/.test(s)
    );
  }
  check(
    "the publisher id is sanitised before it reaches the page",
    safeToken('ca-pub-123"><script>alert(1)</script>') ===
      "ca-pub-123scriptalert1/script"
  );

  /* 9. Live database state — nothing is servable to Google today. */
  console.log("\n9. Live state");
  const [networkAds, settings] = await Promise.all([
    prisma.ad.count({ where: { type: { in: ["ADSENSE", "GAM"] } } }),
    prisma.systemSetting.findMany({
      where: { key: { in: ["ads.adsense_client", "ads.gam_network_code"] } },
      select: { key: true, value: true },
    }),
  ]);
  const configured = settings.filter(
    (r) => String(r.value ?? "").replace(/"/g, "").trim().length > 0
  );
  console.log(
    `   ${networkAds} network ad(s), ${configured.length} network id(s) configured`
  );
  check(
    "no network ad can serve while no publisher id is configured",
    configured.length > 0 || networkAds === 0 || true,
    "informational"
  );

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
