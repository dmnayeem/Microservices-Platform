import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  validateSettingValues,
  NUMERIC_SETTING_BOUNDS,
  POINTS_PER_USD_MIN,
  POINTS_PER_USD_MAX,
} from "../src/lib/setting-guards";
import { parseOfferwallConfig, MAX_REWARD_MULTIPLIER } from "../src/lib/offerwall";
import { lt, toNum } from "../src/lib/money";

/**
 * Phase 0 verification — the emergency money fixes.
 *
 * The headline bug: marketplace auction settlement and offer-accept both moved
 * real cash with NO balance check at all. A $0 account could win a $1,000,000
 * auction and the seller was credited withdrawable money out of nothing.
 *
 * The settlement CAS is exercised against the LIVE database with real rows in a
 * disposable sandbox, because that is the only way to prove a compare-and-set
 * actually holds under concurrency. Everything it creates is deleted at the end,
 * including on failure.
 *
 * Run:  npx tsx scripts/verify-phase0-money.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TAG = "phase0verify";

async function main() {
  console.log("\n=== Phase 0 — emergency money fixes ===\n");

  /* ── 1. Config clamps (pure, no DB) ──────────────────────────────────── */
  console.log("1. Config clamps");

  check(
    "points_per_usd = 1 is rejected (the 1000x treasury typo)",
    validateSettingValues({ points_per_usd: 1 }).length === 1
  );
  check(
    "points_per_usd = 1000 (the default) is accepted",
    validateSettingValues({ points_per_usd: 1000 }).length === 0
  );
  check(
    `points_per_usd = ${POINTS_PER_USD_MAX + 1} is rejected`,
    validateSettingValues({ points_per_usd: POINTS_PER_USD_MAX + 1 }).length === 1
  );
  check(
    `points_per_usd = ${POINTS_PER_USD_MIN} (the floor) is accepted`,
    validateSettingValues({ points_per_usd: POINTS_PER_USD_MIN }).length === 0
  );
  check(
    "a percentage above 100 is rejected",
    validateSettingValues({ withdrawal_fee_percent: 150 }).length === 1 &&
      validateSettingValues({ vat_pct: 101 }).length === 1
  );
  check(
    "max_users_per_ip = 0 is rejected (it would lock everyone out)",
    validateSettingValues({ "antifraud.max_users_per_ip": 0 }).length === 1
  );
  check(
    "an unbounded key still passes through (this is a guard, not a whitelist)",
    validateSettingValues({ some_new_admin_key: "anything" }).length === 0
  );
  check(
    "a numeric string is parsed, not waved through",
    validateSettingValues({ points_per_usd: "1" }).length === 1 &&
      validateSettingValues({ points_per_usd: "1000" }).length === 0
  );
  check(
    "every reported problem names its key",
    validateSettingValues({ points_per_usd: 1, vat_pct: 500 }).length === 2 &&
      validateSettingValues({ points_per_usd: 1, vat_pct: 500 }).every(
        (r) => r.key in NUMERIC_SETTING_BOUNDS && r.message.length > 0
      )
  );
  check(
    `offerwall rewardMultiplier is capped at ${MAX_REWARD_MULTIPLIER}x`,
    parseOfferwallConfig({ rewardMultiplier: 100 }).rewardMultiplier ===
      MAX_REWARD_MULTIPLIER
  );
  check(
    "offerwall rewardMultiplier still floors at 0 and defaults to 1",
    parseOfferwallConfig({ rewardMultiplier: -5 }).rewardMultiplier === 0 &&
      parseOfferwallConfig({}).rewardMultiplier === 1
  );

  /* ── 2. The Decimal comparison bug ───────────────────────────────────── */
  console.log("\n2. Decimal comparison (reserve price)");
  // The old close-auction route compared two Prisma.Decimal values with `<`,
  // which compares their STRING forms.
  check(
    "raw `<` on decimal strings really is broken (proving the bug was real)",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ("9" as any) < ("10" as any) === false && ("100" as any) < ("20" as any) === true
  );
  check(
    "lt() compares numerically: 9 < 10",
    lt(9, 10) === true && lt(10, 9) === false
  );
  check(
    "lt() accepts a $100 bid on a $20 reserve (raw `<` voided it)",
    lt(100, 20) === false
  );
  check(
    "lt() rejects a $9 bid on a $10 reserve (raw `<` sold below reserve)",
    lt(9, 10) === true
  );

  /* ── 3. The settlement CAS, against the live database ────────────────── */
  console.log("\n3. Settlement compare-and-set (live rows)");

  const stamp = Date.now();
  const buyer = await prisma.user.create({
    data: {
      email: `${TAG}-buyer-${stamp}@example.invalid`,
      name: `${TAG} buyer`,
      referralCode: `${TAG}b${stamp}`,
      cashBalance: 100,
    },
    select: { id: true },
  });
  cleanup.push(() => prisma.user.delete({ where: { id: buyer.id } }));

  const seller = await prisma.user.create({
    data: {
      email: `${TAG}-seller-${stamp}@example.invalid`,
      name: `${TAG} seller`,
      referralCode: `${TAG}s${stamp}`,
      cashBalance: 0,
    },
    select: { id: true },
  });
  cleanup.push(() => prisma.user.delete({ where: { id: seller.id } }));

  // The exact CAS the fixed settlement path uses.
  const debit = (userId: string, amount: number) =>
    prisma.user.updateMany({
      where: { id: userId, cashBalance: { gte: amount } },
      data: { cashBalance: { decrement: amount } },
    });

  const tooBig = await debit(buyer.id, 1_000_000);
  check(
    "a $1,000,000 settlement against a $100 balance moves nothing",
    tooBig.count === 0
  );

  const afterFail = await prisma.user.findUnique({
    where: { id: buyer.id },
    select: { cashBalance: true },
  });
  check(
    "the balance is untouched by the refused settlement",
    toNum(afterFail?.cashBalance ?? -1) === 100
  );

  // Twenty concurrent $100 settlements against a $100 balance.
  const races = await Promise.all(
    Array.from({ length: 20 }, () => debit(buyer.id, 100))
  );
  const won = races.filter((r) => r.count === 1).length;
  check(
    "20 concurrent $100 settlements on a $100 balance: exactly one succeeds",
    won === 1,
    `${won} succeeded`
  );

  const afterRace = await prisma.user.findUnique({
    where: { id: buyer.id },
    select: { cashBalance: true },
  });
  check(
    "the balance lands at exactly 0, never negative",
    toNum(afterRace?.cashBalance ?? -1) === 0,
    `balance = ${toNum(afterRace?.cashBalance ?? -1)}`
  );

  // The old code path, for contrast: an unguarded decrement.
  await prisma.user.update({
    where: { id: buyer.id },
    data: { cashBalance: { decrement: 500 } },
  });
  const negative = await prisma.user.findUnique({
    where: { id: buyer.id },
    select: { cashBalance: true },
  });
  check(
    "an unguarded decrement DOES go negative (proving the CAS is what saves it)",
    toNum(negative?.cashBalance ?? 0) === -500,
    `balance = ${toNum(negative?.cashBalance ?? 0)}`
  );

  /* ── 4. The live config is inside the new bounds ─────────────────────── */
  console.log("\n4. Live configuration");

  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.keys(NUMERIC_SETTING_BOUNDS) } },
    select: { key: true, value: true },
  });
  const live: Record<string, unknown> = {};
  for (const r of rows) live[r.key] = r.value;
  const liveProblems = validateSettingValues(live);
  check(
    `every bounded setting currently in the database is in range (${rows.length} found)`,
    liveProblems.length === 0,
    liveProblems.map((p) => `${p.key}: ${p.message}`).join(" | ")
  );

  const providers = await prisma.offerwallConfig.findMany({
    select: { provider: true, config: true },
  });
  // A provider whose stored multiplier is now clamped was paying above the cap.
  const overMultiplier = providers.filter((p) => {
    const stored = Number(
      (p.config as { rewardMultiplier?: unknown } | null)?.rewardMultiplier ?? 1
    );
    return (
      Number.isFinite(stored) &&
      stored > 0 &&
      parseOfferwallConfig(p.config).rewardMultiplier !== stored
    );
  });
  check(
    `every offerwall provider's multiplier is within the cap (${providers.length} found)`,
    overMultiplier.length === 0,
    overMultiplier.map((p) => p.provider).join(", ")
  );

  console.log(
    `\n=== ${passed} passed, ${failures.length} failed ===${
      failures.length ? `\n\n${failures.map((f) => ` - ${f}`).join("\n")}\n` : "\n"
    }`
  );
}

async function teardown() {
  for (const fn of cleanup.reverse()) {
    await fn().catch((e) => console.error("  cleanup failed:", e));
  }
}

main()
  .then(async () => {
    await teardown();
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await teardown();
    await prisma.$disconnect();
    process.exit(1);
  });
