/**
 * The profile gate — reachable, complete in its coverage, and harmless while off.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-profile-gate.ts
 *
 * Deliberately does NOT switch the gate on: the setting is shared with the live
 * site, and on the day this was written every one of 126 users would have been
 * locked out the moment it flipped. So the rules are tested as functions, the
 * current (off) state is tested for real, and route coverage is checked in the
 * source — the failure that mattered was a route nobody gated.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "./_q";
import {
  calculateProfileCompletion,
  fullProfileProgress,
  isProfileComplete,
  PHONE_VERIFICATION_AVAILABLE,
} from "../src/lib/profile-completion";
import { getGateConfig, getProfileGateState, profileGateResponse, GATE_FEATURES } from "../src/lib/profile-gate-server";
import { clampGatePercent } from "../src/lib/profile-gate-features";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

const FULL = {
  avatar: "a.jpg",
  coverPhoto: "c.jpg",
  firstName: "A",
  lastName: "B",
  bio: "hello",
  gender: "MALE",
  dateOfBirth: new Date("1995-01-01"),
  nidNumber: "123",
  emailVerified: new Date(),
  phone: "+8801700000000",
  phoneVerified: null, // nobody can verify a phone here yet
  country: "BD",
  city: "Dhaka",
  street: "Road 1",
  postalCode: "1212",
  tags: ["x"],
  socialAccountsCount: 3,
};

async function main() {
  console.log("100% is reachable");
  check("phone verification is not counted while it cannot be done", !PHONE_VERIFICATION_AVAILABLE);
  const full = calculateProfileCompletion(FULL);
  check(
    "a profile with everything a user CAN fill reaches 100%",
    full.percentage === 100,
    `${full.percentage}% — missing: ${full.missing.map((m) => m.label).join(", ") || "none"}`
  );
  check("'Verified phone' is no longer listed as missing", !full.missing.some((m) => m.key === "phoneVerified"));
  const half = fullProfileProgress({ ...FULL, bio: "", city: "" });
  check("an incomplete profile is not 100%", !half.complete && half.percentage < 100, `${half.percentage}%`);
  check(
    "every missing item links somewhere real",
    half.missing.every((m) => m.href.startsWith("/profile") || m.href.startsWith("/verify-email")),
    half.missing.map((m) => m.href).join(" ")
  );
  check("essentials are a subset of full", isProfileComplete(FULL));

  console.log("\nThe admin's percentage bar (profile_gate.min_percent)");
  const atBar = fullProfileProgress({ ...FULL, bio: "", city: "" }, half.percentage);
  check("a profile AT the bar counts as complete", atBar.complete, `${half.percentage}% vs bar ${half.percentage}%`);
  const aboveBar = fullProfileProgress({ ...FULL, bio: "", city: "" }, Math.min(100, half.percentage + 1));
  check("one point short of the bar is still locked", !aboveBar.complete);
  check("the bar travels with the progress, for the lock screen", atBar.target === half.percentage);
  check("100% still means every item, not a rounded 100", !fullProfileProgress({ ...FULL, bio: "" }, 100).complete);
  check("the bar is clamped to 10–100", clampGatePercent(5) === 10 && clampGatePercent(250) === 100 && clampGatePercent("x") === 100);

  console.log("\nWhile the switch is off, nothing is locked");
  const cfg = await getGateConfig();
  check("the switch is off", !cfg.on, `on=${cfg.on}`);
  const user = await prisma.user.findFirst({ where: { role: "USER", status: "ACTIVE" }, select: { id: true } });
  if (user) {
    for (const f of GATE_FEATURES) {
      const st = await getProfileGateState(user.id, f.key);
      const res = await profileGateResponse(user.id, f.key);
      check(`${f.key}: open`, !st.locked && res === null);
    }
  }

  console.log("\nEvery route that lets a user earn asks the gate");
  const api = join(process.cwd(), "src", "app", "api");
  const routes: [string, string][] = [
    ["tasks/[id]/start/route.ts", "tasks"],
    ["article-tasks/[taskId]/start/route.ts", "tasks"],
    ["tasks/quiz/route.ts", "tasks"],
    ["tasks/boards/[id]/claim/route.ts", "tasks"],
    ["daily-mission/claim/route.ts", "missions"],
    ["missions/[id]/claim/route.ts", "missions"],
    ["quizzes/[id]/attempt/route.ts", "quizzes"],
    ["offerwall/offers/[id]/start/route.ts", "offerwalls"],
    ["withdrawals/route.ts", "withdrawals"],
    ["marketplace/listings/route.ts", "selling"],
  ];
  for (const [rel, feature] of routes) {
    const src = readFileSync(join(api, rel), "utf8");
    check(`${rel}`, src.includes(`profileGateResponse(session.user.id, "${feature}")`), feature);
  }

  // Any route that creates a task submission and is NOT in the list above is
  // a hole. Found by searching, so a new start route cannot quietly skip it.
  const { execSync } = await import("child_process");
  const writers = execSync(`git grep -l "taskSubmission.create" -- "src/app/api/*route.ts"`, { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes("/admin/"));
  const covered = new Set(routes.map(([r]) => `src/app/api/${r}`));
  const holes = writers.filter((w) => !covered.has(w));
  check("no route creates a submission without the gate", holes.length === 0, holes.join(", "));

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
