/**
 * verify-submission-review — every decided submission is reachable, and the
 * number on a card is the number behind it.
 *
 * Two failures this guards, both found on live data:
 *
 *  1. The page listed only rows with `submittedAt` set. Several approval paths
 *     set a status and never stamp that column, so 54 decided submissions were
 *     invisible — including all 28 finished quizzes, which meant the QUIZ task
 *     type appeared to have no submissions at all.
 *
 *  2. The Approved card counted APPROVED + AUTO_APPROVED and linked to
 *     APPROVED. It said 95 and the list behind it showed 51.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-submission-review.ts
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

const page = read("src/app/admin/submissions/page.tsx");

console.log("\nverify-submission-review\n");

/* ══════════════════════════════════════════════════════════════════════════
   1. What the page can see
   ══════════════════════════════════════════════════════════════════════════ */
check(
  "visibility is 'submitted OR decided', not 'submitted'",
  /OR: \[\{ submittedAt: \{ not: null \} \}, \{ status: \{ not: "PENDING" \} \}\]/.test(
    page
  ),
  "a row that has been approved or rejected is not in progress, whatever that column says"
);
check(
  "in-progress work is still hidden",
  /status: \{ not: "PENDING" \}/.test(page),
  "the original rule existed because the Pending badge counted rows nobody had submitted"
);
check(
  "the rule is written once and reused",
  (page.match(/\.\.\.VISIBLE/g) ?? []).length >= 4,
  "a second copy is how a card and its list start disagreeing"
);
check(
  "the bare submittedAt filter is gone from the counts",
  !/submittedAt: \{ not: null \} \}\s*,?\s*\}\)/.test(
    page.split("const VISIBLE")[1] ?? ""
  )
);

/* ══════════════════════════════════════════════════════════════════════════
   2. A card promises what the list delivers
   ══════════════════════════════════════════════════════════════════════════ */
check(
  "the Approved card links to both kinds of approval",
  /status=APPROVED_ANY/.test(page),
  "it counted both and linked to one"
);
check(
  "that filter expands to the same pair the card counts",
  /APPROVED_ANY"\s*\?\s*\{ in: \["APPROVED", "AUTO_APPROVED"\] \}/.test(page)
);
check(
  "the active-state highlight follows the same value",
  /params\.status === "APPROVED_ANY"/.test(page)
);

/* ══════════════════════════════════════════════════════════════════════════
   3. Auto-approved is separable
   ══════════════════════════════════════════════════════════════════════════
   It is the majority of approvals here and the only kind nobody has looked
   at, so it is the one an admin wants to spot check. */
check("auto-approved has its own count", /autoApprovedCount/.test(page));
check(
  "…its own card",
  /status=AUTO_APPROVED/.test(page) && /Auto-approved/.test(page)
);
check(
  "…and the card says why it matters",
  /nobody reviewed these/.test(page)
);
check(
  "hand-approved is still separable from the pair",
  /<option value="APPROVED">Approved by hand<\/option>/.test(page)
);
check(
  "the dropdown offers every status the enum has",
  ["PENDING", "APPROVED_ANY", "APPROVED", "AUTO_APPROVED", "REJECTED", "REVISION_REQUESTED"].every(
    (v) => new RegExp(`value="${v}"`).test(page)
  )
);

/* ══════════════════════════════════════════════════════════════════════════
   4. The writer that caused it
   ══════════════════════════════════════════════════════════════════════════
   The display rule above covers any path that forgets, but a quiz that never
   records its submit moment also reads as "in progress" in the worker's own
   task list — so the source is fixed too. */
{
  const quiz = read("src/app/api/tasks/quiz/route.ts");
  const decided = quiz.match(/status: "(AUTO_APPROVED|REJECTED)"/g) ?? [];
  check(
    "the quiz route decides two ways",
    decided.length === 2,
    `found ${decided.length}`
  );
  check(
    "…and stamps the submit moment on both",
    (quiz.match(/submittedAt: new Date\(\)/g) ?? []).length >= 2,
    "28 finished quizzes were invisible because it stamped neither"
  );
}

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
