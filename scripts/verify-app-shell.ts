import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { USER_HOME } from "../src/lib/routes";

/**
 * App shell: the rail scrolls, and there is one definition of "home".
 *
 * Two failures this pins down, both of which look fine in code review:
 *
 *  - A `sticky` column with no `max-height` and no `overflow` has no scrollbar
 *    of its own, so anything past the fold is simply unreachable. Either half of
 *    the fix alone leaves it broken, which is why both are asserted.
 *  - `/social` and `/dashboard` were both used as "the user's home page" in
 *    different files. The middleware sent a non-admin hitting /admin to
 *    `/social` while the admin page's own guard sent the same person to
 *    `/dashboard` — two answers in one request path.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-app-shell.ts
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
/** Source with comments stripped, so prose can't satisfy a rule. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function main() {
  console.log("\n=== App shell ===\n");

  /* ── 1. The right rail ── */
  console.log("1. The social rail scrolls on its own");
  {
    const v = code("src/components/user/feed/social-feed-view.tsx");
    const rail =
      v.match(/<aside className="hidden xl:block[^"]*">\s*<div className="([^"]+)"/)?.[1] ?? "";
    check("the rail's sticky container was found", rail.length > 0, rail.slice(0, 60));

    check("it is still sticky", /(^|\s)sticky(\s|$)/.test(rail));
    // Both halves are required. A max-height with no overflow just clips; an
    // overflow with no height bound never triggers.
    check("it has a height bound", /max-h-\[/.test(rail), rail);
    check("it has its own scrollbar", /overflow-y-auto/.test(rail), rail);
    check(
      "the height bound accounts for the anchor ad bar",
      /--anchor-ad-h/.test(rail),
      rail
    );
    // Measured in Chrome: the rail holds ~2600px of widgets in a 666px window,
    // and `scrollbar-thin` renders 4px — which sat inside `pr-1`'s 4px of
    // padding and was invisible on a dark background. The column scrolled fine;
    // there was no way to tell that it could. The default 8px track is the
    // affordance, so neither the thin variant nor the padding that hid it may
    // come back.
    check(
      "the scrollbar is not the near-invisible thin variant",
      !/scrollbar-thin/.test(rail) && !/scrollbar-none/.test(rail),
      rail
    );
    check(
      "there is room for the 8px track beside the cards",
      /(^|\s)pr-2(\s|$)/.test(rail),
      rail
    );
    // A flick at the end of the rail should not carry on into the page behind.
    check("scrolling does not chain to the page", /overscroll-contain/.test(rail));

    // `self-start` on the aside would shrink it to its content, leaving `sticky`
    // nothing to travel inside — the classic silent way to break this.
    const aside = v.match(/<aside className="(hidden xl:block[^"]*)"/)?.[1] ?? "";
    check(
      "the aside is left to stretch, so sticky still has room to travel",
      aside.length > 0 && !/self-start/.test(aside),
      aside
    );

    // The column that was already right must stay right.
    check(
      "the left nav still scrolls independently",
      /flex-1 overflow-y-auto/.test(code("src/components/dashboard/sidebar.tsx"))
    );
  }

  /* ── 2. One home ── */
  console.log("\n2. One definition of home");
  {
    check("USER_HOME is /social", USER_HOME === "/social", USER_HOME);

    // The two places that already agreed, read from source — a change to either
    // without the constant fails here.
    check(
      "the sidebar's Home entry points at it",
      new RegExp(`\\{ name: "Home", href: "${USER_HOME}"`).test(
        code("src/components/dashboard/sidebar.tsx")
      )
    );
    check(
      "the login page falls back to it",
      new RegExp(`callbackUrl"\\) \\|\\| "${USER_HOME}"`).test(
        code("src/app/(auth)/login/page.tsx")
      )
    );
    check(
      "the auth middleware sends a non-admin there",
      new RegExp(`new URL\\("${USER_HOME}", nextUrl\\)`).test(
        code("src/lib/auth/config.ts")
      )
    );

    // The sites that used to disagree.
    const RETURN_SITES = [
      "src/components/admin/header.tsx",
      "src/components/admin/sidebar.tsx",
      "src/components/tutor/TutorShell.tsx",
      "src/app/admin/layout.tsx",
      "src/app/admin/page.tsx",
      "src/app/(auth)/register/page.tsx",
    ];
    const stale = RETURN_SITES.filter((f) =>
      /href="\/dashboard"|redirect\("\/dashboard"\)|callbackUrl: "\/dashboard"/.test(
        code(f)
      )
    );
    check(
      "no return-to-app site still hardcodes /dashboard",
      stale.length === 0,
      stale.join(", ")
    );
    const notUsingConstant = RETURN_SITES.filter(
      (f) => !/USER_HOME/.test(code(f))
    );
    check(
      "each of them uses the shared constant",
      notUsingConstant.length === 0,
      notUsingConstant.join(", ")
    );

    // The negative that matters. These buttons SAY "Dashboard", so their href
    // and label agree; a blanket rewrite would make them lie.
    const LABELLED_DASHBOARD = [
      "src/app/(main)/error.tsx",
      "src/app/(main)/not-found.tsx",
      "src/app/error.tsx",
      "src/app/not-found.tsx",
      "src/app/(main)/no-access/page.tsx",
      "src/app/(main)/article-tasks/complete/_components/ArticleTaskCompleteClient.tsx",
    ];
    const rewritten = LABELLED_DASHBOARD.filter(
      (f) => !/href="\/dashboard"/.test(code(f))
    );
    check(
      "the links labelled 'Dashboard' still point at /dashboard",
      rewritten.length === 0,
      rewritten.join(", ")
    );
    // And /dashboard is still a real destination, not orphaned.
    check(
      "the Dashboard nav entry still exists",
      /href: "\/dashboard"/.test(code("src/components/dashboard/sidebar.tsx")) &&
        fs.existsSync(path.join(root, "src/app/(main)/dashboard/page.tsx"))
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
