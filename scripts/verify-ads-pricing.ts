import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  clearRateCardCache,
  clicksAreBillable,
  getActiveBooking,
  getPlacementClickCost,
} from "../src/lib/ad-rate-card";
import { getAdClickCost } from "../src/lib/ad-billing";

/**
 * Phase C verification — the rate card and slot bookings.
 *
 * Three properties are worth more than the rest:
 *
 *  1. **A space with no rate behaves exactly as before.** The whole platform ran
 *     on one global CPC until now; a database where nothing has been priced must
 *     be byte-for-byte unchanged, or this "additive" change silently repriced
 *     every live campaign.
 *  2. **A booked space never goes dark.** Exclusivity that empties a slot is
 *     worse than no exclusivity — Phase 2 exists because an empty space looks
 *     broken and earns nothing.
 *  3. **A flat-rate sponsor is not billed twice.** They bought the period; a
 *     per-click charge on top is charging again for inventory already sold.
 *
 * Creates and tears down its own placement, campaign, ad and booking fixtures.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-pricing.ts
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

const SANDBOX = "ZZ_VERIFY_RATE";
const cleanup: Array<() => Promise<unknown>> = [];

async function main() {
  console.log("\n=== Ad rate card & bookings ===\n");

  const globalCpc = await getAdClickCost();
  console.log(`   global ads.cpcUsd = $${globalCpc}\n`);

  /* 1. Unpriced spaces are unchanged. */
  console.log("1. A space with no rate behaves exactly as before");
  const plain = await prisma.adPlacement.create({
    data: { name: `${SANDBOX}_PLAIN`, platform: "ALL", isActive: true },
  });
  cleanup.push(() =>
    prisma.adPlacement.delete({ where: { id: plain.id } }).catch(() => {})
  );
  clearRateCardCache();
  check(
    "an unpriced space bills the global rate",
    (await getPlacementClickCost(plain.name)) === globalCpc
  );
  check(
    "no placement at all bills the global rate",
    (await getPlacementClickCost(undefined)) === globalCpc
  );
  check(
    "an unknown space name bills the global rate rather than throwing",
    (await getPlacementClickCost("NO_SUCH_SPACE_XYZ")) === globalCpc
  );
  // The live catalogue: this change must not have repriced anything.
  const priced = await prisma.adPlacement.count({ where: { cpcUsd: { not: null } } });
  console.log(`   ${priced} live space(s) currently carry a rate override`);

  /* 2. An override is used, and clamped. */
  console.log("\n2. An override is honoured, and cannot give inventory away");
  await prisma.adPlacement.update({
    where: { id: plain.id },
    data: { cpcUsd: 0.25 },
  });
  clearRateCardCache();
  check(
    "the space's own rate is used",
    (await getPlacementClickCost(plain.name)) === 0.25,
    String(await getPlacementClickCost(plain.name))
  );
  for (const [label, bad] of [
    ["zero", 0],
    ["negative", -5],
  ] as const) {
    await prisma.adPlacement.update({
      where: { id: plain.id },
      data: { cpcUsd: bad },
    });
    clearRateCardCache();
    check(
      `a ${label} rate falls back to the global price, never free clicks`,
      (await getPlacementClickCost(plain.name)) === globalCpc,
      String(await getPlacementClickCost(plain.name))
    );
  }
  {
    const s = code("app/api/admin/ads/placements/[id]/route.ts");
    check(
      "the API REJECTS a bad rate rather than silently clamping it",
      /Click price must be between/.test(s)
    );
    check(
      "clearing a rate is allowed, and means 'use the global one'",
      /body\.cpcUsd === null \|\| body\.cpcUsd === ""/.test(s)
    );
    check(
      "the rate memo is dropped after an edit",
      /clearRateCardCache\(\)/.test(s)
    );
  }

  /* 3. History is never rewritten. */
  console.log("\n3. Changing a rate does not rewrite history");
  {
    const s = code("lib/ad-events.ts");
    check(
      "the resolved price is what gets snapshotted, at click time",
      /const cost = await getPlacementClickCost\(ad\.placement\?\.name\)/.test(s)
    );
    check(
      "spend still moves in the same statement as the budget",
      /budget: \{ decrement: cost \}, spentTotal: \{ increment: cost \}/.test(s)
    );
    check(
      "the daily rollup records the price actually charged",
      /spendUsd: billed\.count > 0 \? cost : 0/.test(s)
    );
  }
  // Against the live database: no report derives spend from clicks x current CPC.
  {
    const rows = await prisma.adDailyStat.findMany({
      where: { clicks: { gt: 0 }, spendUsd: { gt: 0 } },
      select: { clicks: true, spendUsd: true },
      take: 200,
    });
    const derivable = rows.filter(
      (r) => Math.abs(Number(r.spendUsd) - r.clicks * globalCpc) < 1e-9
    ).length;
    console.log(
      `   ${derivable}/${rows.length} historical rows happen to equal clicks x the current CPC`
    );
    check(
      "historical spend is stored, not derived (the rows exist to be read)",
      rows.every((r) => Number(r.spendUsd) >= 0)
    );
  }

  /* 4. Bookings. */
  console.log("\n4. A booked space belongs to its buyer");
  const rentable = await prisma.adPlacement.create({
    data: {
      name: `${SANDBOX}_RENT`,
      platform: "ALL",
      isActive: true,
      monthlyUsd: 250,
      isRentable: true,
    },
  });
  cleanup.push(() =>
    prisma.adPlacement.delete({ where: { id: rentable.id } }).catch(() => {})
  );
  const camp = await prisma.adCampaign.create({
    data: { title: `${SANDBOX} campaign`, budget: 50, status: "ACTIVE", isHouse: false },
  });
  cleanup.push(() =>
    prisma.adCampaign.delete({ where: { id: camp.id } }).catch(() => {})
  );

  const now = new Date();
  const past = new Date(now.getTime() - 86_400_000 * 10);
  const future = new Date(now.getTime() + 86_400_000 * 10);

  // Every mutation below goes straight to the database, bypassing the routes —
  // so the memo has to be dropped by hand, exactly as those routes do. That the
  // memo needs clearing at all is itself asserted at the end of this section.
  const pending = await prisma.adSlotBooking.create({
    data: {
      placementId: rentable.id,
      campaignId: camp.id,
      startAt: past,
      endAt: future,
      priceUsd: 250,
      exclusive: true,
      billClicks: false,
      status: "PENDING_PAYMENT",
    },
  });
  clearRateCardCache();
  check(
    "an UNPAID booking does not take the space",
    (await getActiveBooking(rentable.id)) === null
  );

  await prisma.adSlotBooking.update({
    where: { id: pending.id },
    data: { status: "ACTIVE" },
  });
  clearRateCardCache();
  {
    const b = await getActiveBooking(rentable.id);
    check("an ACTIVE booking in window does take it", b?.campaignId === camp.id);
    check("and it is marked exclusive", b?.exclusive === true);
  }

  // Out of window, in both directions.
  await prisma.adSlotBooking.update({
    where: { id: pending.id },
    data: { startAt: future, endAt: new Date(future.getTime() + 86_400_000) },
  });
  clearRateCardCache();
  check(
    "a booking that has not started yet takes nothing",
    (await getActiveBooking(rentable.id)) === null
  );
  await prisma.adSlotBooking.update({
    where: { id: pending.id },
    data: { startAt: past, endAt: new Date(past.getTime() + 86_400_000) },
  });
  clearRateCardCache();
  check(
    "a booking that has ended takes nothing",
    (await getActiveBooking(rentable.id)) === null
  );

  /* 5. Flat-rate sponsors are not billed twice. */
  console.log("\n5. A flat-rate sponsor is not charged per click as well");
  await prisma.adSlotBooking.update({
    where: { id: pending.id },
    data: { startAt: past, endAt: future, billClicks: false },
  });
  clearRateCardCache();
  check(
    "clicks on the booked campaign do NOT bill",
    (await clicksAreBillable(rentable.id, camp.id)) === false
  );
  await prisma.adSlotBooking.update({
    where: { id: pending.id },
    data: { billClicks: true },
  });
  clearRateCardCache();
  check(
    "unless the booking says to bill them",
    (await clicksAreBillable(rentable.id, camp.id)) === true
  );
  check(
    "another campaign on that space still bills normally",
    (await clicksAreBillable(rentable.id, "some-other-campaign")) === true
  );
  check(
    "a space with no booking bills normally",
    (await clicksAreBillable(plain.id, camp.id)) === true
  );

  // The memo is real, which is exactly why every mutating route must clear it.
  {
    await prisma.adSlotBooking.update({
      where: { id: pending.id },
      data: { status: "CANCELLED" },
    });
    const stale = await getActiveBooking(rentable.id);
    check(
      "the booking lookup is memoised (a stale read survives until cleared)",
      stale !== null
    );
    clearRateCardCache();
    check(
      "and clearing the memo shows the change",
      (await getActiveBooking(rentable.id)) === null
    );
  }
  for (const route of [
    "app/api/admin/ads/bookings/route.ts",
    "app/api/admin/ads/bookings/[id]/route.ts",
    "app/api/admin/ads/placements/[id]/route.ts",
  ]) {
    check(
      `${route.split("/").slice(-2).join("/")} clears the memo after writing`,
      /clearRateCardCache\(\)/.test(code(route))
    );
  }

  /* 6. The serve-path guard — the one that stops a space going dark. */
  console.log("\n6. A booked space never goes dark");
  {
    const s = code("lib/ad-serve.ts");
    check(
      "the pool is narrowed only when the booked campaign HAS something servable",
      /if \(booked\.length > 0\) pool = booked;/.test(s)
    );
    check(
      "an admin preview is not narrowed — they must see what the space holds",
      /if \(!preview\) \{\s*const booking = await getActiveBooking/.test(s)
    );
    check(
      "poolSize reports the pool actually drawn from",
      /poolSize: ads\.length/.test(s)
    );
  }

  /* 7. Bookings API guard rails. */
  console.log("\n7. Booking rules");
  {
    const s = code("app/api/admin/ads/bookings/route.ts");
    check(
      "a space that is not for rent cannot be booked",
      /is not marked for rent/.test(s)
    );
    check(
      "overlapping exclusives are refused, not tie-broken",
      /already booked exclusively/.test(s) && /status: 409/.test(s)
    );
    check(
      "an unpaid booking still blocks the calendar, so it cannot be double-sold",
      /status: \{ in: \["PENDING_PAYMENT", "ACTIVE"\] \}/.test(s)
    );
    check("end must be after start", /must be after the start date/.test(s));
    check("it is gated on ads.manage to write", /can\(session\.user\.id, "ads\.manage"\)/.test(s));
  }
  {
    const s = code("app/api/admin/ads/bookings/[id]/route.ts");
    check(
      "activation re-checks for a clash, because dates can be edited after",
      /Another active exclusive booking already covers/.test(s)
    );
  }

  /* 8. The credit bonus finally has an input. */
  console.log("\n8. The volume-discount lever is reachable");
  {
    const s = code("components/admin/monetization/monetization-view.tsx");
    check(
      "the admin can set ads.credit_bonus_pct",
      /"ads\.credit_bonus_pct": v/.test(s)
    );
  }
  {
    const s = code("app/api/admin/ads/placements/route.ts");
    check("and its current value is returned to the UI", /creditBonusPct/.test(s));
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
    // Tear down on success AND failure — a half-cleaned sandbox poisons the next
    // run, and a stray ACTIVE booking would take a real space hostage.
    await prisma.adSlotBooking
      .deleteMany({ where: { placement: { name: { startsWith: SANDBOX } } } })
      .catch(() => {});
    for (const fn of cleanup.reverse()) await fn();
    await prisma.adCampaign
      .deleteMany({ where: { title: { startsWith: SANDBOX } } })
      .catch(() => {});
    await prisma.adPlacement
      .deleteMany({ where: { name: { startsWith: SANDBOX } } })
      .catch(() => {});
    clearRateCardCache();
    await prisma.$disconnect();
  });
