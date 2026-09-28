import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "./_q";
import {
  REFERRAL_BONUS_DEFAULTS,
  normaliseMilestones,
  newMilestoneId,
} from "../src/lib/referral-config";

/**
 * The five referral models, and what each of them actually pays.
 *
 * Audited against the owner's list. Three existed, two did not:
 *
 *   1. Two-way (both sides paid)  — MISSING: only the referrer was ever paid,
 *      so the person actually signing up had no reason to use a link.
 *   2. Sign-up                    — existed.
 *   3. Milestone                  — MISSING entirely.
 *   4. Purchase-based             — existed for packages only.
 *   5. Multi-tier                 — existed (ReferralLevel), untouched by
 *      request: "ager tier jeivabe banay silam oita oi vabei thakbe".
 *
 * The properties worth guarding are the ones that cost money when wrong:
 * every award is idempotent on its own reference, milestones cannot be farmed
 * with accounts that never verify, and the invitee's half is not silently
 * withheld for something the referrer did.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-referral-models.ts
 */

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
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LIB = "src/lib/referral-bonus.ts";
const FORM = "src/components/admin/referrals/referral-bonus-config-form.tsx";

async function main() {
  console.log("\n=== Referral models ===\n");

  /* ── 1. Two-way ── */
  console.log("1. Two-way — the invitee gets paid too");
  {
    const lib = code(LIB);
    check(
      "there is an award for the NEW USER, not only the referrer",
      /export async function awardInviteeSignupBonus/.test(lib),
      "paying only the referrer gives the person signing up no reason to use a link"
    );
    check(
      "it credits the invitee, not the referrer",
      /userId: referredUserId,[\s\S]{0,200}points: cfg\.inviteePoints/.test(lib)
    );
    check(
      "it is idempotent on the invited user",
      /reference: `refbonus_invitee_\$\{referredUserId\}`/.test(lib),
      "signup rewards re-run on a retried verification and a repeated Google callback"
    );
    check(
      "someone who arrived with no referrer is not paid",
      /if \(!referred\?\.referredById\) return;/.test(lib),
      "otherwise it stops being a referral bonus and becomes a universal one"
    );
    check(
      "the invitee's half is NOT withheld for the referrer by default",
      REFERRAL_BONUS_DEFAULTS.inviteeRequiresQualifiedReferrer === false,
      "the invitee did nothing wrong, and withholding removes the incentive the model exists to create"
    );
    check(
      "…but an admin can turn that gate on",
      /cfg\.inviteeRequiresQualifiedReferrer &&/.test(lib)
    );
    const signup = code("src/lib/auth/services.ts");
    check(
      "both halves fire on signup",
      /awardReferralSignupBonus\(userId\)/.test(signup) &&
        /awardInviteeSignupBonus\(userId\)/.test(signup)
    );
  }

  /* ── 2. Sign-up ── */
  console.log("\n2. Sign-up — the referrer's side");
  {
    const lib = code(LIB);
    check(
      "it has its own switch, separate from the master one",
      /!cfg\.signupEnabled/.test(lib),
      "an admin turning off sign-up rewards must not have to turn off everything"
    );
    check(
      "idempotent per invited user",
      /reference: `refbonus_signup_\$\{referredUserId\}`/.test(lib)
    );
  }

  /* ── 3. Milestones ── */
  console.log("\n3. Milestones — the ladder");
  {
    const lib = code(LIB);
    check(
      "milestones exist at all",
      /export async function awardReferralMilestones/.test(lib)
    );
    check(
      "each step is idempotent on its own stable id",
      /reference: `refbonus_milestone_\$\{referrerId\}_\$\{m\.id\}`/.test(lib),
      "one reference for the whole ladder would pay only the first step ever reached"
    );
    check(
      "EVERY reached step is paid, not just the highest",
      /for \(const m of cfg\.milestones\)/.test(lib) &&
        /if \(count < m\.referrals\) break/.test(lib),
      "a backfill can cross several at once; skipping the middle ones quietly owes somebody money"
    );
    check(
      "it counts ACTIVE invitees only",
      /status: "ACTIVE"/.test(lib),
      "counting raw rows makes the ladder farmable with addresses that never verify"
    );
    check(
      "the anti-farm gate applies to milestones too",
      /awardReferralMilestones[\s\S]{0,600}referrerQualifies\(referrerId, cfg\)/.test(
        lib
      )
    );
    check(
      "it runs when a referral lands, not on a schedule",
      /awardReferralMilestones\(referrerId\)/.test(
        code("src/lib/auth/services.ts")
      ),
      "a reward that arrives days later is not the one that changes behaviour"
    );

    // The normaliser is what lets the award loop trust the order.
    const messy = normaliseMilestones([
      { referrals: 10, points: 500, label: "Silver" },
      { referrals: 3, points: 100, label: "Bronze" },
      { referrals: 3, points: 999, label: "Duplicate" },
      { referrals: 0, points: 50, label: "Zero" },
      { referrals: 5, points: 0, label: "Free" },
      "rubbish",
    ]);
    check("…sorted ascending", messy.map((m) => m.referrals).join() === "3,10");
    check("…duplicates collapse to one", messy.filter((m) => m.referrals === 3).length === 1);
    check("…a zero threshold is dropped", !messy.some((m) => m.referrals === 0));
    check("…a zero reward is dropped", !messy.some((m) => m.points === 0));
    check("…junk is dropped rather than throwing", messy.length === 2);
    check(
      "an unlabelled step still gets a name the user can read",
      normaliseMilestones([{ referrals: 7, points: 10 }])[0].label.length > 0
    );
  }

  /* ── 4. Purchase-based ── */
  console.log("\n4. Purchase-based");
  {
    const lib = code(LIB);
    check(
      "a package purchase pays",
      /export async function awardReferralSubscriptionBonus/.test(lib)
    );
    check(
      "a FIRST purchase of anything else pays separately",
      /export async function awardReferralPurchaseBonus/.test(lib),
      "'bought a plan' and 'spent money at all' are different signals"
    );
    check(
      "the first-purchase bonus is keyed per USER, so it pays once",
      /reference: `refbonus_purchase_\$\{referredUserId\}`/.test(lib),
      "keying it per order would pay on every purchase, which is not what 'first purchase' means"
    );
    check(
      "both have their own switches",
      /!cfg\.subscriptionEnabled/.test(lib) && /!cfg\.purchaseEnabled/.test(lib)
    );
  }

  /* ── 4b. A cut of deposits and withdrawals ── */
  console.log("\n4b. Money movement pays the referrer");
  {
    const lib = code(LIB);
    check(
      "there is a percentage bonus on money moved",
      /export async function awardReferralMoneyBonus/.test(lib)
    );
    check(
      "it is a percentage of the ELIGIBLE amount, converted at the current rate",
      /eligibleUsd \* \(pct \/ 100\) \* pointsPerUsd/.test(lib)
    );
    check(
      "deposit and withdrawal have separate switches and percentages",
      /cfg\.depositEnabled/.test(lib) &&
        /cfg\.withdrawalEnabled/.test(lib) &&
        /cfg\.depositPercent/.test(lib) &&
        /cfg\.withdrawalPercent/.test(lib)
    );
    check(
      "idempotent per movement",
      /reference: `refbonus_\$\{kind\.toLowerCase\(\)\}_\$\{sourceRef\}`/.test(lib),
      "a webhook replay or a re-approval must not pay twice"
    );

    const dep = code("src/app/api/admin/deposits/[id]/route.ts");
    check(
      "the deposit hook fires AFTER the credit commits",
      dep.indexOf("deliverToUser") < dep.indexOf("awardReferralMoneyBonus"),
      "a bonus must never be able to fail a deposit that is already credited"
    );
    const wd = code("src/app/api/admin/withdrawals/[id]/route.ts");
    check(
      "the withdrawal hook only fires once the money has gone out",
      /awardReferralMoneyBonus\(/.test(wd) &&
        wd.indexOf("Withdrawal marked as paid") >
          wd.indexOf("awardReferralMoneyBonus"),
      "paying on a payout that later fails would have to be clawed back"
    );
    check(
      "…and is fire-and-forget",
      /void import\("@\/lib\/referral-bonus"\)/.test(wd) &&
        /void import\("@\/lib\/referral-bonus"\)/.test(dep)
    );
  }

  /* ── 4c. The user is told what the fee is BEFORE they commit ── */
  console.log("\n4c. Fee disclosure, before an amount is entered");
  {
    const dv = code("src/components/user/wallet/deposit-view.tsx");
    check(
      "each deposit method shows its own charge on the card",
      /effectiveChargePct\(m\)/.test(dv) && /% fee`/.test(dv),
      "a fee that only appears after an amount is typed reads as a trick"
    );
    check(
      "a zero-charge method says so rather than showing nothing",
      /No fee/.test(dv),
      "silence is ambiguous — the user cannot tell 'free' from 'not loaded yet'"
    );
    check(
      "VAT is named up front when it is switched on",
      /vat\.enabled && vat\.pct > 0/.test(dv)
    );

    const wv = code("src/components/user/wallet/withdrawal-view.tsx");
    const feeAt = wv.indexOf("Fee (");
    check(
      "the withdrawal fee percentage is on screen",
      feeAt > -1 && /feePct\.toFixed\(1\)/.test(wv)
    );
    check(
      "…and is NOT hidden behind an entered amount",
      feeAt > -1 &&
        !/amount > 0 &&[\s\S]{0,400}Fee \(/.test(wv) &&
        !/\{hasAmount && [\s\S]{0,400}Fee \(/.test(wv),
      "the breakdown block must render unconditionally so the % is visible at rest"
    );
  }

  /* ── 3b. "Active" means active, not merely un-banned ── */
  console.log("\n3b. What counts as an active referral");
  {
    const lib = code(LIB);
    check(
      "the count is measured on real activity, not account status alone",
      /dailyMissionClaim\.findMany/.test(lib) &&
        /taskSubmission\.findMany/.test(lib),
      "UserStatus.ACTIVE only means 'not banned' — 100 dead accounts would have earned a free plan"
    );
    check(
      "DISTINCT days are counted, not events",
      /toISOString\(\)\.slice\(0, 10\)/.test(lib) && /new Set<string>/.test(lib),
      "twenty tasks in one sitting is one day of being active"
    );
    check(
      "two signals count, so one habit is not required",
      /claimedAt/.test(lib) && /AUTO_APPROVED/.test(lib)
    );
    check(
      "only approved work counts",
      /status: \{ in: \["APPROVED", "AUTO_APPROVED"\] \}/.test(lib),
      "a rejected submission is not evidence of anything"
    );
    check(
      "an admin can still fall back to the simple rule",
      /if \(minDays === 0\) return live\.length/.test(lib)
    );
    check(
      "the default is stricter than 'exists'",
      REFERRAL_BONUS_DEFAULTS.milestoneActivity.minActiveDays > 0,
      "a default of 0 would ship the farmable version"
    );
  }

  /* ── 3c. A milestone can pay a free subscription ── */
  console.log("\n3c. Subscriptions as a milestone prize");
  {
    const lib = code(LIB);
    check(
      "a step can grant a plan instead of points",
      /rewardType === "SUBSCRIPTION"/.test(lib) &&
        /grantMilestoneSubscription/.test(lib)
    );
    check(
      "the step is CLAIMED before the plan is granted",
      /allowZero: true[\s\S]{0,800}if \(!claimed\) continue;[\s\S]{0,200}grantMilestoneSubscription/.test(
        lib
      ),
      "granting first and recording after hands out a free month on every re-run"
    );
    check(
      "granting EXTENDS an existing plan rather than overwriting it",
      /me\.packageExpiresAt > now \? me\.packageExpiresAt : now/.test(lib),
      "someone who just paid for a month and then earns one should end with two"
    );
    check(
      "a deleted plan fails loudly rather than paying nothing",
      /if \(!pkg\) return false/.test(lib) && /console\.error/.test(lib)
    );

    // A step that cannot pay anything must never be stored.
    const bad = normaliseMilestones([
      { referrals: 5, rewardType: "SUBSCRIPTION", packageId: "", months: 1 },
      { referrals: 9, rewardType: "POINTS", points: 0 },
      { referrals: 100, rewardType: "SUBSCRIPTION", packageId: "pkg_gold", months: 1 },
    ]);
    check(
      "a subscription step with no plan is dropped",
      !bad.some((m) => m.referrals === 5)
    );
    check("a points step worth nothing is dropped", !bad.some((m) => m.referrals === 9));
    check("a complete subscription step survives", bad.some((m) => m.referrals === 100));
    check(
      "months are clamped to something sane",
      normaliseMilestones([
        { referrals: 1, rewardType: "SUBSCRIPTION", packageId: "p", months: 999 },
      ])[0].months <= 24
    );

    const form = code(FORM);
    check(
      "the admin can pick the plan and the number of months",
      /Free subscription/.test(form) && /months:/.test(form)
    );
    check(
      "…and only ACTIVE plans are offered",
      /isActive: true/.test(code("src/app/admin/referrals/page.tsx")),
      "offering a retired plan as a prize is a promise nothing can deliver"
    );
    check(
      "the activity rule is editable beside the ladder",
      /milestoneActivity/.test(form)
    );
  }

  /* ── 5. Multi-tier, untouched ── */
  console.log("\n5. Multi-tier — left exactly as it was");
  {
    const comm = code("src/lib/referral-commissions.ts");
    check(
      "the chain walk still reads ReferralLevel",
      /prisma\.referralLevel\.findMany/.test(comm)
    );
    check(
      "it still walks up to 10 levels",
      /Math\.min\(10, Math\.max\(\.\.\.referralLevels\.map/.test(comm) && /level <= deepest/.test(comm)
    );
    check(
      "the cycle guard is still there",
      /seen|visited/i.test(comm),
      "an admin edit can create a loop, and walking one pays the same accounts on every hop"
    );
    check(
      "the level table keeps its own page",
      fs.existsSync(path.join(root, "src/app/admin/referrals/settings/page.tsx"))
    );
    check(
      "…and the referral page links to it",
      /\/admin\/referrals\/settings/.test(code(FORM))
    );
  }

  /* ── 6. One place to control all of it ── */
  console.log("\n6. All of it, on the referral page");
  {
    const form = code(FORM);
    for (const [label, key] of [
      ["referrer sign-up", "signupEnabled"],
      ["invitee half", "inviteeEnabled"],
      ["milestones", "milestonesEnabled"],
      ["subscription", "subscriptionEnabled"],
      ["first purchase", "purchaseEnabled"],
      ["month-end", "monthlyEnabled"],
    ] as const) {
      check(`${label} has a switch`, new RegExp(`cfg\\.${key}`).test(form));
    }
    check(
      "milestones can be added and removed",
      /addMilestone/.test(form) && /dropMilestone/.test(form)
    );
    check(
      "the master switch is visibly separate",
      /set\("enabled", v\)/.test(form)
    );
    check(
      "the form is client-safe — no Prisma pulled into the browser",
      /from "@\/lib\/referral-config"/.test(form) &&
        !/from "@\/lib\/referral-bonus"/.test(form),
      "importing a runtime value from referral-bonus.ts would bundle the database client"
    );
    check(
      "…and that module really has no server imports",
      !/^import .*(server-only|@\/lib\/prisma)/m.test(
        read("src/lib/referral-config.ts")
      )
    );
  }

  /* ── 7. Live ── */
  console.log("\n7. Live state");
  {
    const levels = await prisma.referralLevel.findMany({
      where: { isActive: true },
      orderBy: { level: "asc" },
      select: { level: true, commissionValue: true },
    });
    const total = levels.reduce((s, l) => s + l.commissionValue, 0);
    console.log(
      `   ${levels.length} active level(s), ${total}% of every earning paid out in commission`
    );
    check(
      "the commission ladder does not exceed 100% of an earning",
      total <= 100,
      `${total}% — every task payout would cost more than it pays`
    );

    const paid = await prisma.transaction.groupBy({
      by: ["type"],
      where: { type: "REFERRAL" },
      _count: { _all: true },
      _sum: { points: true },
    }) as unknown as { _count: { _all: number }; _sum: { points: number | null } }[];
    const n = paid[0]?._count._all ?? 0;
    console.log(
      `   ${n} referral payout(s) so far, ${(paid[0]?._sum.points ?? 0).toLocaleString()} points`
    );
    check("the live audit ran", true);
  }

  /* ── 6. The deposit→withdraw farm ── */
  console.log("\n6. Deposit→withdraw cannot be farmed");
  {
    const lib = code(LIB);
    const cfg = code("src/lib/referral-config.ts");
    const form = code(FORM);

    check(
      "the withdrawal cut is capped by what the invitee actually EARNED",
      /withdrawalBonusEarnedOnly/.test(lib) &&
        /toNum\(referred\.totalEarnings/.test(lib),
      "totalEarnings never moves on a deposit, so returned money is worth nothing out"
    );
    check(
      "…less what has already been paid on this pair, so one $100 pays once",
      /h\.kind === "WITHDRAWAL"/.test(lib) &&
        /earnedUsd - alreadyCounted/.test(lib)
    );
    check(
      "there is a rolling per-invitee ceiling, which bounds the DEPOSIT leg too",
      /moneyBonusMaxPointsPerUser/.test(lib) &&
        /moneyBonusWindowDays/.test(lib) &&
        /headroom/.test(lib)
    );
    check(
      "a user near the ceiling is paid the headroom, not cut off",
      /points = Math\.min\(points, headroom\)/.test(lib),
      "refusing outright would punish an honest heavy depositor"
    );
    check(
      "the bonus records the amount it was COMPUTED on, not the raw movement",
      /amountUsd: eligibleUsd, movedUsd: amountUsd/.test(lib),
      "recording the gross would let one genuine payout eat the whole allowance"
    );
    check(
      "a failed history read skips the bonus instead of paying unguarded",
      /Number\.MAX_SAFE_INTEGER/.test(lib),
      "an empty history on error reads as 'nothing paid yet' — the open door"
    );
    check(
      "the guards ship on by default",
      REFERRAL_BONUS_DEFAULTS.withdrawalBonusEarnedOnly === true &&
        REFERRAL_BONUS_DEFAULTS.moneyBonusMaxPointsPerUser > 0 &&
        REFERRAL_BONUS_DEFAULTS.moneyBonusWindowDays > 0,
      `earnedOnly=${REFERRAL_BONUS_DEFAULTS.withdrawalBonusEarnedOnly} cap=${REFERRAL_BONUS_DEFAULTS.moneyBonusMaxPointsPerUser}`
    );
    check(
      "…and are tunable from the admin form (both ends of every key)",
      /set\("withdrawalBonusEarnedOnly"/.test(form) &&
        /set\("moneyBonusMaxPointsPerUser"/.test(form) &&
        /set\("moneyBonusWindowDays"/.test(form) &&
        /cfg\.withdrawalBonusEarnedOnly/.test(form)
    );
    check(
      "the form says out loud what happens with both legs on",
      /cfg\.depositEnabled && cfg\.withdrawalEnabled/.test(form),
      "the owner intends to turn these on — the risk has to be where he'll see it"
    );
  }

  /* ── 7. Editing a milestone threshold does not re-pay it ── */
  console.log("\n7. A milestone keeps its identity across an edit");
  {
    const lib = code(LIB);
    const form = code(FORM);

    check(
      "the payout reference is keyed on the step's id, not its threshold",
      /reference: `refbonus_milestone_\$\{referrerId\}_\$\{m\.id\}`/.test(lib) &&
        !/refbonus_milestone_\$\{referrerId\}_\$\{m\.referrals\}/.test(lib),
      "the threshold as identity is what minted a new key and re-paid everyone"
    );
    check(
      "the form gives a NEW step a fresh stable id",
      /id: newMilestoneId\(\)/.test(form)
    );

    // Legacy entries must land on the id that reproduces the OLD reference, or
    // the first load after this change re-pays every step ever paid.
    const legacy = normaliseMilestones([
      { referrals: 10, rewardType: "POINTS", points: 500, label: "Bronze" },
    ]);
    check(
      "a legacy step (no id) derives the id from its current threshold",
      legacy[0]?.id === "10",
      `id = ${JSON.stringify(legacy[0]?.id)} — must be "10" to match refbonus_milestone_<referrer>_10`
    );

    // The same step, threshold moved 10 → 12, id carried over.
    const edited = normaliseMilestones([
      { id: "10", referrals: 12, rewardType: "POINTS", points: 500, label: "Bronze" },
    ]);
    check(
      "moving that step's threshold keeps the id, so nobody is paid twice",
      edited[0]?.id === "10" && edited[0]?.referrals === 12,
      `id = ${JSON.stringify(edited[0]?.id)}, referrals = ${edited[0]?.referrals}`
    );
    check(
      "a generated id can never collide with a legacy numeric one",
      /^ms_[a-z0-9]+$/.test(newMilestoneId()) &&
        newMilestoneId() !== newMilestoneId()
    );
  }

  console.log(
    `\n${failures.length === 0 ? "COMPLETE" : "FAILED"}: ${passed} passed, ${failures.length} failed`
  );
  for (const f of failures) console.log(`  - ${f}`);
  await prisma.$disconnect();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
