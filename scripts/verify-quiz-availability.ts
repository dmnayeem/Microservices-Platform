import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  quizPeriodKey,
  quizPeriodStart,
  describeQuizRepeat,
} from "../src/lib/quiz-period";

/**
 * Quiz availability: how often it comes back, how many people may play it, and
 * when it opens and closes.
 *
 * The dangerous half of this is the repeat cadence, because it moves the reward
 * key. `ONCE` MUST keep producing the original
 * `quiz_reward_<userId>_<quizId>` — a quiz that has already paid someone must
 * never be claimable again, and the unique (userId, reference) index is the only
 * thing standing between that and a points printer. Every other check here is
 * ordinary wiring; that one is money.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-quiz-availability.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

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

console.log("\n=== Quiz availability ===\n");

const TZ = "Asia/Dhaka";
const noon = new Date("2026-08-30T06:00:00.000Z"); // midday in Dhaka (UTC+6)

/* ── 1. ONCE is untouched ── */
console.log("1. ONCE keeps paying exactly once, forever");
check(
  "a one-shot quiz has no period key, so its reward reference is unchanged",
  quizPeriodKey("ONCE", TZ, noon) === ""
);
check(
  "…and no period start, so every past attempt still counts against the limit",
  quizPeriodStart("ONCE", TZ, noon) === null
);
const attempt = code("src/app/api/quizzes/[id]/attempt/route.ts");
check(
  "the reward key only gains a period when there IS one",
  /periodKey\s*\?\s*`quiz_reward_\$\{userId\}_\$\{id\}_\$\{periodKey\}`\s*:\s*`quiz_reward_\$\{userId\}_\$\{id\}`/.test(
    attempt
  ),
  "an unconditional suffix would let every already-paid quiz be claimed a second time"
);

/* ── 2. Periods move ── */
console.log("\n2. A repeating quiz actually resets");
check(
  "the daily key is the user's local day",
  quizPeriodKey("DAILY", TZ, noon) === "2026-08-30"
);
check(
  "…and rolls over at local midnight, not UTC midnight",
  // 20:00 UTC on the 30th is 02:00 on the 31st in Dhaka — a UTC-based key would
  // still say the 30th and the quiz would not come back until 6am local.
  quizPeriodKey("DAILY", TZ, new Date("2026-08-30T20:00:00.000Z")) === "2026-08-31"
);
check(
  "the monthly key is year-month",
  quizPeriodKey("MONTHLY", TZ, noon) === "2026-08"
);
check(
  "the weekly key is an ISO week",
  /^\d{4}-W\d{2}$/.test(quizPeriodKey("WEEKLY", TZ, noon))
);
check(
  "two days in the same ISO week share a key",
  quizPeriodKey("WEEKLY", TZ, new Date("2026-08-31T06:00:00.000Z")) ===
    quizPeriodKey("WEEKLY", TZ, new Date("2026-09-02T06:00:00.000Z"))
);
const dayStart = quizPeriodStart("DAILY", TZ, noon);
check(
  "the daily window starts at the user's local midnight",
  !!dayStart && dayStart.toISOString() === "2026-08-29T18:00:00.000Z",
  `got ${dayStart?.toISOString()}`
);
const monthStart = quizPeriodStart("MONTHLY", TZ, noon);
check(
  "the monthly window starts on the 1st, local",
  !!monthStart && monthStart.toISOString() === "2026-07-31T18:00:00.000Z",
  `got ${monthStart?.toISOString()}`
);

/* ── 3. The attempt route enforces all of it ── */
console.log("\n3. The attempt route enforces it");
check(
  "attempts are counted inside the current period",
  /periodStart \? \{ startedAt: \{ gte: periodStart \} \} : \{\}/.test(attempt)
);
check(
  "…which is what makes 'already passed' a per-period question too",
  /const everPassed = prior\.some/.test(attempt) &&
    /prior = await prisma\.quizAttempt\.findMany/.test(attempt)
);
check("the opening time is enforced", /quiz\.startsAt && now < quiz\.startsAt/.test(attempt));
check("the closing time is enforced", /quiz\.expiresAt && now > quiz\.expiresAt/.test(attempt));
check(
  "the participant cap is enforced before the attempt is recorded",
  /quizParticipantCount\(/.test(attempt) && /This quiz is full/.test(attempt)
);
check(
  "…and someone already inside the cap is not locked out by it",
  /alreadyIn === 0/.test(attempt),
  "without this, a capped quiz would refuse the second attempt of someone who already started it"
);

/* ── 4. The cap counts people, not attempts ── */
console.log("\n4. The cap counts people, not attempts");
const slots = code("src/lib/quiz-slots.ts");
check(
  "participants are counted DISTINCT by user",
  /distinct: \["userId"\]/.test(slots),
  "counting attempts would let one person with three tries eat three places"
);
check(
  "only completed attempts count towards it",
  /completedAt: \{ not: null \}/.test(slots)
);
check(
  "a full quiz is archived so it leaves every list",
  /status: "ARCHIVED"/.test(slots) && /where: \{ id: quizId, status: "PUBLISHED" \}/.test(slots)
);
check(
  "closing can never fail the attempt that preceded it",
  /catch \{/.test(slots) && !/throw/.test(slots)
);
check("the route closes the quiz after an attempt", /closeQuizIfFull\(/.test(attempt));

/* ── 5. Visibility ── */
console.log("\n5. Users only see what they can play");
const vis = code("src/lib/task-visibility.ts");
const quizClause = vis.slice(vis.indexOf("export function publishedQuizWhere"));
check(
  "the list hides a quiz outside its window",
  /startsAt: null/.test(quizClause) && /expiresAt: null/.test(quizClause)
);
check(
  "the plan gate and the window are ANDed, not merged into one OR",
  /AND: \[/.test(quizClause),
  "sharing one OR would make a scheduling window widen the access-level check and expose plan-gated quizzes"
);

/* ── 6. Admin can set it ── */
console.log("\n6. The admin form can actually set it");
const createApi = code("src/app/api/admin/quizzes/route.ts");
const updateApi = code("src/app/api/admin/quizzes/[id]/route.ts");
const form = code("src/components/admin/quizzes/quiz-form.tsx");
for (const [name, src] of [
  ["create", createApi],
  ["update", updateApi],
] as const) {
  check(
    `the ${name} API accepts repeat, cap and window`,
    /repeat: z\.enum/.test(src) &&
      /maxParticipants: z/.test(src) &&
      /startsAt: z\.string\(\)\.datetime\(\)/.test(src)
  );
  check(
    `the ${name} API treats a 0 cap as no cap`,
    /data\.maxParticipants && data\.maxParticipants > 0/.test(src)
  );
}
check(
  "the form has a control for each one",
  // Whitespace-tolerant: a prettier-wrapped call puts the field name on its
  // own line, and an assertion that only matches the one-line form would go red
  // on a reformat with nothing actually broken.
  ["repeat", "maxParticipants", "startsAt", "expiresAt"].every((f) =>
    new RegExp(`setMetaField\\(\\s*"${f}"`).test(form)
  )
);
check(
  "the form sends UTC, not the browser's wall clock",
  /startsAt: fromLocalInput\(meta\.startsAt\)/.test(form)
);
check(
  "the edit page loads the saved values back in",
  /repeat: quiz\.repeat/.test(code("src/app/admin/quizzes/[id]/edit/page.tsx"))
);
check(
  "the admin is told what the cadence actually means",
  /describeQuizRepeat/.test(form)
);

/* ── 7. The sentence shown to humans ── */
console.log("\n7. The explanation reads correctly");
check(
  "ONCE says the reward is paid once",
  /once/i.test(describeQuizRepeat("ONCE", 3))
);
check(
  "DAILY says it comes back and can be earned again",
  /every day/i.test(describeQuizRepeat("DAILY", 3)) &&
    /again/i.test(describeQuizRepeat("DAILY", 3))
);
check("one attempt is 'try', not 'tries'", /1 try\b/.test(describeQuizRepeat("DAILY", 1)));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
