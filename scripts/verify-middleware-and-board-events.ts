import "dotenv/config";
import fs from "fs";
import path from "path";
import { NextRequest, type NextFetchEvent } from "next/server";
import middleware from "../middleware";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEffectivePermissions, pathAllowed } from "../src/lib/permissions";

/**
 * Two things that were quietly doing nothing.
 *
 * 1. `authorized()` in the auth config returned a pass-through response
 *    carrying `x-pathname` and a referral cookie. Auth.js reads that return
 *    value only as ALLOW / DENY / redirect and throws the response away — so
 *    the admin layout's central route guard read an empty pathname and never
 *    fired, and every `?ref=` code was lost before a Google signup could use
 *    it. Both moved to real middleware.
 *
 * 2. Event / quest progress counted every approved task inside a Task Board,
 *    so a five-task board ticked a "complete 3 tasks" goal on its own. The
 *    daily mission was fixed for this; the events system was not.
 *
 * The middleware is exercised by CALLING it, not by asking a running server —
 * the Turbopack dev server does not execute middleware at all, so a live probe
 * would prove nothing about the code.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-middleware-and-board-events.ts
 */

const url =
  (process.env.NODE_ENV !== "production" && process.env.DIRECT_DATABASE_URL) ||
  process.env.DATABASE_URL!;
const isAccelerate =
  url.startsWith("prisma://") || url.startsWith("prisma+postgres://");
const prisma = new PrismaClient(
  isAccelerate
    ? { accelerateUrl: url }
    : { adapter: new PrismaPg({ connectionString: url }) }
).$extends(withAccelerate());

const root = process.cwd();
const code = (p: string) =>
  fs
    .readFileSync(path.join(root, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

const hit = async (u: string) =>
  (await middleware(
    new NextRequest(new URL(u), { method: "GET" }),
    {} as NextFetchEvent
  )) as Response | undefined;

async function main() {
  console.log("\n=== Middleware · admin guard · board events ===\n");

  /* ── 1. The pass-through actually carries things now ── */
  console.log("1. The middleware response reaches the app");
  const reg = await hit("http://localhost:3000/register?ref=ABCD1234");
  check("an allowed request passes through", reg?.status === 200);
  check(
    "the pathname is forwarded to server components",
    reg?.headers.get("x-middleware-request-x-pathname") === "/register",
    `got ${reg?.headers.get("x-middleware-request-x-pathname")}`
  );
  check(
    "a ?ref= code is persisted as a cookie",
    (reg?.headers.get("set-cookie") ?? "").includes("eg_ref=ABCD1234"),
    "this is the only thing that survives the round trip through Google — without it every Google referral loses its attribution"
  );
  check(
    "…and that cookie is HttpOnly and lax, so it survives the OAuth redirect",
    /HttpOnly/i.test(reg?.headers.get("set-cookie") ?? "") &&
      /SameSite=lax/i.test(reg?.headers.get("set-cookie") ?? "")
  );
  const plain = await hit("http://localhost:3000/login");
  check(
    "a page with no ref sets no referral cookie",
    !(plain?.headers.get("set-cookie") ?? "").includes("eg_ref="),
    "…while still carrying whatever Auth.js set for itself"
  );
  check(
    "Auth.js's own cookies are not dropped on the way through",
    /authjs\./.test(plain?.headers.get("set-cookie") ?? ""),
    "rebuilding the response without copying these would log people out"
  );
  const junk = await hit("http://localhost:3000/register?ref=%3Cscript%3E");
  check(
    "a malformed ref is refused",
    !(junk?.headers.get("set-cookie") ?? "").includes("eg_ref=")
  );

  /* ── 2. The callback no longer pretends ── */
  console.log("\n2. The auth callback stopped building a discarded response");
  const cfg = code("src/lib/auth/config.ts");
  check(
    "`allow()` just allows",
    /const allow = \(\) => true;/.test(cfg)
  );
  check(
    "it no longer builds a response Auth.js will throw away",
    !/NextResponse\.next\(/.test(cfg)
  );
  check(
    "…and the referral cookie is not written there any more",
    !/res\.cookies\.set\(REFERRAL_COOKIE/.test(cfg)
  );
  const mw = code("middleware.ts");
  check(
    "middleware hands a redirect/deny straight back untouched",
    /if \(!isPassThrough\(authResult\)\) return authResult;/.test(mw),
    "wrapping a redirect in a pass-through would unblock protected routes"
  );

  /* ── 3. Switching the guard on locks nobody out ── */
  console.log("\n3. The admin guard, now that it is live");
  const layout = code("src/app/admin/layout.tsx");
  check(
    "the layout still guards on the pathname it now receives",
    /pathAllowed\(pathname, perms\)/.test(layout)
  );
  const superAdmin = (await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" as never },
    select: { id: true, email: true },
  })) as unknown as { id: string; email: string } | null;
  if (superAdmin) {
    const perms = await getEffectivePermissions(superAdmin.id);
    const routes = ["/admin", "/admin/users", "/admin/finance", "/admin/tasks",
      "/admin/quizzes", "/admin/settings", "/admin/no-access"];
    const blocked = routes.filter((r) => !pathAllowed(r, perms));
    check(
      "a super admin is blocked from nothing",
      blocked.length === 0,
      `blocked from ${blocked.join(", ")}`
    );
  }
  check(
    "/admin/no-access stays reachable, or the redirect would loop",
    /startsWith\("\/admin\/no-access"\)/.test(layout)
  );

  /* ── 4. Board tasks and events ── */
  console.log("\n4. A board counts once in events, its tasks never");
  const goals = code("src/lib/goal-progress.ts");
  check(
    "there is a board_claim action",
    /"board_claim"/.test(goals)
  );
  check(
    "a finished board satisfies a 'complete tasks' goal",
    /TASK_COMPLETE: \["task_approved", "quiz_approved", "board_claim"\]/.test(goals)
  );
  check(
    "it dedups on the board, so it can only ever count once",
    /return `board:\$\{targetId\}`/.test(goals)
  );
  const adminReview = code("src/app/api/admin/submissions/[id]/route.ts");
  check(
    "admin approval records nothing for a task inside a board",
    /if \(!isBoardTask\) \{[\s\S]{0,400}recordUserAction\(/.test(adminReview),
    "this was the one path that still counted the parts"
  );
  const claim = code("src/app/api/tasks/boards/[id]/claim/route.ts");
  check(
    "the claim route is what emits it",
    /action: "board_claim"/.test(claim) && /targetId: board\.id/.test(claim)
  );
  check(
    "…after the payout, not inside it",
    // The CALL, not the import — `indexOf("recordUserAction")` finds the import
    // line first, which sits above everything and made this look inverted.
    claim.indexOf("await recordUserAction(") > claim.indexOf("prisma.$transaction"),
    "progress must never be able to fail a reward that is already owed"
  );
  const submit = code("src/app/api/tasks/[id]/submit/route.ts");
  check(
    "the auto-approve path was already excluding board tasks",
    /shouldAutoApprove && !isBoardTask/.test(submit)
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
