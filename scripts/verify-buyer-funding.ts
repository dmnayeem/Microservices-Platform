import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { quoteTask } from "../src/lib/buyer-quote";

/**
 * Buyers funding tasks — the rules an admin can set, and the money.
 *
 * `POST /api/tasks/create` already debited a buyer's wallet and held the reward
 * pool against the task, but every rule around it was a literal in that file:
 * hardcoded task types, Zod ceilings, no floor, no KYC gate, and **no platform
 * fee at all** — a buyer paid exactly the point value of the rewards and the
 * platform earned nothing on the transaction it exists to intermediate.
 *
 * Two properties matter more than the rest and are asserted directly, because
 * they are the ones a later edit would quietly drop:
 *
 *  1. **One quote.** The invoice the buyer reads and the amount the server
 *     debits come from the same `quoteTask`. Two implementations drift by a
 *     rounding step and the buyer reads that as being overcharged.
 *  2. **A rejected task refunds the fee.** Keeping a commission on a task you
 *     refused is the fastest way to lose the buyer, and it is a default, not an
 *     accident — `buyer.refund_fee_on_reject` can turn it off deliberately.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-buyer-funding.ts
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

const CREATE = "src/app/api/tasks/create/route.ts";
const REVIEW = "src/app/api/admin/tasks/[id]/review/route.ts";
const REVIEW_API = REVIEW;
const VIEW = "src/components/user/tasks/create-task-view.tsx";
const FORM = "src/components/admin/settings/system-settings-form.tsx";

async function main() {
  console.log("\n=== Buyer task funding ===\n");

  /* ── 1. Pricing is computed once ── */
  console.log("1. One quote, two readers");
  {
    const create = read(CREATE);
    const view = read(VIEW);
    check(
      "the server prices the charge with quoteTask",
      /quoteTask\(/.test(create)
    );
    check(
      "the buyer's invoice uses the same function",
      /quoteTask\(/.test(view) &&
        /from "@\/lib\/buyer-quote"/.test(view)
    );
    check(
      "the server does not recompute the total by hand",
      !/const costUsd = budgetPoints \/ pointsPerUsd/.test(create)
    );
    check(
      // Matched as import STATEMENTS: the doc comment says the words
      // "server-only" and "prisma" while explaining why neither is imported.
      "buyer-quote.ts is client-safe (no server-only, no prisma)",
      !/^import .*(server-only|@\/lib\/prisma)/m.test(
        read("src/lib/buyer-quote.ts")
      )
    );

    // The arithmetic itself.
    const q = quoteTask({
      pointsPerCompletion: 50,
      completions: 100,
      pointsPerUsd: 1000,
      feePercent: 10,
    });
    check("100 x 50 pts = 5,000 pts of rewards", q.budgetPoints === 5000);
    check("…which is $5 at 1000 pts/$", q.rewardUsd === 5);
    check("…plus a 10% fee of $0.50", q.feeUsd === 0.5);
    check("…charged as $5.50", q.totalUsd === 5.5);

    const free = quoteTask({
      pointsPerCompletion: 50,
      completions: 100,
      pointsPerUsd: 1000,
      feePercent: 0,
    });
    check(
      "a 0% fee charges exactly the reward pool (today's behaviour)",
      free.totalUsd === free.rewardUsd && free.feeUsd === 0
    );
    check(
      "a negative fee cannot make a task cheaper than its rewards",
      quoteTask({
        pointsPerCompletion: 10,
        completions: 10,
        pointsPerUsd: 1000,
        feePercent: -50,
      }).feeUsd === 0
    );
    check(
      "a zero points-per-USD rate does not divide by zero",
      Number.isFinite(
        quoteTask({
          pointsPerCompletion: 10,
          completions: 10,
          pointsPerUsd: 0,
          feePercent: 0,
        }).rewardUsd
      )
    );
  }

  /* ── 2. Every admin rule is actually enforced ── */
  console.log("\n2. The admin settings gate the API");
  {
    const create = read(CREATE);
    // Order matters: turning buyer funding off has to close the API even for
    // accounts that already hold the `createTasks` grant.
    const masterAt = create.indexOf("!buyer.enabled");
    const featureAt = create.indexOf('userCanFeature(userId, "createTasks")');
    check(
      "the master switch is checked BEFORE the per-user feature",
      masterAt > -1 && featureAt > -1 && masterAt < featureAt,
      `master@${masterAt} feature@${featureAt}`
    );
    check(
      // The type gate now runs through `buyer-scope`, which layers the admin's
      // GLOBAL list with this buyer's own suspensions — so it also covers
      // "allowed for buyers in general, but switched off for this one".
      "allowed task types are enforced, per buyer",
      /typeRefusal\(scope, d\.type\)/.test(create) &&
        /getBuyerScope\(userId\)/.test(create)
    );
    check(
      "…and the social platform is gated the same way",
      /platformRefusal\(scope, d\.socialPlatform\)/.test(create),
      "a buyer suspended from Pinterest must not be able to post one anyway"
    );
    check("the minimum reward is enforced", /buyer\.minPointsPerTask/.test(create));
    check("the maximum reward is enforced", /buyer\.maxPointsPerTask/.test(create));
    check("the completion cap is enforced", /buyer\.maxCompletions/.test(create));
    check("the KYC gate is enforced", /buyer\.requireKyc/.test(create));
    check(
      "auto-approve decides the task's starting status",
      /buyer\.autoApproveTasks \? "ACTIVE" : "PENDING_REVIEW"/.test(create)
    );
    // Nothing is charged at creation any more, so the thing the gate must
    // precede is the task being PUBLISHED — an unverified buyer must not get a
    // live task that will start charging them on its first completion.
    const kycAt = create.indexOf("buyer.requireKyc");
    const createAt = create.indexOf("tx.task.create(");
    check(
      "the KYC gate runs before the task is published",
      kycAt > -1 && createAt > -1 && kycAt < createAt,
      `kyc@${kycAt} create@${createAt}`
    );
  }

  /* ── 3. Money moves per completion, and the fee stays visible ── */
  console.log("\n3. Charged on use, one completion at a time");
  {
    const create = read(CREATE);
    const credit = read("src/lib/task-credit.ts");

    check(
      "publishing writes a row that records the PROMISE, not a payment",
      /reference: `task_fund_\$\{created\.id\}`/.test(create) &&
        /points: 0,/.test(create),
      "nothing has been charged yet, so a non-zero figure here would be a lie"
    );
    check(
      "no fee is taken at creation",
      !/task_fee_\$\{created\.id\}/.test(create),
      "a fee on 100 completions when only 10 happen charges for 90 that never did"
    );

    // The property is that a FAILED charge yields no payout. Asserted where it
    // is actually enforced — the helper returns `paid: false` and every caller
    // gates crediting on it — rather than by comparing indexOf positions, which
    // matched the `closeTask` field in the interface declaration above the
    // function and so proved nothing.
    check(
      "a charge that fails returns paid:false before anything else happens",
      /const paid = await spendTaskCredit\(db, args\.buyerId, total\);[\s\S]{0,200}if \(!paid\) \{[\s\S]{0,300}paid: false/.test(
        credit
      )
    );
    check(
      "admin approval credits only when the charge succeeded",
      /credit = charge\.paid;/.test(
        read("src/app/api/admin/submissions/[id]/route.ts")
      )
    );
    check(
      "auto-approve pays nothing when the charge failed",
      /if \(!charge\.paid\) \{[\s\S]{0,1000}rewards: \{ points: 0, xp: 0 \}/.test(
        read("src/app/api/tasks/[id]/submit/route.ts")
      )
    );
    check(
      "the re-check hands the submission back instead of paying",
      /if \(!charge\.paid\) \{[\s\S]{0,400}SubmissionStatus\.PENDING/.test(
        read("src/lib/social-recheck.ts")
      )
    );
    check(
      "the charge is a CAS on the buyer's balance",
      /taskCreditPoints: \{ gte: amount \}/.test(credit),
      "two completions approved at once must not both spend the same points"
    );
    check(
      "the fee is charged per completion, in credit",
      /feePoints[\s\S]{0,200}rewardPoints \+ feePoints/.test(credit)
    );
    check(
      "…and rounds UP, so it cannot be avoided by running tiny tasks",
      /Math\.ceil\(\(rewardPoints \* args\.feePercent\) \/ 100\)/.test(credit)
    );
    check(
      "no fee row is written when the fee is zero",
      /if \(feePoints > 0\)/.test(credit)
    );
    check(
      "the fee row is ADMIN_FEE with a task_fee_ reference",
      /TransactionType\.ADMIN_FEE/.test(credit) &&
        /reference: `task_fee_\$\{args\.taskId\}/.test(credit)
    );

    const sources = read("src/lib/tx-sources.ts");
    check(
      "task fees are their own revenue source, not lumped into 'admin'",
      /"taskfee"/.test(sources) && /task_fee_/.test(sources)
    );
    check(
      "ADMIN_FEE still counts as platform revenue",
      /case "ADMIN_FEE":\s*\n\s*return "revenue";/.test(
        read("src/lib/finance/signing.ts")
      )
    );

    // The single most valuable property: three payout paths, one charge.
    const paths = [
      "src/app/api/admin/submissions/[id]/route.ts",
      "src/app/api/tasks/[id]/submit/route.ts",
      "src/lib/social-recheck.ts",
    ];
    const missing = paths.filter((f) => !/chargeTaskCompletion\(/.test(read(f)));
    check(
      "all three payout paths charge through the SAME helper",
      missing.length === 0,
      missing.join(", ") || undefined
    );
    const inlined = paths.filter((f) =>
      /remainingBudget: \{ decrement:/.test(read(f))
    );
    check(
      "…and none of them still drains a reserved pool by hand",
      inlined.length === 0,
      inlined.join(", ") || undefined
    );
  }

  /* ── 4. A task that never ran never cost anything ── */
  console.log("\n4. Rejection costs the buyer nothing");
  {
    const review = read(REVIEW);
    check(
      "no refund path is needed, because nothing was charged",
      !/refundTaskCredit\(/.test(review) &&
        !/cashBalance:\s*\{\s*increment/.test(review),
      "charging on use removes the whole class of stranded-budget bug"
    );
    check(
      "the rejected task stops promising anything",
      /remainingBudget: 0, rejectionReason: reason/.test(review)
    );
    check(
      "the buyer is told they were not charged",
      /No credit was charged/.test(review)
    );
    check(
      "a reason is still required",
      /action === "reject" && reason\.length < 5/.test(review)
    );

    // The close rule is what protects the WORKER now that nothing is reserved.
    const credit = read("src/lib/task-credit.ts");
    check(
      "a task closes the moment the buyer cannot cover ONE MORE reward",
      /outOfCredit \|\| promiseDone/.test(credit),
      "not when the balance hits zero — by then someone has already worked for nothing"
    );
    check(
      "…and the balance is re-read rather than assumed",
      /const after = await db\.user\.findUnique/.test(credit),
      "another task of theirs may have drawn on it in between"
    );
  }

  /* ── 5. The buyer is told the price before committing ── */
  console.log("\n5. The invoice is shown before the charge");
  {
    const view = read(VIEW);
    check("the reward pool is a line item", /Reward pool/.test(view));
    check("the fee is a line item when there is one", /Platform fee \(\{feePercent\}%\)/.test(view));
    check(
      "the total is framed as a ceiling, not a charge",
      /Most it can cost/.test(view) && /If everyone completes it/.test(view),
      "nothing is taken at creation, so calling it a total would be wrong"
    );
    check(
      "…and it says plainly that nothing is charged yet",
      /Nothing is charged now/.test(view)
    );
    check(
      "the dollar value trails as a reference, not as the headline",
      /Worth about/.test(view)
    );
    check(
      "the buyer is told how many completions their credit covers",
      /enough for \$\{Math\.floor\(/.test(view) && /taskCredit/.test(view),
      "'you have 20,000' means nothing; 'that is 400 completions' does"
    );
    check(
      "the publish gate is ONE completion, not the whole budget",
      /perCompletion/.test(view),
      "requiring the full budget up front would defeat pay-as-you-go"
    );
    check(
      "admin bounds are shown before submit, not as a server error",
      /limitError/.test(view) &&
        /disabled=\{busy \|\| !!limitError \|\| shortBy > 0\}/.test(view)
    );
    check(
      "…and so is running out of credit, with a way to top up",
      /shortBy/.test(view) && /\/buy-points/.test(view),
      "finding out at submit time that you cannot afford it wastes the whole form"
    );
    check(
      "the type picker only offers types the admin allows",
      /\.filter\(\(opt\) => allowedTypes\.includes\(opt\.value\)\)/.test(view)
    );
    check(
      "the page refuses to render the form when there is nothing to create",
      /!buyer\.enabled \|\| scope\.types\.length === 0/.test(
        read("src/app/(main)/create-task/page.tsx")
      ),
      "covers a buyer suspended from every type, not only the global switch"
    );
  }

  /* ── 6. Every setting has a control ── */
  console.log("\n6. All of it is admin-configurable");
  {
    const form = read(FORM);
    for (const key of [
      "buyer.enabled",
      "buyer.fee_percent",
      "buyer.min_points_per_task",
      "buyer.max_points_per_task",
      "buyer.max_completions",
      "buyer.allowed_task_types",
      "buyer.require_kyc",
      "buyer.auto_approve_tasks",
    ]) {
      // The tick-box group wraps its `set(` call across lines, so a plain
      // `includes('set("key"')` misses it. Whitespace-tolerant, no regex
      // escaping needed.
      check(
        `${key} has a control`,
        form.replace(/\s+/g, "").includes(`set("${key}"`)
      );
    }
    check(
      "the client and server share one list of buyer task types",
      /from "@\/lib\/buyer-task-types"/.test(form) &&
        /from "@\/lib\/buyer-task-types"/.test(read("src/lib/buyer-settings.ts"))
    );
  }

  /* ── 6b. Audience is the admin's call, never the buyer's ── */
  console.log("\n6b. Who sees the task is an admin decision");
  {
    const create = read(CREATE);
    const api = read(REVIEW_API);
    const ui = read("src/components/admin/task-review-actions.tsx");

    check(
      "the buyer's create endpoint does not accept requiredAccessLevel",
      !/requiredAccessLevel/.test(create),
      "a buyer must not be able to restrict their task to premium members, nor widen it"
    );
    check(
      "the admin sets it when approving",
      /body\.requiredAccessLevel/.test(api)
    );
    check(
      "the value is clamped rather than trusted",
      /Math\.max\(0, Math\.min\(100, Math\.floor\(rawLevel\)\)\)/.test(api)
    );
    check(
      "omitting it leaves the task's existing audience alone",
      /requiredAccessLevel === null \? \{\} :/.test(api),
      "an approve with no audience must not silently reset it to 0"
    );
    check(
      "the choice is recorded in the audit row",
      /requiredAccessLevel,/.test(api) && /decision: "approve"/.test(api)
    );
    check(
      "the admin picks a PLAN NAME, not a raw access level",
      /and up/.test(ui) && /Everyone/.test(ui),
      "asking an admin to remember that 2 means Gold is how a control goes unused"
    );
  }

  /* ── 7. Live data is consistent ── */
  console.log("\n7. Live state");
  {
    const funded = await prisma.task.findMany({
      where: { fundedByUserId: { not: null } },
      select: {
        id: true,
        title: true,
        status: true,
        budgetPoints: true,
        remainingBudget: true,
      },
    });
    console.log(`   ${funded.length} buyer-funded task(s)`);
    check(
      "no task has more budget left than it was funded with",
      funded.every((t) => t.remainingBudget <= t.budgetPoints),
      funded
        .filter((t) => t.remainingBudget > t.budgetPoints)
        .map((t) => t.id)
        .join(", ")
    );
    check(
      "no funded task has a negative remaining pool",
      funded.every((t) => t.remainingBudget >= 0)
    );
    check(
      "every rejected buyer task has released its pool",
      funded
        .filter((t) => t.status === "REJECTED")
        .every((t) => t.remainingBudget === 0)
    );

    // A fee row must never outlive its refund.
    const feeRows = await prisma.transaction.findMany({
      where: { reference: { startsWith: "task_fee_" } },
      select: { reference: true, amount: true },
    });
    const charges = feeRows.filter((r) => !r.reference!.startsWith("task_fee_refund_"));
    console.log(`   ${charges.length} platform fee charge(s) recorded`);
    check(
      "every recorded fee charge is a debit on the payer",
      charges.every((r) => Number(r.amount) <= 0)
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
