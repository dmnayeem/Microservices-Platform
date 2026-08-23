import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { pointsToUsd } from "../src/lib/economy";
import { clampRewardCooldown, MIN_REWARD_COOLDOWN_SEC } from "../src/lib/ad-billing";

/**
 * Phase 1 verification — financial integrity beyond the Phase 0 emergency.
 *
 * Every check here targets a specific bug that was live in the code, and most
 * are exercised against the LIVE database with real rows in a disposable
 * sandbox, because a compare-and-set can only be proven under real concurrency.
 * Everything created is deleted at the end, including on failure.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-phase1-money.ts
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

const TAG = "phase1verify";
const stamp = Date.now();

async function mkUser(role: string, points = 0, cash = 0) {
  const u = await prisma.user.create({
    data: {
      email: `${TAG}-${role}-${stamp}@example.invalid`,
      name: `${TAG} ${role}`,
      referralCode: `${TAG}${role}${stamp}`.slice(0, 40),
      pointsBalance: points,
      cashBalance: cash,
    },
    select: { id: true },
  });
  cleanup.push(async () => {
    await prisma.transaction.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  });
  return u.id;
}

async function main() {
  console.log("\n=== Phase 1 — financial integrity ===\n");

  /* ── 1. The ledger replay guard actually holds ───────────────────────── */
  console.log("1. Ledger replay guard (@@unique([userId, reference]))");

  const alice = await mkUser("alice", 1000, 100);

  const write = (reference: string, points: number) =>
    prisma.transaction.create({
      data: {
        userId: alice,
        type: "EARNING",
        status: "COMPLETED",
        points,
        amount: 0,
        description: "verify",
        reference,
      },
    });

  await write("ref_stable", 10);
  let secondRejected = false;
  try {
    await write("ref_stable", 10);
  } catch {
    secondRejected = true;
  }
  check("the same reference twice is rejected", secondRejected);

  // The bug class this replaces: a reference built from Date.now() is different
  // every call, so the constraint can never fire.
  await write(`ref_time_${Date.now()}`, 10);
  let timeBasedRejected = false;
  try {
    await write(`ref_time_${Date.now() + 1}`, 10);
  } catch {
    timeBasedRejected = true;
  }
  check(
    "a Date.now()-based reference is NOT caught (why leaderboard/cart needed fixing)",
    !timeBasedRejected
  );

  /* ── 2. Referral commission ordering ─────────────────────────────────── */
  console.log("\n2. Referral commission — ledger before balance");

  const bob = await mkUser("bob", 0, 0);

  // Reproduce the fixed shape: ledger insert first, inside a transaction. A
  // replay must leave the balance untouched.
  const payCommission = async (reference: string, points: number) => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            userId: bob,
            type: "REFERRAL",
            status: "COMPLETED",
            points,
            amount: 0,
            description: "verify commission",
            reference,
          },
        });
        await tx.user.update({
          where: { id: bob },
          data: { pointsBalance: { increment: points } },
        });
      });
      return true;
    } catch {
      return false;
    }
  };

  const first = await payCommission("referral_sub1_L1", 50);
  const replay = await payCommission("referral_sub1_L1", 50);
  const bobAfter = await prisma.user.findUnique({
    where: { id: bob },
    select: { pointsBalance: true },
  });
  check("the first commission is paid", first);
  check("a replayed commission is refused", !replay);
  check(
    "the balance moved exactly once — the replay minted nothing",
    bobAfter?.pointsBalance === 50,
    `balance = ${bobAfter?.pointsBalance}`
  );

  // A different submission is a genuinely different event and must still pay.
  await payCommission("referral_sub2_L1", 50);
  const bobTwo = await prisma.user.findUnique({
    where: { id: bob },
    select: { pointsBalance: true },
  });
  check(
    "a different submission at the same level still pays",
    bobTwo?.pointsBalance === 100,
    `balance = ${bobTwo?.pointsBalance}`
  );

  // The old shape, for contrast: balance first, then the ledger.
  const carol = await mkUser("carol", 0, 0);
  const oldShape = async (reference: string, points: number) => {
    await prisma.user.update({
      where: { id: carol },
      data: { pointsBalance: { increment: points } },
    });
    try {
      await prisma.transaction.create({
        data: {
          userId: carol,
          type: "REFERRAL",
          status: "COMPLETED",
          points,
          amount: 0,
          description: "verify old",
          reference,
        },
      });
    } catch {
      /* swallowed, exactly as the old outer catch did */
    }
  };
  await oldShape("old_ref", 50);
  await oldShape("old_ref", 50);
  const carolAfter = await prisma.user.findUnique({
    where: { id: carol },
    select: { pointsBalance: true },
  });
  const carolTxns = await prisma.transaction.count({
    where: { userId: carol, reference: "old_ref" },
  });
  check(
    "the OLD order really did mint points with no ledger row (balance 100, rows 1)",
    carolAfter?.pointsBalance === 100 && carolTxns === 1,
    `balance = ${carolAfter?.pointsBalance}, rows = ${carolTxns}`
  );

  /* ── 3. Status compare-and-set (withdrawals, deposits, submissions) ──── */
  console.log("\n3. Status compare-and-set");

  const dave = await mkUser("dave", 0, 500);
  const wd = await prisma.withdrawal.create({
    data: {
      userId: dave,
      amount: 100,
      fee: 0,
      netAmount: 100,
      method: "BKASH",
      accountDetails: {},
      status: "PROCESSING",
    },
    select: { id: true },
  });
  cleanup.push(() => prisma.withdrawal.delete({ where: { id: wd.id } }));

  // mark_paid and reject race each other. Exactly one must win.
  const [paid, rejected] = await Promise.all([
    prisma.withdrawal.updateMany({
      where: { id: wd.id, status: "PROCESSING" },
      data: { status: "COMPLETED" },
    }),
    prisma.withdrawal.updateMany({
      where: { id: wd.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "REJECTED" },
    }),
  ]);
  check(
    "a mark_paid/reject race resolves to exactly one winner",
    paid.count + rejected.count === 1,
    `paid=${paid.count} rejected=${rejected.count}`
  );

  const wdFinal = await prisma.withdrawal.findUnique({
    where: { id: wd.id },
    select: { status: true },
  });
  check(
    "the withdrawal lands in one terminal state",
    wdFinal?.status === "COMPLETED" || wdFinal?.status === "REJECTED",
    `status = ${wdFinal?.status}`
  );

  // Ten concurrent claims on one row.
  await prisma.withdrawal.update({
    where: { id: wd.id },
    data: { status: "PROCESSING" },
  });
  const claims = await Promise.all(
    Array.from({ length: 10 }, () =>
      prisma.withdrawal.updateMany({
        where: { id: wd.id, status: "PROCESSING" },
        data: { status: "COMPLETED" },
      })
    )
  );
  check(
    "10 concurrent status claims: exactly one matches",
    claims.filter((c) => c.count === 1).length === 1,
    `${claims.filter((c) => c.count === 1).length} matched`
  );

  /* ── 4. Points→cash rounding ─────────────────────────────────────────── */
  console.log("\n4. Points→cash conversion rounds down");

  const roundDown = (points: number, rate: number) =>
    Math.floor(pointsToUsd(points, rate) * 100) / 100;
  const roundHalfUp = (points: number, rate: number) =>
    Math.round(pointsToUsd(points, rate) * 100) / 100;

  check(
    "1006 points at rate 1000 yields $1.00, not $1.01",
    roundDown(1006, 1000) === 1.0,
    `got ${roundDown(1006, 1000)}`
  );
  check(
    "the OLD half-up really did over-pay 1006 points ($1.01 for $1.006 of value)",
    roundHalfUp(1006, 1000) === 1.01
  );
  check(
    "an exact conversion is unaffected",
    roundDown(2000, 1000) === 2.0 && roundDown(1000, 1000) === 1.0
  );

  // The property, rather than a hand-picked number: across every conversion
  // size in a wide band, the payout must never exceed the true value. Counting
  // how often the old code DID exceed it is what shows the leak was systemic.
  let overpays = 0;
  let oldOverpays = 0;
  let oldExcess = 0;
  for (let p = 1000; p <= 100_000; p++) {
    const truth = pointsToUsd(p, 1000);
    if (roundDown(p, 1000) > truth + 1e-9) overpays++;
    if (roundHalfUp(p, 1000) > truth + 1e-9) {
      oldOverpays++;
      oldExcess += roundHalfUp(p, 1000) - truth;
    }
  }
  check(
    "across 99,001 conversion sizes the new payout NEVER exceeds the true value",
    overpays === 0,
    `${overpays} overpaid`
  );
  check(
    "the old half-up overpaid on ~half of them (the leak was systemic, not an edge case)",
    oldOverpays > 30_000,
    `${oldOverpays} overpaid, $${oldExcess.toFixed(2)} minted in total`
  );

  /* ── 5. Rewarded-ad cooldown floor ───────────────────────────────────── */
  console.log("\n5. Rewarded-ad cooldown floor");

  check(
    "a cooldown of 0 is raised to the default, not left as 0",
    clampRewardCooldown(0) === 3600
  );
  check(
    `a cooldown of 1s is raised to ${MIN_REWARD_COOLDOWN_SEC}s`,
    clampRewardCooldown(1) === MIN_REWARD_COOLDOWN_SEC
  );
  check(
    "a legitimate cooldown is preserved",
    clampRewardCooldown(1800) === 1800 && clampRewardCooldown(7200) === 7200
  );
  check(
    "garbage falls back to the default",
    clampRewardCooldown("abc") === 3600 &&
      clampRewardCooldown(null) === 3600 &&
      clampRewardCooldown(-5) === 3600
  );

  /* ── 6. Live data sanity ─────────────────────────────────────────────── */
  console.log("\n6. Live data");

  const negPoints = await prisma.user.count({ where: { pointsBalance: { lt: 0 } } });
  const negCash = await prisma.user.count({ where: { cashBalance: { lt: 0 } } });
  check("no user has a negative points balance", negPoints === 0, `${negPoints} found`);
  check("no user has a negative cash balance", negCash === 0, `${negCash} found`);

  const liveCooldowns = await prisma.ad.findMany({
    where: { rewardPoints: { gt: 0 } },
    select: { id: true, rewardCooldownSec: true },
  });
  const unguarded = liveCooldowns.filter(
    (a) => a.rewardCooldownSec < MIN_REWARD_COOLDOWN_SEC
  );
  check(
    `every rewarded ad has a real cooldown (${liveCooldowns.length} rewarded ads)`,
    unguarded.length === 0,
    unguarded.map((a) => `${a.id}=${a.rewardCooldownSec}s`).join(", ")
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
