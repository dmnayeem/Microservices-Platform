import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  ACHIEVEMENT_TYPES,
  resolveAchievementType,
} from "../src/lib/achievements";

/**
 * The six defects, verified.
 *
 * Two of these were live money bugs, not tidiness:
 *
 *  - manual task approval wrote a DIFFERENT ledger reference than the auto path,
 *    so a submission that travelled both routes was paid twice; and the revision
 *    branch had no status guard, which is what let it travel both
 *  - course refund approval deleted the enrolment, whose CASCADE destroyed the
 *    refund request the same transaction then updated — P2025, full rollback,
 *    so no course refund had ever succeeded
 *
 * The negative assertions matter as much as the positive ones. Six other ledger
 * references use `Date.now()` **correctly** — converting points, buying ad
 * credit, donating, checking out a cart, funding a campaign, adjusting a balance
 * — because those actions are meant to repeat. This script asserts they were
 * left alone, so a later "cleanup" that makes them deterministic fails here
 * instead of silently blocking users' second transactions.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-six-fixes.ts
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
/** Source with comments stripped, so a rule can't be "satisfied" by prose. */
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const schema = () =>
  fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");

async function main() {
  console.log("\n=== Six fixes ===\n");

  /* ─────────────────────────── 1. Task approval double-pay ── */
  console.log("1. Task approval can no longer pay twice");
  {
    const admin = code("app/api/admin/submissions/[id]/route.ts");
    const auto = code("app/api/tasks/[id]/submit/route.ts");

    // The two paths must build the SAME reference. This is the whole fix:
    // different keys meant `@@unique([userId, reference])` never fired.
    const autoRef = /reference:\s*`task_\$\{task\.id\}_\$\{submission\.id\}`/.test(
      auto
    );
    check("the auto path still writes task_<taskId>_<submissionId>", autoRef);
    check(
      "the manual path now writes the same reference format",
      /ledgerReference\s*=\s*`task_\$\{existingSubmission\.taskId\}_\$\{existingSubmission\.id\}`/.test(
        admin
      )
    );
    check(
      "the manual path no longer writes a bare submission id",
      !/reference:\s*existingSubmission\.id\s*,/.test(admin)
    );

    // A pre-check, not a caught constraint error: in Postgres a violation aborts
    // the enclosing transaction, so catching it inside would roll back the status
    // claim and strand the submission PENDING.
    check(
      "it checks for an existing payment before crediting",
      /alreadyPaid\s*=\s*await\s+tx\.transaction\.findFirst/.test(admin) &&
        /reference:\s*ledgerReference/.test(admin)
    );
    check(
      "the budget draw is skipped when it was already paid",
      /let\s+credit\s*=\s*!alreadyPaid/.test(admin) &&
        /if\s*\(credit\s*&&\s*task\.fundedByUserId\)/.test(admin)
    );

    // The root cause: revision had no status guard, so a PAID submission could
    // be pushed back to PENDING and approved again.
    check(
      "requesting a revision is now a status CAS",
      /taskSubmission\.updateMany\(\{[\s\S]{0,200}status:\s*\{\s*in:\s*\["PENDING",\s*"REVISION_REQUESTED"\]/.test(
        admin
      )
    );
    check(
      "a settled submission cannot be sent back for revision (409)",
      /revised\.count === 0/.test(admin) && /status:\s*409/.test(admin)
    );
    check(
      "a genuine race reports a conflict rather than a 500",
      /isDuplicateLedgerError\(error\)/.test(admin) &&
        /already been paid/i.test(src("app/api/admin/submissions/[id]/route.ts"))
    );
    check(
      "the stale 'no unique backstop' comment is gone",
      !/no unique backstop on Transaction\.reference/.test(
        src("app/api/admin/submissions/[id]/route.ts")
      )
    );
    // The reopen path is the other half of the loop; it must still only reopen
    // rows the CAS above can produce.
    check(
      "the reopen path still only touches REVISION_REQUESTED rows",
      /status:\s*SubmissionStatus\.REVISION_REQUESTED/.test(
        code("app/api/tasks/[id]/start/route.ts")
      )
    );
  }

  /* ─────────────────────────── 2. Marketplace dispute refund ── */
  console.log("\n2. Dispute refunds move the right money");
  {
    const s = code("app/api/admin/disputes/[id]/route.ts");
    const checkout = code("app/api/marketplace/[id]/checkout/route.ts");

    // Buyers pay from cashBalance, so a refund in points was the wrong currency
    // at whatever rate happened to apply on the day of the dispute.
    check(
      "the buyer is refunded in cash",
      /id:\s*purchase\.buyerId\s*\}\s*,\s*data:\s*\{\s*cashBalance:\s*\{\s*increment:\s*refundAmount/.test(
        s
      )
    );
    check(
      "the buyer refund no longer credits points",
      !/pointsBalance:\s*\{\s*increment:\s*Math\.round\(refundAmount/.test(s)
    );
    check(
      "the refund cannot exceed what was paid",
      /refundAmount\s*>\s*paidAmount/.test(s)
    );
    check(
      "the seller is clawed back, clamped to their balance",
      /Math\.min\(toNum\(sellerRow\?\.cashBalance\),\s*sellerOwed\)/.test(s)
    );
    check(
      "an unrecoverable clawback is recorded rather than hidden",
      /shortfall:\s*money2\(sellerOwed\s*-\s*debit\)/.test(s)
    );
    // The affiliate's cut comes OUT of the seller's, so clawing back the full
    // sellerAmount would take money the seller never received.
    check(
      "the marketplace affiliate cut still comes out of the seller's share",
      /Affiliate payout \(from the seller's cut\)/.test(
        src("app/api/marketplace/[id]/checkout/route.ts")
      ) || /affiliateAmount/.test(checkout)
    );
    check(
      "the seller clawback excludes the affiliate's cut",
      /sellerBanked\s*=\s*Math\.max\(0,\s*toNum\(purchase\?\.sellerAmount\)\s*-\s*affiliateAmount\)/.test(
        s
      )
    );
    check(
      "the affiliate is only reversed on a FULL refund",
      /reverseAffiliateCommission\("MARKETPLACE",\s*purchase\.id\)/.test(s) &&
        /ratio\s*>=\s*1/.test(s)
    );
    check(
      "the platform's commission is reversed too",
      /TransactionType\.ADMIN_FEE/.test(s) &&
        /reference:\s*`dispute_fee_reversal_\$\{id\}`/.test(s)
    );
    check(
      "resolving is a status CAS so two admins cannot both pay",
      /marketplaceDispute\.updateMany/.test(s) &&
        /DISPUTE_ALREADY_RESOLVED/.test(s)
    );
    check(
      "the purchase is marked so it cannot be refunded again",
      /marketplacePurchase\.updateMany/.test(s) && /"REFUNDED"/.test(s)
    );
    check(
      "a refund does not inflate lifetime earnings",
      !/buyerId[\s\S]{0,120}totalEarnings/.test(s)
    );
  }

  /* ─────────────────────────── 3. Course refund ── */
  console.log("\n3. Course refunds can actually complete");
  {
    const sch = schema();
    const s = code("app/api/admin/courses/refunds/[id]/route.ts");

    // The crash. Cascade meant the delete destroyed the row the same transaction
    // then updated.
    check(
      "CourseRefundRequest.enrollmentId is nullable",
      /enrollmentId\s+String\?/.test(sch)
    );
    check(
      "its FK is SetNull, not Cascade",
      /enrollment\s+CourseEnrollment\?\s+@relation\([^)]*onDelete:\s*SetNull/.test(
        sch
      )
    );
    const live = await prisma.$queryRawUnsafe<
      Array<{ confdeltype: string }>
    >(
      `SELECT confdeltype::text FROM pg_constraint WHERE conname = 'CourseRefundRequest_enrollmentId_fkey'`
    ).catch(() => null);
    check(
      "the LIVE database agrees the FK is SET NULL",
      !!live && live[0]?.confdeltype === "n",
      live ? `confdeltype=${live[0]?.confdeltype}` : "query failed"
    );

    check(
      "the request is claimed BEFORE the enrolment is deleted",
      s.indexOf("courseRefundRequest.updateMany") <
        s.indexOf("courseEnrollment.delete")
    );
    check(
      "there is no longer an update after the delete to crash on",
      !/courseEnrollment\.delete[\s\S]*courseRefundRequest\.update\(/.test(s)
    );
    check(
      "approving twice is rejected by the status CAS",
      /REFUND_ALREADY_PROCESSED/.test(s) && /status:\s*409/.test(s)
    );

    // The tutor debit was unconditional, so a tutor who had withdrawn went
    // negative and every later credit silently paid the deficit off first.
    check(
      "the tutor clawback is clamped to their balance",
      /tutorClawback\s*=\s*Math\.min\(toNum\(tutorRow\?\.cashBalance\),\s*tutorOwed\)/.test(
        s
      )
    );
    check(
      "the shortfall is recorded",
      /shortfall:\s*money2\(tutorOwed\s*-\s*tutorClawback\)/.test(s)
    );
    check(
      "the ledger row records what was actually recovered",
      /amount:\s*-tutorClawback/.test(s) && !/amount:\s*-tutorAmount/.test(s)
    );
    check(
      "the tutor profile counter uses the clamped figure",
      /totalEarningsCents:\s*\{\s*decrement:\s*Math\.round\(tutorClawback\s*\*\s*100\)/.test(
        s
      )
    );

    // The affiliate's cut comes out of the TUTOR's share on courses too, so the
    // old code took it twice: once from the tutor, once from the affiliate.
    check(
      "the tutor clawback excludes the affiliate's cut",
      /tutorOwed\s*=\s*Math\.max\(0,\s*money2\(tutorAmount\s*-\s*affiliateAmount\)\)/.test(
        s
      )
    );
    check(
      "the affiliate is reversed exactly once, by the shared helper",
      (s.match(/await reverseAffiliateCommission\(/g) ?? []).length === 1
    );
    check(
      "the route does not debit the affiliate itself as well",
      !/affiliateUserId[\s\S]{0,200}cashBalance:\s*\{\s*decrement/.test(s)
    );

    check(
      "the platform fee comes from the enrolment, not a recomputed rate",
      /storedFee\s*=\s*request\.enrollment\?\.platformFeeUsd/.test(s) &&
        /platformFeeUsd:\s*true/.test(s)
    );
    check(
      "the fee reversal is written to the ledger",
      /reference:\s*`course_fee_reversal_\$\{c\.id\}_\$\{request\.id\}`/.test(s)
    );
    check(
      "recomputation survives only as the fallback for rows with no stored fee",
      /resolveCourseCommissionBps/.test(s) && /storedFee != null/.test(s)
    );
  }

  /* ─────────────────────────── 4. Achievements ── */
  console.log("\n4. Achievements unlock, and can be collected");
  {
    const lib = code("lib/achievements.ts");
    const api = code("app/api/achievements/route.ts");
    const claim = code("app/api/achievements/[id]/claim/route.ts");
    const view = code("components/user/gamification/achievements-view.tsx");

    // The contract break that made the page permanently empty.
    check(
      "the view no longer reads a `badges` field the API never returned",
      !/d\.badges/.test(view)
    );
    check(
      "the view reads the fields the API actually returns",
      /d\.achievements/.test(view) && /d\.summary/.test(view)
    );
    check(
      "the API returns those fields",
      /achievements:\s*processedAchievements/.test(api) && /summary:\s*\{/.test(api)
    );

    // The vocabulary that never matched.
    const seed = fs.readFileSync(
      path.join(process.cwd(), "prisma", "seed.ts"),
      "utf8"
    );
    const seedTypes = [...seed.matchAll(/type:\s*"([a-z_]+)",\s*threshold/g)].map(
      (m) => m[1]
    );
    check("the seed defines achievement types", seedTypes.length > 0);
    check(
      "every seeded type resolves to a measure",
      seedTypes.every((t) => resolveAchievementType(t) !== null),
      seedTypes.filter((t) => !resolveAchievementType(t)).join(", ")
    );
    // The six rows already live still carry the OLD short spellings, so the
    // aliases are load-bearing, not decoration.
    const liveTypes = (
      await prisma.achievement.findMany({ select: { type: true } })
    ).map((a) => a.type);
    check(
      "every type already in the database resolves too",
      liveTypes.every((t) => resolveAchievementType(t) !== null),
      liveTypes.filter((t) => !resolveAchievementType(t)).join(", ")
    );
    check(
      "the API measures through the shared map instead of its own switch",
      /measureAll/.test(api) && !/case "tasks_completed":/.test(api)
    );
    check(
      "tasks_completed counts only approved submissions",
      /status:\s*\{\s*in:\s*\[\.\.\.APPROVED_STATUSES\]\s*\}/.test(lib)
    );
    check(
      "there are six measurable types",
      Object.keys(ACHIEVEMENT_TYPES).length === 6,
      Object.keys(ACHIEVEMENT_TYPES).join(", ")
    );

    // Unlock and payment are separate, which is what makes the retroactive
    // backfill safe to switch on.
    check(
      "the unlock engine writes UserAchievement rows",
      /userAchievement\.upsert/.test(lib)
    );
    check("the unlock engine credits no money", !/creditPoints/.test(lib));
    check(
      "a completed achievement is never re-opened by a falling counter",
      /if \(prev\?\.isCompleted\) continue;/.test(lib)
    );
    check(
      "UserAchievement records when it was collected",
      /claimedAt\s+DateTime\?/.test(schema())
    );
    check(
      "claiming is a CAS on claimedAt",
      /userAchievement\.updateMany/.test(claim) && /claimedAt:\s*null/.test(claim)
    );
    check(
      "claiming pays points through the shared ledger helper",
      /creditPoints\(tx,/.test(claim)
    );
    check(
      "the claim reference is deterministic",
      /reference:\s*`achievement_\$\{id\}`/.test(claim)
    );
    check(
      "claiming awards XP and recomputes the level",
      /xp:\s*\{\s*increment:\s*achievement\.xpReward/.test(claim) &&
        /calculateLevel/.test(claim)
    );
    check(
      "an unmet achievement cannot be claimed",
      /!state\?\.isCompleted/.test(claim)
    );
    check(
      "a second claim is a 409, not a double payment",
      /alreadyClaimed:\s*true/.test(claim) && /ALREADY_CLAIMED/.test(claim)
    );
    check(
      "the summary counts collected points, not every row",
      /filter\(\(a\) => a\.isClaimed\)/.test(api)
    );
    check(
      "the earning paths trigger an evaluation",
      /runAchievementCheck/.test(code("app/api/admin/submissions/[id]/route.ts")) &&
        /runAchievementCheck/.test(code("app/api/tasks/[id]/submit/route.ts")) &&
        /runAchievementCheck/.test(
          code("app/api/admin/withdrawals/[id]/route.ts")
        ) &&
        /runAchievementCheck/.test(code("lib/auth/services.ts"))
    );

    // Live measurement must not throw against real data.
    const anyUser = await prisma.user.findFirst({ select: { id: true } });
    if (anyUser) {
      let ok = true;
      let err = "";
      for (const def of Object.values(ACHIEVEMENT_TYPES)) {
        try {
          const n = await def.measure(anyUser.id);
          if (!Number.isFinite(n) || n < 0) {
            ok = false;
            err = `${def.key} → ${n}`;
          }
        } catch (e) {
          ok = false;
          err = `${def.key} threw: ${(e as Error).message}`;
        }
      }
      check("every measure returns a finite count against live data", ok, err);
    }
  }

  /* ─────────────────────────── 5. Ledger references ── */
  console.log("\n5. Reference keys — changed where safe, left where not");
  {
    const daily = code("app/api/daily-reward/route.ts");
    const browse = code("app/api/browse-earn/claim/route.ts");

    check(
      "the mystery box is keyed on the local day",
      /reference:\s*`mystery_\$\{dayKey\}`/.test(daily)
    );
    check(
      "its balance and ledger row are now one transaction",
      /prisma\.\$transaction\(async \(tx\) => \{[\s\S]{0,600}Mystery Box reward/.test(
        daily
      )
    );
    check(
      "a replayed box no longer reports 'daily reward already claimed'",
      /isDuplicateLedgerError\(err\)\)\s*return null/.test(daily)
    );

    // A per-DAY key would be wrong here — this event repeats all day. The tick
    // bucket is safe because the cooldown guarantees the spacing.
    check(
      "browse & earn is keyed per tick, not per day",
      /browse_\$\{dayKey\}_\$\{tickIndex\}/.test(browse) &&
        /cfg\.tickSeconds \* 1000/.test(browse)
    );
    check(
      "a bucket collision answers 'too soon', not a 500",
      /isDuplicateLedgerError\(err\)/.test(browse) &&
        /cooldownRemaining:\s*cfg\.tickSeconds/.test(browse)
    );
    check(
      "the cooldown that makes the bucket safe is still enforced under the row lock",
      /FOR UPDATE/.test(browse) && /readyAt/.test(browse)
    );

    // The negatives. These are correct as they are; making them deterministic
    // would reject a user's legitimate second action.
    const repeatable: Array<[string, RegExp]> = [
      ["converting points to cash", /reference:\s*`convert_\$\{userId\}_\$\{Date\.now\(\)\}`/],
      ["buying ad credit", /reference:\s*`adcredit_buy_\$\{userId\}_\$\{Date\.now\(\)\}`/],
      ["checking out a cart", /reference:\s*`cart_\$\{Date\.now\(\)\}_\$\{userId\}`/],
      ["an admin balance edit", /reference:\s*`admin_edit_\$\{id\}_\$\{Date\.now\(\)\}`/],
      ["a bulk admin adjustment", /reference:\s*`admin_adjust_\$\{uid\}_\$\{Date\.now\(\)\}`/],
      ["funding a campaign", /reference:\s*`campaign_fund_\$\{campaign\.id\}_\$\{Date\.now\(\)\}`/],
      ["donating to a post", /reference:\s*`donation_\$\{id\}_\$\{Date\.now\(\)\}`/],
    ];
    const files = [
      "lib/points-convert.ts",
      "lib/ad-credits.ts",
      "app/api/cart/checkout/route.ts",
      "app/api/admin/users/[id]/route.ts",
      "app/api/admin/users/bulk/route.ts",
      "app/api/advertiser/campaigns/[id]/fund/route.ts",
      "app/api/feed/[id]/donate/route.ts",
    ];
    const blob = files.map((f) => code(f)).join("\n");
    for (const [what, re] of repeatable) {
      check(`${what} is still keyed per occurrence`, re.test(blob));
    }
    // And each of them says WHY, so the next reader doesn't "fix" it.
    const prose = files.map((f) => src(f)).join("\n");
    check(
      "each repeatable reference explains why it is not deterministic",
      (prose.match(/Per-occurrence by design|legitimately repeatable|stays per-occurrence/g) ??
        []).length >= 6
    );
  }

  /* ─────────────────────────── 6. PointGift ── */
  console.log("\n6. The dead model is gone");
  {
    const sch = schema();
    check("PointGift is out of the schema", !/PointGift/.test(sch));
    const live = await prisma
      .$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM pg_tables WHERE schemaname='public' AND tablename='PointGift'`
      )
      .catch(() => null);
    check(
      "the table is gone from the live database",
      !!live && Number(live[0]?.n ?? 1) === 0
    );
    // The gifting feature that actually ships must still be intact.
    check(
      "Donation is still the live gifting path",
      /donation\.create/.test(code("app/api/feed/[id]/donate/route.ts")) &&
        /TransactionType\.GIFT/.test(code("app/api/feed/[id]/donate/route.ts"))
    );
    check("the Donation model is still present", /model Donation \{/.test(sch));
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
