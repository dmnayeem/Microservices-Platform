import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/prisma";
import {
  CREATOR_TYPES,
  CREATOR_TYPE_VALUES,
} from "../src/lib/creator-application";
import { getBuyerSettings } from "../src/lib/buyer-settings";

/**
 * Becoming a task buyer — the road in, not the machinery behind it.
 *
 * The machinery was already built and correct: a TASK_BUYER application type
 * that deliberately grants less than AGENCY, an admin review that flips the
 * features, a buyer hub, per-buyer scope, and an admin settings block with a
 * platform fee, reward bounds, purchase limits and a KYC gate.
 *
 * And not one person had ever applied. Nor had a single task been funded by a
 * buyer. The reason was the road in:
 *
 *  - `/create-task`, the one page somebody who wants to pay for a job actually
 *    lands on, showed a lock with no way forward — alone among the gated
 *    pages, six of which already offered "Apply for access".
 *  - Everything leading to the application called itself selling: "Sell & earn
 *    as a creator", "Become a Creator", "creator/seller role". Someone who
 *    wants to PAY people had no reason to think that was their page.
 *
 * The check worth keeping is the first section: a page gated on a capability
 * somebody can apply for must say so. That is the defect that shipped, and it
 * is invisible to every other test because the page renders perfectly.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-buyer-onboarding.ts
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

/** Every page.tsx under (main), so the gate check cannot miss a new one. */
function mainPages(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name === "page.tsx") out.push(rel);
    }
  };
  walk("src/app/(main)");
  return out;
}

async function main() {
  console.log("\n=== Buyer onboarding ===\n");

  /* ── 1. A lock on an applicable capability offers the application ── */
  console.log("1. No gated page is a dead end");
  {
    // The features somebody can actually apply for. A lock on one of these is
    // a lock the reader can do something about; a lock on anything else (an
    // admin kill-switch, a plan-only perk) is not, and must not pretend to be.
    const applicable = new Set(
      CREATOR_TYPE_VALUES.map((t) => CREATOR_TYPES[t].gateFeature).filter(
        (f): f is NonNullable<typeof f> => !!f
      )
    );
    check(
      "buying is one of the things you can apply for",
      applicable.has("createTasks"),
      [...applicable].join(", ")
    );

    const offenders: string[] = [];
    for (const file of mainPages()) {
      const src = read(file);
      if (!src.includes("<FeatureLock")) continue;
      for (const feature of applicable) {
        // The guard shape used across these pages: refuse when the feature is
        // absent, render a lock.
        const guard = new RegExp(
          `!enabled\\.has\\("${feature}"\\)[\\s\\S]{0,240}?<FeatureLock([\\s\\S]{0,240}?)/>`,
        );
        const m = src.match(guard);
        if (!m) continue;
        if (!/applyHref=/.test(m[1])) offenders.push(`${file} (${feature})`);
      }
    }
    check(
      "every lock on an applicable capability links to the application",
      offenders.length === 0,
      offenders.join(", ")
    );

    // The one that shipped broken, named so a future edit cannot quietly undo
    // it and still pass the generic rule above.
    const createTask = read("src/app/(main)/create-task/page.tsx");
    check(
      "…including /create-task, where a buyer actually lands",
      /!enabled\.has\("createTasks"\)[\s\S]{0,300}applyHref="\/profile\/become-creator"/.test(
        createTask
      )
    );
    // …but the admin's off-switch on the same page must NOT offer it, because
    // applying cannot turn a master switch back on.
    check(
      "the admin's off-switch is not dressed up as something to apply for",
      /Buyer task creation is turned off[\s\S]{0,200}\/>/.test(createTask) &&
        !/turned off at the moment[\s\S]{0,200}applyHref/.test(createTask),
      "offering an application there sends the reader to wait for nothing"
    );
  }

  /* ── 2. The road in says what it leads to ── */
  console.log("\n2. Buying is named on the way in");
  {
    const hub = read(
      "src/app/(main)/profile/become-creator/_components/BecomeCreatorView.tsx"
    );
    const card = read("src/components/user/profile/profile-tab-body.tsx");
    check("the hub mentions buying tasks", /buy tasks/i.test(hub));
    check("the profile card does too", /buy tasks/i.test(card));
    check(
      "…and says plainly what that means",
      /pay people/i.test(card) || /paying people/i.test(hub),
      "\"buy tasks\" alone reads as buying something, not as hiring"
    );
    // The hub builds its cards from the type table, so a new role appears
    // without anyone editing the page. That is what must not regress.
    const hubPage = read("src/app/(main)/profile/become-creator/page.tsx");
    check(
      "the card list is derived from the type table, not hand-written",
      /CREATOR_TYPE_VALUES/.test(hubPage),
      "a hand-written list is how a role gets added and never shown"
    );
  }

  /* ── 3. What a buyer gets, and what they do not ── */
  console.log("\n3. The grant is the narrow one");
  {
    const meta = CREATOR_TYPES.TASK_BUYER;
    check("Task Buyer is still a type", !!meta);
    check(
      "it grants task creation and social tasks together",
      meta.grantFeatures.includes("createTasks") &&
        meta.grantFeatures.includes("socialTasks"),
      meta.grantFeatures.join(", ")
    );
    // The point of the type existing at all: AGENCY gives an agency console
    // and an ad builder, which is not what somebody buying 200 follows asked
    // for. If those creep in, the type has stopped being distinct.
    check(
      "…and nothing more",
      !meta.grantFeatures.includes("agencyMode") &&
        !meta.grantFeatures.includes("advertiser"),
      meta.grantFeatures.join(", ")
    );
    check("it lands on the create-task page", meta.dashboardHref === "/create-task");
  }

  /* ── 4. The admin still holds the controls ── */
  console.log("\n4. The admin's limits are real");
  {
    const s = await getBuyerSettings();
    // Read from the live settings rather than the defaults: a control the
    // owner has set to something must be the thing the buyer meets.
    console.log(
      `       live: enabled=${s.enabled} fee=${s.feePercent}% reward=${s.minPointsPerTask}-${s.maxPointsPerTask}pts ` +
        `maxCompletions=${s.maxCompletions} maxActive=${s.maxActiveTasks} kyc=${s.requireKyc} types=${s.allowedTaskTypes.length}`
    );
    check("a master switch exists", typeof s.enabled === "boolean");
    check(
      "the platform takes a fee on funding",
      typeof s.feePercent === "number" && s.feePercent >= 0,
      `${s.feePercent}%`
    );
    check(
      "reward bounds are a real range",
      s.maxPointsPerTask > s.minPointsPerTask,
      `${s.minPointsPerTask}-${s.maxPointsPerTask}`
    );
    check(
      "buyers are limited to admin-chosen task types",
      Array.isArray(s.allowedTaskTypes),
      s.allowedTaskTypes.join(", ") || "(none — buying is effectively off)"
    );
  }

  /* ── 5. Where the flow actually stands ── */
  console.log("\n5. Live state");
  {
    const apps = (await prisma.creatorApplication.groupBy({
      by: ["type", "status"],
      _count: { _all: true },
    })) as unknown as { type: string; status: string; _count: { _all: number } }[];
    const buyerApps = apps.filter((a) => a.type === "TASK_BUYER");
    const funded = await prisma.task.count({ where: { fundedByUserId: { not: null } } });
    console.log(
      `       buyer applications: ${
        buyerApps.map((a) => `${a.status}=${a._count._all}`).join(" ") || "none yet"
      }`
    );
    console.log(`       tasks funded by a buyer: ${funded}`);
    // Reported, not asserted. Zero is the state this change exists to end, and
    // a suite that failed on it would fail until a real person applies.
    check("the application table is readable", Array.isArray(apps));
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`  FAIL suite crashed — ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
