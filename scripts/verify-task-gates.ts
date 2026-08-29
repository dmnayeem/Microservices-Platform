import "dotenv/config";
import fs from "fs";
import path from "path";
import { taskCompletabilityError } from "../src/lib/task-completability";

/**
 * A task that cannot be finished must not be publishable, and a task whose
 * last slot is taken must not stay open.
 *
 * Both gates came out of the launch audit, which found them missing in
 * production: 8 ACTIVE video tasks paying 0 points and 0 XP, 11 ACTIVE article
 * tasks with no article to read, a video task with no video, and two tasks
 * sitting ACTIVE at 1/1 so every user who opened them was told "full" after
 * clicking through.
 *
 * The behaviour checks below run the real function; the wiring checks assert
 * that both routes actually call it, because a validator nothing calls is the
 * failure mode that produced this in the first place.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-task-gates.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(label: string, okay: boolean, detail?: string) {
  if (okay) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

console.log("\n=== Task gates ===\n");

/* ── 1. A task must pay something ── */
console.log("1. A task has to pay something");
check(
  "0 points and 0 XP is refused",
  !!taskCompletabilityError({ type: "CUSTOM", pointsReward: 0, xpReward: 0 })
);
check(
  "points alone is enough",
  taskCompletabilityError({ type: "CUSTOM", pointsReward: 10, xpReward: 0 }) === null
);
check(
  "XP alone is enough",
  taskCompletabilityError({ type: "CUSTOM", pointsReward: 0, xpReward: 5 }) === null
);
check(
  "a negative reward is refused",
  !!taskCompletabilityError({ type: "CUSTOM", pointsReward: -5, xpReward: 0 })
);
check(
  "a string reward from a form post is parsed, not coerced to NaN",
  taskCompletabilityError({ type: "CUSTOM", pointsReward: "25", xpReward: "0" }) === null
);

/* ── 2. Each type needs what its player reads ── */
console.log("\n2. Each type needs what its player actually reads");
check(
  "a VIDEO with no video anywhere is refused",
  !!taskCompletabilityError({ type: "VIDEO", pointsReward: 10 })
);
check(
  "…but videoConfig.videoUrl alone is enough (contentUrl is optional)",
  taskCompletabilityError({
    type: "VIDEO",
    pointsReward: 10,
    videoConfig: { videoUrl: "https://youtu.be/x" },
  }) === null
);
check(
  "…and contentUrl alone is enough (older tasks have no videoConfig)",
  taskCompletabilityError({
    type: "VIDEO",
    pointsReward: 10,
    contentUrl: "https://youtu.be/x",
  }) === null
);
check(
  "an ARTICLE with no article is refused",
  !!taskCompletabilityError({ type: "ARTICLE", pointsReward: 10 })
);
check(
  "…key-pool pages count as an article URL",
  taskCompletabilityError({
    type: "ARTICLE",
    pointsReward: 10,
    articleConfig: { useKeyPool: true, pages: [{ url: "https://example.com/a" }] },
  }) === null
);
check(
  "…and so do legacy links",
  taskCompletabilityError({
    type: "ARTICLE",
    pointsReward: 10,
    articleConfig: { links: [{ url: "https://example.com/a" }] },
  }) === null
);
// The quiz rule is conditional on purpose: an empty question list is fine
// while Gemini can generate one on demand, and fatal when it cannot.
check(
  "a QUIZ with no questions is refused when AI generation is unavailable",
  !!taskCompletabilityError(
    { type: "QUIZ", pointsReward: 10, questions: [] },
    { aiQuizAvailable: false }
  )
);
check(
  "…but allowed when AI generation can stand in",
  taskCompletabilityError(
    { type: "QUIZ", pointsReward: 10, questions: [] },
    { aiQuizAvailable: true }
  ) === null
);
check(
  "a QUIZ with stored questions never depends on AI",
  taskCompletabilityError(
    { type: "QUIZ", pointsReward: 10, questions: [{ q: 1 }] },
    { aiQuizAvailable: false }
  ) === null
);

/* ── 3. Both write paths call it ── */
console.log("\n3. Both write paths are gated");
const create = read("src/app/api/admin/tasks/route.ts");
const update = read("src/app/api/admin/tasks/[id]/route.ts");
check("the create route calls the gate", /taskCompletabilityError\(/.test(create));
check("the update route calls the gate", /taskCompletabilityError\(/.test(update));
check(
  "both refuse with a 400 rather than warning",
  /if \(completability\) \{[\s\S]{0,120}status: 400/.test(create) &&
    /if \(completability\) \{[\s\S]{0,120}status: 400/.test(update)
);
check(
  "both pass the real AI availability, not a hardcoded true",
  /aiQuizAvailable: isGeminiConfigured\(\)/.test(create) &&
    /aiQuizAvailable: isGeminiConfigured\(\)/.test(update)
);
check(
  "the create route checks the SERVER-side points, not the client's",
  // SOCIAL rewrites pointsReward from the bundle; checking the raw body value
  // would validate a number the task will not actually be saved with.
  /pointsReward: pointsRewardOut/.test(create)
);

/* ── 4. A full task closes ── */
console.log("\n4. A task closes when its last slot is taken");
const slots = read("src/lib/task-slots.ts");
check(
  "the close is a no-op unless the task is full",
  /task\.completedCount < task\.totalLimit/.test(slots)
);
check(
  "it is safe to call twice",
  /where: \{ taskId, status: "ACTIVE" \}|updateMany\(\{\s*where: \{ id: taskId, status: "ACTIVE" \}/.test(
    slots
  )
);
// Comments stripped first: the doc block above the function says the word
// "throw" while explaining why it must not, which is exactly the sort of thing
// a naive text search reads as a violation.
const slotsCode = slots
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
check(
  "it can never fail the payout that preceded it",
  /catch \{/.test(slotsCode) && !/throw/.test(slotsCode)
);

const submit = read("src/app/api/tasks/[id]/submit/route.ts");
const adminReview = read("src/app/api/admin/submissions/[id]/route.ts");
const quiz = read("src/app/api/tasks/quiz/route.ts");
// Every path that increments the counter has to be the one that closes it —
// this is exactly the kind of thing that gets wired on one path and forgotten
// on the other two.
check(
  "the auto-approve path closes the task",
  (submit.match(/closeTaskIfFull\(/g) ?? []).length >= 2
);
check("the admin approval path closes the task", /closeTaskIfFull\(/.test(adminReview));
check("the inline quiz payout closes the task", /closeTaskIfFull\(/.test(quiz));
check(
  "no increment site is left without it",
  ["src/app/api/tasks/[id]/submit/route.ts",
   "src/app/api/admin/submissions/[id]/route.ts",
   "src/app/api/tasks/quiz/route.ts"].every((f) =>
    /completedCount: \{ increment: 1 \}/.test(read(f))
      ? /closeTaskIfFull\(/.test(read(f))
      : true
  )
);
check(
  "the close happens OUTSIDE the payout transaction",
  // Inside it, a housekeeping failure would roll back a reward that is already
  // owed. `tx.` is the transaction client; the call must not use it.
  !/tx\.[\s\S]{0,40}closeTaskIfFull/.test(submit) &&
    !/await tx\.\s*closeTaskIfFull/.test(adminReview)
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
