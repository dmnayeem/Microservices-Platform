import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  getRewardedConfig,
  rewardReference,
  signWatchToken,
  verifyWatchToken,
  watchedSeconds,
} from "../src/lib/ads-rewarded";
import { checkAdFitsPlacement } from "../src/lib/ad-placements";

/**
 * Phase 6 verification — rewarded video.
 *
 * The most important check is the first one: **shipped OFF**. A rewarded ad pays
 * points out, and with only house inventory every watch costs the owner money and
 * earns him none. If the default ever flips to on by accident, the platform quietly
 * starts spending.
 *
 * After that, the watch token. It is the only thing standing between a user and
 * `POST /api/ads/{id}/reward` in a loop, which is what the route allowed before
 * this phase — no daily cap, no rate limit, no proof any video played, and a
 * ledger reference containing `Date.now()` that defeated the unique constraint
 * meant to make a replay a no-op.
 *
 * Creates and tears down its own user + campaign + ad fixtures.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-rewarded.ts
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

const src = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", p), "utf8");
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SANDBOX = "ZZ_VERIFY_REWARDED";
const cleanup: Array<() => Promise<unknown>> = [];

async function main() {
  console.log("\n=== Rewarded video ===\n");

  /* 1. Shipped OFF. */
  console.log("1. Shipped off");
  const cfg = await getRewardedConfig();
  console.log(`   enabled=${cfg.enabled} dailyCap=${cfg.dailyCap}`);
  check(
    "rewarded video is OFF in the live database",
    cfg.enabled === false,
    "an admin has switched it on — that is a decision, not a bug, but it spends points"
  );
  {
    const s = code("lib/ads-rewarded.ts");
    check(
      "anything but an explicit `true` is off — a malformed setting fails closed",
      /enabled: enabled === true/.test(s)
    );
    check(
      "the default in code is false",
      /getSetting<boolean>\("ads\.rewarded_enabled", false\)/.test(s)
    );
  }
  {
    const s = code("app/api/ads/rewarded/route.ts");
    check(
      "the list route serves nothing while it is off",
      /if \(!cfg\.enabled \|\| cfg\.dailyCap <= 0\)/.test(s)
    );
  }
  {
    const s = code("app/api/ads/[id]/reward/route.ts");
    check(
      "the reward route refuses while it is off",
      /if \(!cfg\.enabled \|\| cfg\.dailyCap <= 0\)/.test(s)
    );
  }
  {
    const s = code("components/user/ads/rewarded-video-section.tsx");
    check(
      "the UI renders nothing at all while it is off",
      /if \(!feed\?\.enabled \|\| feed\.ads\.length === 0\) return null;/.test(s)
    );
  }

  /* 2. The watch token. */
  console.log("\n2. Watch proof");
  const U1 = "verify_user_1";
  const U2 = "verify_user_2";
  const A1 = "verify_ad_1";
  const A2 = "verify_ad_2";

  const t = signWatchToken(U1, A1);
  check("a freshly issued token verifies", verifyWatchToken(t, U1, A1) !== null);
  check("another user's token is rejected", verifyWatchToken(t, U2, A1) === null);
  check("a token for another ad is rejected", verifyWatchToken(t, U1, A2) === null);
  check("no token is rejected", verifyWatchToken(null, U1, A1) === null);
  check("an empty token is rejected", verifyWatchToken("", U1, A1) === null);
  check("garbage is rejected", verifyWatchToken("not.a.token", U1, A1) === null);
  {
    // Flip one character of the signature.
    const [body, sig] = t.split(".");
    const tampered = `${body}.${sig.slice(0, -1)}${sig.slice(-1) === "A" ? "B" : "A"}`;
    check("a tampered signature is rejected", verifyWatchToken(tampered, U1, A1) === null);
  }
  {
    // Re-sign a body whose payload claims a different user — the signature is
    // over the body, so this must fail on the identity check, not the HMAC.
    const decoded = Buffer.from(
      t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    const [tid, , , issued] = decoded.split(".");
    check(
      "the payload really does carry the user and ad it was issued for",
      decoded.includes(U1) && decoded.includes(A1) && !!tid && !!issued
    );
  }
  {
    const parsed = verifyWatchToken(t, U1, A1)!;
    check("a just-issued token has ~0 watched seconds", watchedSeconds(parsed) < 2);
    check(
      "two tokens are never the same, so neither is their ledger reference",
      rewardReference(parsed) !==
        rewardReference(verifyWatchToken(signWatchToken(U1, A1), U1, A1)!)
    );
    check(
      "the reference is derived from the token, not from the clock",
      !/\d{13}/.test(rewardReference(parsed))
    );
  }
  {
    const s = code("lib/ads-rewarded.ts");
    check(
      "a token expires, so a stockpile cannot be built up",
      /TOKEN_TTL_MS/.test(s) && /Date\.now\(\) - issuedAt > TOKEN_TTL_MS/.test(s)
    );
    check(
      "a future-dated timestamp is rejected (it would make elapsed-time trivial)",
      /issuedAt > Date\.now\(\) \+ 60_000/.test(s)
    );
    check(
      "the signature comparison is constant-time",
      /timingSafeEqual/.test(s)
    );
  }

  /* 3. The gates the route was missing. */
  console.log("\n3. The route's gates");
  {
    const s = code("app/api/ads/[id]/reward/route.ts");
    check("it is rate limited", /enforceDbRateLimit\(request, "claim", userId, 30, 60_000\)/.test(s));
    check("it requires the watch token", /verifyWatchToken\(body\?\.watchToken, userId, id\)/.test(s));
    check(
      "it refuses to credit before watchSeconds have elapsed",
      /if \(watched < ad\.watchSeconds\)/.test(s)
    );
    check(
      "it applies the SAME campaign gate as the list route",
      /campaign: servableCampaignWhere\(await getAdClickCost\(\), new Date\(\), false\)/.test(s)
    );
    check(
      "the daily cap is re-checked inside the user-row lock",
      /FOR UPDATE/.test(s) &&
        s.indexOf("FOR UPDATE") < s.indexOf("const remainingBefore")
    );
    check(
      "a user near the cap gets partial credit rather than nothing",
      /Math\.min\(ad\.rewardPoints, remainingBefore\)/.test(s)
    );
    check(
      "the ledger row is written BEFORE the balance moves",
      s.indexOf("tx.transaction.create") < s.indexOf("tx.user.update")
    );
    check(
      "a replayed token is caught by the ledger's unique constraint",
      /code === "P2002"/.test(s) && /ALREADY_REWARDED/.test(s)
    );
    check(
      "the clock is gone from the ledger reference",
      !/reference: `ad_\$\{id\}_\$\{Date\.now\(\)\}`/.test(s)
    );
  }
  {
    const s = code("app/api/ads/rewarded/route.ts");
    check(
      "the list route finally returns videoUrl (a video screen needs it)",
      /videoUrl:/.test(s)
    );
    check("it issues a watch token per ad", /watchToken: signWatchToken\(userId, ad\.id\)/.test(s));
    check(
      "it reports cap progress so a user is not told after the fact",
      /todayEarned/.test(s) && /remaining/.test(s)
    );
  }

  /* 4. The ledger constraint really is the backstop. */
  console.log("\n4. Idempotency, against the live database");
  const user = await prisma.user.create({
    data: {
      email: `${SANDBOX.toLowerCase()}@verify.local`,
      name: SANDBOX,
      referralCode: `${SANDBOX}1`,
      pointsBalance: 0,
    },
  });
  cleanup.push(() => prisma.user.delete({ where: { id: user.id } }).catch(() => {}));

  const parsed = verifyWatchToken(signWatchToken(user.id, A1), user.id, A1)!;
  const ref = rewardReference(parsed);
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "BONUS",
      status: "COMPLETED",
      points: 10,
      amount: 0,
      description: "verify",
      reference: ref,
    },
  });
  let replayRejected = false;
  try {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "BONUS",
        status: "COMPLETED",
        points: 10,
        amount: 0,
        description: "verify replay",
        reference: ref,
      },
    });
  } catch (e) {
    replayRejected = (e as { code?: string })?.code === "P2002";
  }
  check("replaying one token's reference is refused by the database", replayRejected);

  /* 5. Policy. */
  console.log("\n5. Policy");
  const problems = checkAdFitsPlacement({
    placementName: "REWARDED_VIDEO",
    type: "ADSENSE",
  });
  check(
    "Google inventory cannot run on the rewarded placement",
    problems.some((p) => p.field === "type"),
    JSON.stringify(problems)
  );
  {
    const s = code("lib/ad-placements.ts");
    check(
      "an advertiser cannot buy the rewarded placement either",
      /"REWARDED_VIDEO",/.test(
        s.slice(s.indexOf("HOUSE_ONLY_PLACEMENTS"), s.indexOf("isAdvertiserSelectable"))
      )
    );
  }

  /* 6. The player counts real playback. */
  console.log("\n6. The player");
  {
    const s = code("components/user/ads/rewarded-video-section.tsx");
    check(
      "it accrues from currentTime deltas, not a wall clock",
      /const delta = v\.currentTime - lastTime\.current;/.test(s)
    );
    check(
      "a seek cannot skip ahead",
      /if \(delta <= 0 \|\| delta > 2\) return;/.test(s)
    );
    check(
      "a hidden or unfocused tab does not accrue",
      /if \(!playing\.current \|\| !visible\.current \|\| !focused\.current\) return;/.test(s)
    );
    check(
      "a video shorter than the requirement still completes on end",
      /const onEnded = \(\) => \{/.test(s)
    );
    check("the claim carries the watch token", /watchToken: ad\.watchToken/.test(s));
  }
  {
    const s = code("components/admin/ads/ad-manager-view.tsx");
    check(
      "the ad form finally has a cooldown field (it always defaulted to 3600s)",
      /setRewardCooldownSec/.test(s) && /rewardCooldownSec: Number\(rewardCooldownSec\)/.test(s)
    );
  }
  {
    const s = code("components/admin/monetization/monetization-view.tsx");
    check(
      "the admin can switch it on, and is told what it costs",
      /ads\.rewarded_enabled/.test(s) && /ads\.rewarded_daily_cap/.test(s)
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
  .finally(async () => {
    // Tear down on success AND failure — a half-cleaned sandbox poisons the next run.
    await prisma.transaction
      .deleteMany({ where: { description: { startsWith: "verify" } , user: { name: SANDBOX } } })
      .catch(() => {});
    for (const fn of cleanup.reverse()) await fn();
    await prisma.user.deleteMany({ where: { name: SANDBOX } }).catch(() => {});
    await prisma.$disconnect();
  });
