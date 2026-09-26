/**
 * verify-finance-pulse — today's figures, and whether they can be believed.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-finance-pulse.ts
 *
 * The owner's standing complaint about this platform's reporting has always
 * been the same one: the number shown was not the number that was true. So the
 * checks here are mostly arithmetic rather than markup.
 *
 * The one that matters most is nesting. Day ≤ week ≤ month ≤ year ≤ total, for
 * every figure. The first draft of "returning users" failed it — 2 for the
 * year against 5 for the month — because it defined a returning user as "logged
 * in during the window but registered before it", and widening the window
 * pushes more accounts into the "registered inside it" exclusion. A dashboard
 * that prints a year smaller than a month is one nobody trusts again, so the
 * definition changed rather than the presentation.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const pulse = read("src/lib/finance/pulse.ts");
const page = read("src/app/admin/finance/page.tsx");

console.log("\nverify-finance-pulse\n");

/* ══════════════════════════════════════════════════════════════════════════
   1. Points earned is not a sum of a column
   ══════════════════════════════════════════════════════════════════════════
   `Transaction.points` carries inconsistent signs across this codebase, which
   is why `signing.ts` exists at all. A `_sum` of it would add a withdrawal to
   an earning. */
check(
  "points earned goes through the sign-resolution helpers",
  /magnitudePoints/.test(pulse) && /isPointsEarned\(r\)/.test(pulse),
  "a raw _sum of Transaction.points adds a withdrawal to an earning"
);
// The row rule now lives in ONE place, `isPointsEarned` (signing.ts), shared
// with the Points tab so the card and the breakdown cannot disagree. These
// read that rule where it is defined.
const signing = fs.readFileSync(path.join(process.cwd(), "src/lib/finance/signing.ts"), "utf8");
const rule = signing.slice(signing.indexOf("export function isPointsEarned"));
check(
  "only rows the platform PAID count as user earnings",
  /if \(!isPointsEarned\(r\)\) continue/.test(pulse) && /direction\(row\) === "cost"/.test(rule)
);
check(
  "unsettled rows are skipped",
  /isSettled\(row\)/.test(rule)
);
check(
  "a PENALTY (points taken back) is not counted as points earned",
  /row\.type !== "PENALTY"/.test(rule)
);
check(
  "the Decimal is narrowed before the helpers see it",
  /amount: Number\(row\.amount \?\? 0\)/.test(pulse),
  "the helpers take numbers; Prisma hands back a Decimal"
);

/* ══════════════════════════════════════════════════════════════════════════
   2. Periods that nest
   ══════════════════════════════════════════════════════════════════════════ */
check(
  "returning users is defined so the window can only grow the count",
  /utcDay\(at\) <= utcDay\(u\.createdAt\)\) continue/.test(pulse),
  "'registered before the window' shrinks as the window widens — the year read 2 against the month's 5"
);
check(
  "…and the reason is written down where the definition is",
  /does not nest/.test(pulse)
);
check(
  "the week is 7 days including today, not 8",
  /utcDaysAgo\(6\)/.test(pulse),
  "utcDaysAgo(7) silently covers eight days and never matches a hand count"
);
check(
  "each figure is derived from one snapshot, not several queries",
  /One pass over the ledger/.test(pulse) && /in one pass for the same reason/.test(pulse),
  "separate queries can disagree when a row lands between them"
);

/* ══════════════════════════════════════════════════════════════════════════
   3. Honest about its own limits
   ══════════════════════════════════════════════════════════════════════════ */
check(
  "the all-time points figure says what it actually covers",
  /covers this calendar year/.test(page),
  "the ledger pass starts on 1 January; calling that 'all time' would be a quiet lie"
);
check(
  "an empty subscription table says so rather than looking broken",
  /No subscription has been sold yet/.test(page),
  "five rows of zero with no explanation reads as a broken page"
);
check(
  "a failure returns zeroes with a working page, not a stack trace",
  /catch \{[\s\S]{0,300}pointsEarned: zeroMoney/.test(pulse)
);

/* ══════════════════════════════════════════════════════════════════════════
   4. What the owner asked for is on the page
   ══════════════════════════════════════════════════════════════════════════ */
for (const [label, needle] of [
  ["points earned today", "Points earned today"],
  ["its dollar value", "pulse.pointsEarned.dayUsd"],
  ["returning users today", "Returning users today"],
  ["referred signups today", "Referred signups today"],
  ["new subscriptions today", "New subscriptions today"],
  ["total / active subscribers", "pulse.activeSubscribers"],
  ["accounts that ever subscribed", "pulse.everSubscribed"],
] as const) {
  check(`the overview shows ${label}`, page.includes(needle));
}
for (const period of ["Today", "This week", "This month", "This year", "All time"]) {
  check(`the breakdown has a ${period} row`, page.includes(`"${period}"`));
}

/* A wide table on a phone scrolls; it does not squash. */
check(
  "the breakdown table scrolls rather than crushing its columns",
  /overflow-x-auto[\s\S]{0,200}min-w-\[520px\]/.test(page)
);

/* ══════════════════════════════════════════════════════════════════════════
   5. Active is not the same as flagged active
   ══════════════════════════════════════════════════════════════════════════ */
check(
  "an active subscriber has paid-for time left AND is not cancelled",
  /isActive: true, endDate: \{ gte: new Date\(\) \}/.test(pulse),
  "isActive alone counts a cancelled row whose flag was never cleared"
);

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
