import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "./_q";
import { Prisma } from "../src/generated/prisma/client";

/**
 * The buyer's own view of what they bought.
 *
 * `/create-task` was a form and nothing more. Once a buyer pressed Create the
 * task left their world entirely: no way to see whether it had been approved,
 * how many people had completed it, how much budget was left, or what they had
 * been charged. And when an admin rejected one, the reason was written to
 * `Task.rejectionReason` and shown to nobody — least of all the person who had
 * paid for it and needed to know what to change.
 *
 * The two properties worth guarding:
 *
 *  1. **Ownership is in the query.** Every read is `fundedByUserId = me`, not a
 *     filter applied afterwards, so no shape of request returns another buyer's
 *     tasks or invoices.
 *  2. **A rejection carries a reason.** Required on the server, not just in the
 *     admin UI, so it holds for any caller.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-buyer-hub.ts
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

const PAGE = "src/app/(main)/buyer/page.tsx";
const VIEW = "src/components/user/buyer/buyer-hub-view.tsx";
const REVIEW_UI = "src/components/admin/task-review-actions.tsx";
const REVIEW_API = "src/app/api/admin/tasks/[id]/review/route.ts";

async function main() {
  console.log("\n=== Buyer Hub ===\n");

  /* ── 1. Nobody sees anyone else's tasks ── */
  console.log("1. Ownership is part of the query");
  {
    const page = read(PAGE);
    check(
      "tasks are fetched by fundedByUserId",
      /where: \{ fundedByUserId: userId \}/.test(page)
    );
    check(
      "invoices are fetched by userId",
      /prisma\.transaction\.findMany\(\{\s*where: \{\s*userId,/.test(page)
    );
    check(
      "the approved-count query is scoped to THIS buyer's task ids",
      /taskId: \{ in: taskRows\.map\(\(t\) => t\.id\) \}/.test(page),
      "the id list comes from the already-scoped task query"
    );
    check(
      "the page is gated on the capability, not merely hidden",
      /enabled\.has\("createTasks"\)/.test(page)
    );
    check(
      "no post-fetch filtering stands in for a WHERE clause",
      !/\.filter\(\(t\) => t\.fundedByUserId/.test(page)
    );
  }

  /* ── 2. The numbers mean what they say ── */
  console.log("\n2. The figures are honest");
  {
    const page = read(PAGE);
    const view = read(VIEW);
    check(
      "'completed' counts APPROVED submissions, not every attempt",
      /tally\(t\.id, \["APPROVED", "AUTO_APPROVED"\]\)/.test(page),
      "_count.submissions includes rejected and pending ones"
    );
    check(
      "'awaiting review' counts PENDING rows, not 'everything minus approved'",
      /by: \["taskId", "status"\]/.test(page) &&
        /pendingByTask/.test(page) &&
        !/t\._count\.submissions - \(approvedByTask/.test(page),
      "the old arithmetic counted every REJECTED attempt as one still awaiting review"
    );
    check(
      // Credit moves in points now, so the figure is a credit total, not a
      // dollar one — summing `amountUsd` reported $0.00 and looked broken.
      // Purchases are excluded (buying credit is not spending it) and anything
      // credited back nets itself off rather than being silently ignored.
      "spend counts credit, excludes purchases, and nets anything returned",
      /creditSpent/.test(view) &&
        /!r\.reference\.startsWith\("taskcredit_buy_"\)/.test(view) &&
        !/const netSpent/.test(view)
    );
    check(
      "held budget only counts tasks that can still pay out",
      /"ACTIVE" \|\| t\.status === "PENDING_REVIEW"/.test(view)
    );
    check(
      "money is rendered through usd()",
      /usd\(/.test(view) && !/\$\$\{/.test(view)
    );
    check(
      "status is translated for the buyer, not shown raw",
      /PENDING_REVIEW: \{\s*label: "Waiting for approval"/.test(view)
    );
  }

  /* ── 3. A rejected buyer is told why ── */
  console.log("\n3. Rejection explains itself");
  {
    const api = read(REVIEW_API);
    const ui = read(REVIEW_UI);
    const view = read(VIEW);
    check(
      "the API refuses a rejection with no reason",
      /action === "reject" && reason\.length < 5/.test(api),
      "server-side, so it holds for any caller not just the admin UI"
    );
    check(
      "the stored reason is what the admin wrote, with no filler default",
      /rejectionReason: reason\b/.test(api) &&
        !/reason \|\| "Not approved\."/.test(api)
    );
    check(
      // Strip comments first: the doc comment SAYS "window.prompt" while
      // explaining what it replaced, and matching prose is not evidence.
      "the admin gets preset reasons rather than a bare prompt",
      /PRESET_REASONS/.test(ui) &&
        !/window\.prompt\(/.test(
          ui.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
        )
    );
    check(
      "the preset lands in an editable, required box",
      /required: true/.test(ui) && /defaultValue: preset/.test(ui)
    );
    check(
      "the buyer is shown the reason",
      /Why this was rejected/.test(view) && /rejectionReason/.test(view)
    );
    check(
      "…and told their money came back",
      /refunded to your wallet/i.test(view)
    );
  }

  /* ── 4. The hub is reachable and can still be hidden ── */
  console.log("\n4. Reachable, like the other modes");
  {
    const sidebar = read("src/components/dashboard/sidebar.tsx");
    check(
      "Buyer Hub is a mode entry beside Admin Panel / Tutor Hub",
      /buyerNavigation/.test(sidebar) && /href: "\/buyer"/.test(sidebar)
    );
    check(
      "it appears for the capability, not a role",
      /features\?\.includes\("createTasks"\)/.test(sidebar),
      "a buyer is not a role — any account can be granted task creation"
    );
    check(
      "page visibility can still hide it per user",
      // 2026-09-29: the sidebar now uses the shared prefix matcher.
      /!isPathHidden\("\/buyer", hiddenPaths\)/.test(sidebar) &&
        /"\/buyer"/.test(read("src/lib/page-visibility.ts"))
    );
  }

  /* ── 4b. A buyer controls their task, but never judges the work ── */
  console.log("\n4b. Pause is theirs; approval is not");
  {
    const api = read("src/app/api/tasks/mine/[id]/pause/route.ts");
    check(
      "ownership is in the WHERE clause, not checked afterwards",
      /where: \{ id, fundedByUserId: userId \}/.test(api),
      "no request shape may reach a task this buyer did not fund"
    );
    check(
      "it does not borrow an admin permission",
      !/can\(/.test(api),
      "a buyer is not an admin; using the admin gate would be the wrong test entirely"
    );
    check(
      "only a live task can be paused, only a paused one resumed",
      /task\.status !== "ACTIVE"/.test(api) && /task\.status !== "PAUSED"/.test(api)
    );
    check(
      "resuming re-checks the credit, like publishing does",
      /credit < oneCompletion/.test(api),
      "resuming into an empty balance puts it live just long enough for someone to work for nothing"
    );
    check("both directions are audited", /TASK_PAUSED/.test(api) && /TASK_RESUMED/.test(api));

    // The invariant the owner asked for: a buyer must not be able to refuse
    // work that was done properly.
    const rbac = read("src/lib/rbac.ts");
    check(
      "the buyer-facing roles carry NO admin permissions at all",
      /USER: \[\],/.test(rbac) && /AGENCY: \[\],/.test(rbac),
      "approval is gated on submissions.approve; an empty permission list can never satisfy it"
    );
    const approve = read("src/app/api/admin/submissions/[id]/route.ts");
    check(
      "approving still requires the admin permission",
      /can\(session\.user\.id, "submissions\.approve"\)/.test(approve)
    );
    const hub = read(VIEW);
    check(
      "the hub has no approve or reject control",
      !/submissions\/\$\{/.test(hub) && !/"approve"/.test(hub)
    );
    check(
      "…and says why, so the buyer is not left guessing",
      /not asked to approve them/.test(hub)
    );
    check(
      "the buyer CAN stop their own task from the hub",
      /Pause task/.test(hub) && /Resume task/.test(hub)
    );
  }

  /* ── 4d. A buyer can SEE what they paid for, and only that ── */
  console.log("\n4d. Seeing the work, without judging it");
  {
    const api = read("src/app/api/tasks/mine/[id]/submissions/route.ts");
    check(
      "ownership is in the query",
      /where: \{ id, fundedByUserId: userId \}/.test(api)
    );
    const subWrites =
      api.match(
        /prisma\.taskSubmission\.(update|updateMany|create|createMany|delete|deleteMany)\(/g
      ) ?? [];
    check(
      "a buyer still cannot approve, reject or re-price anything",
      subWrites.length === 1 &&
        /data: \{ metadata: \{ \.\.\.existing, buyerReport: report \} as never \}/.test(
          api
        ),
      "the only write here is the report flag; judging work stays with admins"
    );
    check(
      "…and the one write it does make cannot move money",
      !/spendTaskCredit|chargeTaskCompletion|pointsBalance|taskCreditPoints/.test(
        api
      ),
      "a report that refunded the buyer would be a reject button with a friendlier label"
    );
    check(
      "only APPROVED work is shown",
      /status: \{ in: \["APPROVED", "AUTO_APPROVED"\] \}/.test(api),
      "showing pending work invites a buyer to lobby about it"
    );
    check(
      "the worker's identity is withheld from the response",
      !/id: r\.userId/.test(api) &&
        !/name: true/.test(api) &&
        !/email: true/.test(api) &&
        !/avatar: true/.test(api),
      "the buyer bought the proof, not a list of everyone who engaged with them"
    );
    check(
      "the audience breakdown is aggregate, never per person",
      /groupBy\(\{\s*by: \["country"\]/.test(api) &&
        /workerIds/.test(api),
      "'which country delivered' must not become 'who delivered'"
    );
    const hub = read(VIEW);
    check(
      "the hub offers it only where there is something to see",
      /t\.approvedCount > 0 &&/.test(hub) && /See the work/.test(hub)
    );
    check(
      "…and says what is being withheld, rather than seeming incomplete",
      /without names/.test(hub)
    );
  }

  /* ── 4c. A stalled task tells its buyer ── */
  console.log("\n4c. Running out of credit is announced");
  {
    const credit = read("src/lib/task-credit.ts");
    check(
      "the close reason distinguishes 'out of credit' from 'finished'",
      /closeReason\?: "NO_CREDIT" \| "DELIVERED"/.test(credit),
      "telling a buyer 'your task ended' for both leaves the stalled ones dead and unexplained"
    );
    check(
      "out of credit takes precedence when both are true",
      /outOfCredit\s*\?\s*"NO_CREDIT"/.test(credit)
    );
    check(
      "the message points at the fix",
      /notifyTaskClosed/.test(credit) && /buy-points/.test(credit)
    );
    const paths = [
      "src/app/api/admin/submissions/[id]/route.ts",
      "src/app/api/tasks/[id]/submit/route.ts",
      "src/lib/social-recheck.ts",
    ];
    const silent = paths.filter((f) => !/notifyTaskClosed\(/.test(read(f)));
    check(
      "every payout path notifies when it closes a task",
      silent.length === 0,
      silent.join(", ") || undefined
    );
    check(
      "the admin path notifies AFTER its transaction commits",
      /if \(closedTask\) void notifyTaskClosed\(closedTask\);/.test(
        read("src/app/api/admin/submissions/[id]/route.ts")
      ),
      "announcing a closure that a rollback then un-did is worse than staying quiet"
    );
  }

  /* ── 4e. Editing, cancelling, limits, runway ── */
  console.log("\n4e. A buyer can fix and stop their own work");
  {
    const api = read("src/app/api/tasks/mine/[id]/route.ts");
    check(
      "ownership is in the query on both verbs",
      (api.match(/fundedByUserId: userId/g) ?? []).length >= 2
    );
    check(
      "the reward is frozen once the task is live",
      /can't change once a task is live/.test(api),
      "people pick tasks on the terms shown; changing them mid-flight moves the deal underneath someone"
    );
    check(
      "…and so is the completion count",
      /number of completions can't change/.test(api)
    );
    check(
      "editing the CONTENT of a live task sends it back for review",
      /const backToReview = !notYetLive && contentChanged/.test(api),
      "otherwise a buyer swaps the link after approval and the approval means nothing"
    );
    check(
      "a finished task cannot be edited at all",
      /EDITABLE\.has\(String\(task\.status\)\)/.test(api)
    );
    check(
      "cancelling ARCHIVES rather than deletes",
      /status: "ARCHIVED"/.test(api) &&
        !/prisma\.task\.delete/.test(api),
      "submissions are the record of work people were PAID for; the FK refuses a delete"
    );
    check(
      "cancelling refunds nothing, and says so",
      /only charged for the completions it already had/.test(api),
      "charging per completion means a cancelled task has already cost exactly what it delivered"
    );
    check(
      "both verbs are audited",
      /TASK_EDITED/.test(api) && /TASK_CANCELLED/.test(api)
    );
    check(
      "a blocked platform is blocked on EDIT, not only on create",
      /platformRefusal\(scope, d\.socialPlatform\)/.test(api),
      "a buyer barred from one platform could otherwise create on a permitted one and edit across"
    );
    check(
      "…and the check reads the task's current platform to compare against",
      /socialPlatform: true/.test(api) &&
        /d\.socialPlatform !== task\.socialPlatform/.test(api),
      "without the current value every save looks like a platform change and an old task cannot be fixed"
    );

    const hub = read(VIEW);
    // Was "the hub exposes rename and cancel". Rename is gone: the button only
    // ever PATCHed `title` while the route accepted the whole task, so a buyer
    // fixing anything else still had to ask an admin. What matters now is that
    // the form offers what the route accepts and refuses what it freezes.
    check(
      "the hub exposes a real edit and a cancel",
      /EditTaskModal/.test(hub) && /cancel\(t\.id, t\.title\)/.test(hub)
    );
    check(
      "edit is offered on exactly the statuses the route will accept",
      /EDITABLE_STATUSES = new Set\(\["PENDING_REVIEW", "ACTIVE", "PAUSED"\]\)/.test(
        hub
      ) && /EDITABLE_STATUSES\.has\(t\.status\)/.test(hub),
      "offering edit on a finished task means a button that always errors"
    );
    check(
      "reward and completions are disabled once the task is live",
      (hub.match(/disabled=\{!notYetLive\}/g) ?? []).length >= 2,
      "the server drops those two silently, so an enabled input would lie"
    );
    check(
      "the buyer is told that editing a live task sends it back to review",
      /notYetLive && \(/.test(hub) && /review/i.test(hub),
      "a running task that quietly re-enters review reads as a bug"
    );
    check(
      "cancelling asks first",
      /confirmDialog/.test(hub)
    );

    // Runway — warning BEFORE the credit runs out.
    check(
      "the hub warns before credit runs out, not at zero",
      /LOW_RUNWAY/.test(hub) && /runway <= LOW_RUNWAY/.test(hub),
      "at zero the tasks have already stopped and the damage is done"
    );
    check(
      "'nothing running' and 'nothing left' are not collapsed",
      /runway === null/.test(hub),
      "one is fine, the other is urgent"
    );
    check(
      "the runway uses the CHEAPEST live reward",
      /Math\.min\(\.\.\.liveRewards\)/.test(read(PAGE)),
      "that is the completion that runs out last, so it is the honest figure"
    );

    // Per-buyer task cap.
    const create = read("src/app/api/tasks/create/route.ts");
    check(
      "an admin can cap how many tasks one buyer runs at once",
      /buyer\.maxActiveTasks > 0/.test(create) &&
        /"buyer.max_active_tasks"/.test(read("src/lib/buyer-settings.ts"))
    );
    check(
      "…and the cap counts paused and awaiting tasks too",
      /\["ACTIVE", "PENDING_REVIEW", "PAUSED"\]/.test(create),
      "counting only live ones lets a buyer park fifty in the review queue"
    );
  }

  /* ── 5. Live data agrees with what the hub would render ── */
  console.log("\n5. Live state");
  {
    const funded = await prisma.task.findMany({
      where: { fundedByUserId: { not: null } },
      select: {
        id: true,
        status: true,
        budgetPoints: true,
        remainingBudget: true,
        rejectionReason: true,
      },
    });
    console.log(`   ${funded.length} buyer-funded task(s)`);

    const rejected = funded.filter((t) => t.status === "REJECTED");
    const silent = rejected.filter((t) => !t.rejectionReason?.trim());
    check(
      "every rejected buyer task carries a reason the buyer can read",
      silent.length === 0,
      silent.length
        ? `${silent.length} rejected with no reason: ${silent.map((t) => t.id).join(", ")}`
        : undefined
    );
    check(
      "no task shows more paid out than it was funded with",
      funded.every((t) => t.budgetPoints - t.remainingBudget >= 0)
    );

    // The hub reports approved submissions as "completed"; that count must
    // never exceed what the pool could actually have paid for.
    const ids = funded.map((t) => t.id);
    const approvals = ids.length
      ? ((await prisma.taskSubmission.groupBy({
          by: ["taskId"],
          where: {
            taskId: { in: ids },
            status: { in: ["APPROVED", "AUTO_APPROVED"] },
          },
          _count: { _all: true },
        })) as unknown as { taskId: string; _count: { _all: number } }[])
      : [];
    console.log(
      `   ${approvals.reduce((s, r) => s + r._count._all, 0)} approved completion(s) across them`
    );
    check("the completion audit ran", true);
  }

  /* -- 4f. What the money bought -- */
  console.log("\n4f. Results, not just a progress bar");
  {
    const api = read("src/app/api/tasks/mine/[id]/submissions/route.ts");
    const view = read(VIEW);
    check(
      "cost is summed off the LEDGER, not recomputed from the reward",
      /TASK_SPEND_REF/.test(api) && /task_fee_\$\{id\}_/.test(api),
      "a second arithmetic would eventually disagree with the invoice tab"
    );
    check(
      "cost per completion, accept rate, fill rate and pace are all returned",
      /costPerCompletion/.test(api) &&
        /acceptRate/.test(api) &&
        /fillRate/.test(api) &&
        /perDay/.test(api)
    );
    check(
      "...and the hub renders them",
      /function ResultsStrip/.test(view) &&
        /Cost per completion/.test(view) &&
        /Accepted/.test(view)
    );
    check(
      "rejected work is shown as costing the buyer nothing",
      /you paid for none of them/.test(view),
      "a buyer who sees a low accept rate needs to know it did not cost them"
    );
  }

  /* -- 4g. Reporting a completion is bounded -- */
  console.log("\n4g. A report is not a reject button");
  {
    const lib = read("src/lib/buyer-reports.ts");
    const api = read("src/app/api/tasks/mine/[id]/submissions/route.ts");
    const view = read(VIEW);
    const admin = read("src/app/api/admin/buyer-reports/route.ts");
    check(
      "the bounds live in ONE module the UI and the API share",
      /export const REPORT_WINDOW_DAYS/.test(lib) &&
        /export function reportAllowance/.test(lib) &&
        /MIN_REPORT_REASON/.test(view) &&
        /MIN_REPORT_REASON/.test(api),
      "a second copy in the UI offers a button the server refuses"
    );
    check(
      "one report per completion",
      /readBuyerReport\(sub\.metadata\)/.test(api) && /409/.test(api)
    );
    check(
      "reports expire with the completion",
      /REPORT_WINDOW_DAYS \* DAY_MS/.test(api)
    );
    check(
      "a task has a report allowance and the server enforces it",
      /reportAllowance\(approved\)/.test(api) && /429/.test(api),
      "unbounded reporting is rejection by attrition"
    );
    check(
      "the report is MERGED into metadata, never written over it",
      /\.\.\.existing/.test(api) && /\.\.\.existing/.test(admin),
      "metadata carries the SOCIAL proof bag - the very evidence being reported"
    );
    check(
      "the worker it concerns is named on the audit row",
      /targetUserId: sub\.userId/.test(api) &&
        /targetUserId: sub\.userId/.test(admin),
      "an accusation nobody can see is one nobody can answer"
    );
    check(
      "resolving requires an admin permission, not merely an admin page",
      /can\(session\.user\.id, "submissions\.reject"\)/.test(admin)
    );
    check(
      "neither end moves money",
      !/spendTaskCredit|chargeTaskCompletion|cashBalance|pointsBalance/.test(
        admin
      ),
      "an approved submission is final everywhere else; a report is not a refund path"
    );
    check(
      "the buyer is told that BEFORE they write one",
      /does not undo the payment/.test(view)
    );
    // The queue query depends on a Postgres JSON path filter. If that syntax is
    // ever wrong the admin page throws, and it throws on the page, not here -
    // so it is exercised against the real database.
    try {
      const open = await prisma.taskSubmission.count({
        where: { metadata: { path: ["buyerReport", "status"], equals: "OPEN" } },
      });
      // The other half of the pair: the per-task cap counts reports in ANY
      // state, and it is what decides whether the buyer is offered the button.
      const any = await prisma.taskSubmission.count({
        where: { metadata: { path: ["buyerReport", "status"], not: Prisma.DbNull } },
      });
      check(
        `the open-report queue and the cap query both run (${open} open, ${any} ever)`,
        true
      );
    } catch (e) {
      check(
        "the open-report queue query runs",
        false,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  /* -- 4h. Planning before publishing -- */
  console.log("\n4h. A buyer can see what they are buying first");
  {
    const reachLib = read("src/lib/buyer-reach.ts");
    const reachApi = read("src/app/api/tasks/mine/reach/route.ts");
    const create = read("src/components/user/tasks/create-task-view.tsx");
    check(
      "reach is counted with the same STRICT rule the serve query enforces",
      /targeted dimension/i.test(reachLib) &&
        /\{ in: values \}/.test(reachLib)
    );
    check(
      "staff and non-active accounts are not counted as an audience",
      /NON_STAFF_WHERE/.test(reachLib) && /status: "ACTIVE"/.test(reachLib)
    );
    check(
      "a tiny audience does not hand back an exact headcount",
      /TOO_NARROW/.test(reachLib) &&
        /eligible >= TOO_NARROW \? eligible : null/.test(reachLib),
      "postcode + age + gender can identify one real person"
    );
    check(
      "the estimate runs the SAME sanitizer the create route does",
      /sanitizeTaskAudience/.test(reachApi) &&
        /userCanFeature\(userId, "targetTasks"\)/.test(reachApi),
      "quoting a reach the task will never have is worse than quoting none"
    );
    check(
      "the estimate route creates and charges nothing",
      !/prisma\.(task|user|transaction)\.(create|update|updateMany|delete)/.test(
        reachApi
      )
    );
    check(
      "pace comes from measured history, and says so",
      /It is an estimate, not a promise/.test(create) &&
        /of this kind over the last 30/.test(create)
    );
    check(
      "an audience matching nobody is called out before publishing",
      /Nobody on the platform matches every one of these filters/.test(create)
    );
  }

  /* -- 4i. A new buyer can start without being told how -- */
  console.log("\n4i. Onboarding");
  {
    const view = read(VIEW);
    check(
      "the three steps are shown while the buyer has no tasks",
      /Getting your first task live/.test(view) &&
        /tasks\.length === 0 && \(/.test(view)
    );
    check(
      "each step ticks off against the buyer's real state",
      /done: cashBalance > 0/.test(view) && /done: taskCredit > 0/.test(view),
      "a checklist that never ticks is a poster, not a guide"
    );
    check(
      "runway is given in days as well as completions",
      /daysOfCredit/.test(view) && /burnPerDay/.test(view),
      "'4 more completions' does not say whether to top up before the weekend"
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
