import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { slugifyUsername } from "../src/lib/username";

/**
 * One-shot repair for accounts created before Google sign-in went through the
 * shared `provisionUser` path.
 *
 * What was broken and why:
 *  - Google accounts were created straight in the NextAuth `jwt` callback, so
 *    they never reached `verifyEmail()` — which is where the welcome bonus is
 *    awarded. **No Google user has ever received it.**
 *  - `User.status` defaults to PENDING_VERIFICATION and only `verifyEmail()`
 *    sets ACTIVE, so Google accounts sat there forever — invisible to every
 *    `status: "ACTIVE"` filter (audience targeting, broadcast notifications,
 *    search, mention autocomplete, social earnings).
 *  - No username → no `/u/<handle>` page, unmentionable, unsearchable.
 *  - No package → shows as "no plan" in admin (harmless at runtime, since
 *    `getEffectivePackage` falls back).
 *
 * Old referral attribution can NOT be recovered: the code that would have
 * written `referredById` never existed, so the data was never captured.
 *
 * Usage:
 *   npx tsx scripts/backfill-auth-parity.ts            # dry run, prints a plan
 *   npx tsx scripts/backfill-auth-parity.ts --apply    # structural repairs only
 *   npx tsx scripts/backfill-auth-parity.ts --apply --with-bonus  # + welcome bonus
 *
 * Idempotent: every phase is a no-op on a second run.
 */

const APPLY = process.argv.includes("--apply");
/**
 * The welcome bonus moves real balances, and it turned out to affect EVERY
 * account (36), not just the Google ones — no `welcome_` transaction has ever
 * existed, because seeded and admin-created users never pass through
 * `verifyEmail()` either. So it needs its own explicit opt-in rather than
 * riding along with the structural repairs.
 */
const WITH_BONUS = process.argv.includes("--with-bonus");

// Deliberately NOT `../src/lib/prisma`: that prefers DIRECT_DATABASE_URL outside
// production, and a direct postgres:// isn't reachable from a dev machine.
const db = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

/**
 * NOTE: `generateUniqueUsername` and the welcome-bonus credit are re-implemented
 * here rather than imported from `src/lib/auth/services.ts`. That module pulls
 * in `@/lib/ledger`, which starts with `import "server-only"` — a module that
 * only resolves inside the Next bundler, so importing it under tsx throws
 * MODULE_NOT_FOUND. The duplication is deliberate and one-shot.
 */
async function uniqueUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed) || "user";
  const candidates = new Set<string>();
  if (base.length >= 3) candidates.add(base);
  while (candidates.size < 12) {
    candidates.add(
      (base + Math.floor(100 + Math.random() * 900000)).slice(0, 30)
    );
  }
  const list = [...candidates];
  const taken = await db.user.findMany({
    where: { username: { in: list, mode: "insensitive" } },
    select: { username: true },
  });
  const takenLc = new Set(taken.map((t) => (t.username ?? "").toLowerCase()));
  const free = list.find((c) => c.length >= 3 && !takenLc.has(c.toLowerCase()));
  return (
    free ?? (base.slice(0, 20) + Date.now().toString().slice(-9)).slice(0, 30)
  );
}

const log = (phase: string, msg: string) => console.log(`[${phase}] ${msg}`);

async function main() {
  console.log(
    APPLY ? "APPLYING changes\n" : "DRY RUN — pass --apply to write\n"
  );

  // ── 1. onboardedAt ────────────────────────────────────────────────────────
  // Everyone who existed before the /welcome screen must count as onboarded, or
  // the middleware redirects the entire userbase into it.
  const unstamped = await db.user.count({ where: { onboardedAt: null } });
  log("onboarded", `${unstamped} user(s) missing onboardedAt`);
  if (APPLY && unstamped > 0) {
    const r = await db.user.updateMany({
      where: { onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    log("onboarded", `stamped ${r.count}`);
  }

  // ── 2. Stuck PENDING_VERIFICATION ────────────────────────────────────────
  // A verified email address with a PENDING status is the Google signature.
  const stuck = await db.user.findMany({
    where: {
      status: "PENDING_VERIFICATION",
      emailVerified: { not: null },
    },
    select: { id: true, email: true },
  });
  log("status", `${stuck.length} verified account(s) stuck on PENDING`);
  for (const u of stuck) {
    log("status", `  ${u.email}`);
    if (APPLY) {
      await db.user.update({ where: { id: u.id }, data: { status: "ACTIVE" } });
    }
  }

  // ── 3. Missing usernames ─────────────────────────────────────────────────
  // Not only Google accounts — seeded/admin-created users lack them too.
  const noHandle = await db.user.findMany({
    where: { username: null, status: { not: "BANNED" } },
    select: { id: true, email: true, name: true },
  });
  log("username", `${noHandle.length} account(s) without a handle`);
  for (const u of noHandle) {
    const handle = await uniqueUsername(u.name || u.email.split("@")[0]);
    log("username", `  ${u.email} → @${handle}`);
    if (APPLY) {
      try {
        await db.user.update({
          where: { id: u.id },
          data: { username: handle },
        });
      } catch (err) {
        if ((err as { code?: string })?.code === "P2002") {
          const retry = await uniqueUsername(handle);
          await db.user.update({
            where: { id: u.id },
            data: { username: retry },
          });
          log("username", `    (collided, used @${retry})`);
        } else throw err;
      }
    }
  }

  // ── 4. Missing package ───────────────────────────────────────────────────
  // Same three-tier resolution as `defaultPackage()` in src/lib/packages.ts:
  // flagged default → lowest active free plan → lowest active plan.
  const pkg =
    (await db.package.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true, name: true },
    })) ??
    (await db.package.findFirst({
      where: { isActive: true, priceMonthly: 0 },
      orderBy: { accessLevel: "asc" },
      select: { id: true, name: true },
    })) ??
    (await db.package.findFirst({
      where: { isActive: true },
      orderBy: [{ accessLevel: "asc" }, { priceMonthly: "asc" }],
      select: { id: true, name: true },
    }));
  const noPkg = await db.user.count({
    where: { packageId: null, status: { not: "BANNED" } },
  });
  log("package", `${noPkg} account(s) with no plan; default = ${pkg?.name ?? "NONE FOUND"}`);
  if (APPLY && pkg && noPkg > 0) {
    const r = await db.user.updateMany({
      where: { packageId: null, status: { not: "BANNED" } },
      data: { packageId: pkg.id },
    });
    log("package", `assigned ${r.count}`);
  }

  // ── 5. Missing welcome bonus ─────────────────────────────────────────────
  // The money phase. `welcome_<userId>` is unique per user, so re-running this
  // can never pay twice — the insert simply fails and is skipped.
  const bonusPoints = parseInt(process.env.WELCOME_BONUS_POINTS || "0", 10);
  if (APPLY && !WITH_BONUS) {
    const n = await db.user.count({
      where: {
        status: { not: "BANNED" },
        email: { not: { startsWith: "deleted+" } },
        transactions: { none: { reference: { startsWith: "welcome_" } } },
      },
    });
    log(
      "bonus",
      `SKIPPED — ${n} account(s) would each be paid ${bonusPoints} pts. Re-run with --with-bonus to award.`
    );
  } else if (!Number.isFinite(bonusPoints) || bonusPoints <= 0) {
    log("bonus", "WELCOME_BONUS_POINTS is unset/zero — nothing to award");
  } else {
    const missing = await db.user.findMany({
      where: {
        status: { not: "BANNED" },
        email: { not: { startsWith: "deleted+" } },
        transactions: { none: { reference: { startsWith: "welcome_" } } },
      },
      select: { id: true, email: true },
    });
    log("bonus", `${missing.length} account(s) never got the ${bonusPoints}-point welcome bonus`);

    const setting = await db.systemSetting
      .findUnique({ where: { key: "points_per_usd" }, select: { value: true } })
      .catch(() => null);
    const pointsPerUsd = Number(setting?.value) > 0 ? Number(setting?.value) : 1000;
    const usd = bonusPoints / pointsPerUsd;

    for (const u of missing) {
      log("bonus", `  ${u.email}`);
      if (!APPLY || !WITH_BONUS) continue;
      try {
        await db.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              userId: u.id,
              type: "BONUS",
              status: "COMPLETED",
              points: bonusPoints,
              amount: usd,
              description: "Welcome bonus",
              reference: `welcome_${u.id}`,
            },
          });
          await tx.user.update({
            where: { id: u.id },
            data: {
              pointsBalance: { increment: bonusPoints },
              totalEarnings: { increment: usd },
            },
          });
        });
      } catch (err) {
        // P2002 = already awarded by a concurrent run. Anything else is real.
        if ((err as { code?: string })?.code !== "P2002") {
          console.error(`    FAILED for ${u.email}:`, err);
        } else {
          log("bonus", "    (already awarded, skipped)");
        }
      }
    }
  }

  // ── 6. Assert the invariants hold ────────────────────────────────────────
  if (APPLY) {
    const [a, b, c] = await Promise.all([
      db.user.count({ where: { onboardedAt: null } }),
      db.user.count({
        where: { status: "PENDING_VERIFICATION", emailVerified: { not: null } },
      }),
      db.user.count({ where: { username: null, status: { not: "BANNED" } } }),
    ]);
    console.log(
      `\nVERIFY  onboardedAt-null=${a}  stuck-pending=${b}  no-username=${c}`
    );
    if (a || b || c) {
      console.error("Some rows were not repaired — investigate before shipping.");
      process.exit(1);
    }
    console.log("All invariants hold.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
