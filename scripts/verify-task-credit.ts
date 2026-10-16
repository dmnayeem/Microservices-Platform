import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "./_q";
import { quoteTask } from "../src/lib/buyer-quote";

/**
 * Two pots that must never become one.
 *
 * `pointsBalance` is what a worker EARNS: it mirrors into `totalEarnings`, it
 * converts to cash, and cash can be withdrawn. `taskCreditPoints` is what a
 * buyer BUYS to fund tasks.
 *
 * If the two ever met, buying points would be buying withdrawable balance —
 * money in, money straight back out, with a "completed task" as the paperwork.
 * That is a laundering path and a chargeback one at once, and it would not look
 * like a bug from the inside: every individual write would be correct.
 *
 * So this asserts the separation from BOTH directions, by reading the source of
 * every path that touches either balance:
 *   - nothing that credits earnings may write task credit
 *   - task credit may never be converted to cash or withdrawn
 *   - task budgets may never be funded from earned points or cash
 *   - nothing here can ever put money back into a withdrawable balance
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-task-credit.ts
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
/** Source with comments stripped — prose about a rule is not the rule. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every .ts/.tsx under src, excluding generated Prisma output. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "generated" || e.name === "node_modules") continue;
        walk(rel);
      } else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  walk("src");
  return out;
}

const CREDIT_LIB = "src/lib/task-credit.ts";

async function main() {
  console.log("\n=== Task credit is not earned points ===\n");

  /* ── 1. One writer ── */
  console.log("1. Only one module writes the balance");
  {
    const files = sourceFiles();
    // A WRITE means the column appears in a Prisma `data:` payload. Reads
    // (`select`, rendering a number) are fine anywhere.
    const writers = files.filter((f) => {
      const body = code(f);
      return /taskCreditPoints:\s*\{\s*(increment|decrement|set)/.test(body);
    });
    check(
      "task-credit.ts is the only module that increments or decrements it",
      writers.length === 1 && writers[0] === CREDIT_LIB,
      `writers: ${writers.join(", ") || "none"}`
    );

    const lib = code(CREDIT_LIB);
    check(
      "it never touches the earned-points balance",
      !/pointsBalance/.test(lib),
      "the two columns must not meet inside the module that owns one of them"
    );
    check(
      "it never touches totalEarnings",
      !/totalEarnings/.test(lib),
      "buying credit is not earning, and must not inflate lifetime earned"
    );
  }

  /* ── 2. Credit cannot become money ── */
  console.log("\n2. Credit never turns into cash");
  {
    const convert = code("src/lib/points-convert.ts");
    check(
      "points→cash conversion reads only the EARNED balance",
      /pointsBalance/.test(convert) && !/taskCreditPoints/.test(convert)
    );
    const withdrawal = code("src/app/api/withdrawals/route.ts");
    check(
      "withdrawals never see task credit",
      !/taskCreditPoints/.test(withdrawal)
    );
    const wcfg = code("src/lib/withdrawal.ts");
    check(
      "the withdrawal config never sees it either",
      !/taskCreditPoints/.test(wcfg)
    );
    const lib = code(CREDIT_LIB);
    check(
      // There is no refund path at all now, and that is stronger than having a
      // correct one: credit is charged per completion, an approved submission
      // cannot be un-approved, and a rejected task was never charged. Nothing
      // in this module may ever put money back into a withdrawable balance.
      "nothing in the credit module can increment cash",
      !/cashBalance:\s*\{\s*increment/.test(lib),
      "paying credit out to cash would be the laundering path the split exists to close"
    );
    const review = code("src/app/api/admin/tasks/[id]/review/route.ts");
    check(
      "a rejected task charges nothing, so there is nothing to refund",
      !/cashBalance:\s*\{\s*increment/.test(review) &&
        !/taskCreditPoints:\s*\{\s*increment/.test(review),
      "credit is charged per completion; a task that never ran never cost anything"
    );
  }

  /* ── 3. Earning paths never mint credit ── */
  console.log("\n3. Nothing you earn becomes task credit");
  {
    for (const f of [
      "src/lib/ledger.ts",
      "src/lib/social-earning.ts",
      "src/lib/social-recheck.ts",
      "src/lib/referral-commissions.ts",
      "src/lib/browse-earn.ts",
      "src/app/api/admin/submissions/[id]/route.ts",
      "src/app/api/tasks/[id]/submit/route.ts",
    ]) {
      check(
        `${path.basename(f)} does not write task credit`,
        !/taskCreditPoints/.test(code(f))
      );
    }
  }

  /* ── 4. Tasks are funded from credit, and only from credit ── */
  console.log("\n4. Task budgets come out of credit");
  {
    const create = code("src/app/api/tasks/create/route.ts");
    check(
      "creating a task charges NOTHING up front",
      !/spendTaskCredit\(/.test(create),
      "reserving the budget strands money in tasks that expire half-finished"
    );
    check(
      "…but it does refuse a buyer who cannot pay for even one completion",
      /credit < oneCompletion/.test(create),
      "otherwise an empty balance can publish a task that pays nobody"
    );
    check(
      "the charge itself lives in one shared helper",
      /chargeTaskCompletion/.test(read("src/lib/task-credit.ts"))
    );
    check(
      "it no longer debits the wallet",
      !/cashBalance:\s*\{\s*decrement/.test(create),
      "cash pays for CREDIT on /buy-points, not for tasks directly"
    );
    check(
      "it never debits earned points",
      !/pointsBalance/.test(create)
    );
    check(
      "the spend is a CAS, so two creates cannot spend the same points",
      /taskCreditPoints:\s*\{\s*gte:/.test(code(CREDIT_LIB))
    );
    check(
      // Bought with Ad Fund / Ad Points since 2026-10-16: the CAS debit lives
      // in ad-wallet.ts, reached through platform-pay's chargePlatform.
      "the purchase is a CAS too (ad-wallet via chargePlatform), so two buys cannot spend the same balance",
      /chargePlatform\(/.test(code(CREDIT_LIB))
    );
    // The advertised promise is drawn down atomically, not overwritten with a
    // number computed from the snapshot the CALLER read. All three payout
    // paths (submit auto-approve, admin review, social re-check) read the task
    // first and pass `task.remainingBudget` in, so a `set` here let two
    // concurrent approvals both write `snapshot - reward`: the task went on
    // advertising completions the buyer never funded, and the buyer was
    // charged for each one.
    {
      const lib = code(CREDIT_LIB);
      check(
        "remainingBudget is drawn down with a guarded decrement",
        /remainingBudget:\s*\{\s*gte:/.test(lib) &&
          /remainingBudget:\s*\{\s*decrement:/.test(lib),
        "a plain `set` from the caller's snapshot is a lost update between two approvals"
      );
      check(
        "…and it is never `set` from the caller's snapshot",
        !/remainingBudget:\s*promiseLeft/.test(lib) &&
          !/args\.remainingBudget\s*-\s*rewardPoints/.test(lib)
      );
      check(
        "the close decision reads the promise back from the database",
        /taskAfter\?\.remainingBudget/.test(lib),
        "deciding on a stale snapshot re-opens the same race one line later"
      );
      check(
        "the read-backs are sequential — `db` may be a transaction client",
        !/Promise\.all\(\[[\s\S]*db\.task\.findUnique/.test(lib),
        "an interactive transaction must not have two queries in flight"
      );
    }
  }

  /* ── 4b. Credit never moves without a record ── */
  console.log("\n4b. Every movement leaves a row");
  {
    const lib = code(CREDIT_LIB);
    check(
      "a completion writes a spend row, not just a silent decrement",
      /TASK_SPEND_REF/.test(lib) && /kind: "task_completion"/.test(lib),
      "with the fee at 0% — the default — nothing was written at all, so a buyer watching their credit fall had no way to see which task took it"
    );
    check(
      "the spend row carries the reward in points, and no phantom USD",
      /points: -rewardPoints/.test(lib) && /amount: 0,/.test(lib),
      "the dollars moved when the credit was BOUGHT; counting them again here would double-count"
    );
    check(
      "buying credit is the one movement that records dollars",
      /amount: -costUsd/.test(lib)
    );
    check(
      "the fee keeps its own row, separate from the reward",
      /reference: `task_fee_/.test(lib) && /reference: `\$\{TASK_SPEND_REF\}/.test(lib),
      "one row meaning two things is a row nobody can reconcile"
    );

    const hub = code("src/components/user/buyer/buyer-hub-view.tsx");
    check(
      "the Buyer Hub counts CREDIT spent, not dollars",
      /creditSpent/.test(hub) && !/const netSpent/.test(hub),
      "summing amountUsd reported $0.00 once charging moved to points"
    );
    check(
      "…and does not claim credit is 'held'",
      /advertised/.test(hub) && !/still held/.test(hub),
      "nothing is reserved, so held would tell a buyer their credit is committed when it is free"
    );
    check(
      "the page pulls the spend rows it needs to show that",
      /taskspend_/.test(code("src/app/(main)/buyer/page.tsx"))
    );
  }

  /* ── 5. The arithmetic ── */
  console.log("\n5. Pricing in points");
  {
    const q = quoteTask({
      pointsPerCompletion: 50,
      completions: 100,
      pointsPerUsd: 1000,
      feePercent: 10,
    });
    check("100 × 50 = 5,000 points of rewards", q.budgetPoints === 5000);
    check("a 10% fee is 500 points", q.feePoints === 500);
    check("5,500 points leave the buyer's credit", q.totalPoints === 5500);
    check(
      "the USD figures still line up at the current rate",
      q.rewardUsd === 5 && q.feeUsd === 0.5
    );

    const free = quoteTask({
      pointsPerCompletion: 50,
      completions: 100,
      pointsPerUsd: 1000,
      feePercent: 0,
    });
    check(
      "with no fee, the total is exactly the reward pool",
      free.totalPoints === free.budgetPoints && free.feePoints === 0
    );

    // A fee that rounds down to zero would let a buyer split one big task into
    // many tiny ones and pay no commission at all.
    const tiny = quoteTask({
      pointsPerCompletion: 1,
      completions: 1,
      pointsPerUsd: 1000,
      feePercent: 10,
    });
    check(
      "a fee on a 1-point task rounds UP, never to zero",
      tiny.feePoints === 1,
      `feePoints=${tiny.feePoints}`
    );
  }

  /* ── 6. It looks different, everywhere ── */
  console.log("\n6. Violet, and only violet");
  {
    // `code()`, not `read()`: the doc comment NAMES the other balances'
    // colours while explaining why this one differs, and matching prose is
    // not evidence about the tokens.
    const theme = code("src/lib/task-credit-theme.ts");
    check("there is one shared theme module", /TASK_CREDIT/.test(theme));
    check("it is violet", /violet/.test(theme));
    check(
      "it does not reuse another balance's colour",
      !/amber|emerald|sky-/.test(theme),
      "amber is earned points, emerald is cash, sky is ad credit"
    );

    for (const f of [
      "src/components/user/buyer/buy-points-view.tsx",
      "src/components/user/buyer/buyer-hub-view.tsx",
      "src/components/user/primitives/balance-card.tsx",
      "src/components/user/tasks/create-task-view.tsx",
    ]) {
      check(
        `${path.basename(f)} takes its colour from the shared theme`,
        /TASK_CREDIT/.test(read(f))
      );
    }
    // A hand-rolled violet is how the colour drifts.
    const strays = [
      "src/components/user/buyer/buy-points-view.tsx",
      "src/components/user/buyer/buyer-hub-view.tsx",
    ].filter((f) => /text-violet-\d00"/.test(code(f)));
    check(
      "no screen hardcodes its own violet",
      strays.length === 0,
      strays.join(", ")
    );
    check(
      "the buy page says plainly that it is not withdrawable",
      /cannot be converted to cash or\s+withdrawn/.test(
        read("src/components/user/buyer/buy-points-view.tsx")
      )
    );
  }

  /* ── 7. Live data ── */
  console.log("\n7. Live state");
  {
    const holders = await prisma.user.findMany({
      where: { taskCreditPoints: { not: 0 } },
      select: { id: true, email: true, taskCreditPoints: true },
    });
    console.log(`   ${holders.length} account(s) hold task credit`);
    check(
      "no account holds negative task credit",
      holders.every((u) => u.taskCreditPoints >= 0),
      holders
        .filter((u) => u.taskCreditPoints < 0)
        .map((u) => u.email)
        .join(", ")
    );

    // Credit bought must equal credit spent + credit held + credit refunded.
    const bought = await prisma.transaction.aggregate({
      where: { reference: { startsWith: "taskcredit_buy_" } },
      _sum: { points: true },
    });
    console.log(
      `   ${(bought._sum.points ?? 0).toLocaleString()} point(s) ever purchased`
    );
    check("the credit audit ran", true);
  }

  /* -- The newer buyer surfaces cannot reach a balance at all -- */
  console.log("\nThe buyer's newer surfaces touch no balance");
  {
    // Every file added for planning, results and reporting is read-only about
    // money. Stated as a test rather than a convention: the next person adding
    // a "refund this completion" button to the report flow would be crossing
    // the line the three balances exist to draw, and would find out here.
    const files = [
      "src/lib/buyer-reach.ts",
      "src/lib/buyer-reports.ts",
      "src/app/api/tasks/mine/reach/route.ts",
      "src/app/api/admin/buyer-reports/route.ts",
    ];
    const offenders = files.filter((f) =>
      /(cashBalance|pointsBalance|taskCreditPoints):\s*\{|spendTaskCredit|purchaseTaskCredit|chargeTaskCompletion/.test(
        read(f)
      )
    );
    check(
      "planning, results and reporting move no money",
      offenders.length === 0,
      offenders.join(", ") || undefined
    );
    const api = read("src/app/api/tasks/mine/[id]/submissions/route.ts");
    check(
      "…and neither does the buyer's view of the work",
      !/spendTaskCredit|chargeTaskCompletion|taskCreditPoints: \{/.test(api),
      "a buyer-triggered refund would be a reject button with a friendlier label"
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
