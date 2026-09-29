import fs from "fs";
import path from "path";
import {
  USER_PAGES,
  ALWAYS_VISIBLE_PATHS,
  computeHiddenPaths,
  parsePageRules,
  parsePageOverrides,
  isPathHidden,
  hiddenSources,
} from "../src/lib/page-visibility";

/**
 * Super-admin page visibility (user side, 2026-09-29): Everyone column,
 * every role, full page registry + safe list, server redirect, API refusals.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-page-visibility.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

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

console.log("\n=== Page visibility (user side) ===\n");

console.log("1. Rules + precedence");
check("old rules without `global` still parse", parsePageRules({ packages: {}, roles: {} }).global.length === 0);
const rules = parsePageRules({ global: ["/lottery", "/settings", "/nope"], packages: { free: ["/games"] }, roles: { USER: ["/chat"] } });
check("global keeps valid paths, drops unknown + safe-list ones", rules.global.join() === "/lottery");
check("Everyone hides for any user", computeHiddenPaths(rules, null, null).includes("/lottery"));
check(
  "everyone ∪ package ∪ role",
  ["/lottery", "/games", "/chat"].every((p) => computeHiddenPaths(rules, "free", "USER").includes(p))
);
check(
  "a per-user Show beats a global hide",
  !computeHiddenPaths(rules, "free", "USER", { "/lottery": true }).includes("/lottery")
);
check("a per-user Hide adds", computeHiddenPaths(rules, null, null, { "/wallet": false }).includes("/wallet"));
check(
  "sources name the layer",
  hiddenSources(rules, "free", "USER")["/lottery"]?.join() === "everyone" &&
    hiddenSources(rules, "free", "USER")["/games"]?.join() === "package"
);

console.log("\n2. Registry + safe list");
const paths = new Set(USER_PAGES.map((p) => p.path));
for (const p of ["/missions", "/affiliate", "/my-package", "/saved", "/custom-tasks", "/kyc", "/payment-methods", "/profile", "/groups", "/hashtag", "/u", "/course-creator", "/learn", "/certificates", "/tutor"]) {
  check(`registry has ${p}`, paths.has(p));
}
check("no safe-list page is in the registry", ALWAYS_VISIBLE_PATHS.every((s) => !paths.has(s)));
check("safe list can't be hidden by an override", Object.keys(parsePageOverrides({ "/settings": false, "/2fa-setup": false })).length === 0);
check("prefix match covers deep links", isPathHidden("/tutor/courses/new", ["/tutor"]));
check("segment match: /u does not hide /update-password", !isPathHidden("/update-password", ["/u"]));
check("safe list wins even if a hidden entry covers it", !isPathHidden("/settings", ["/settings"]));

console.log("\n3. Enforcement wiring");
const layout = read("src/app/(main)/layout.tsx");
check("(main) layout redirects a hidden page", /x-pathname/.test(layout) && /isPathHidden\(pathname, hiddenPaths\)/.test(layout) && /redirect\("\/no-access"\)/.test(layout));
check("…and skips when x-pathname is missing (next dev)", /if \(pathname && isPathHidden/.test(layout));
check("client guard kept", /<PageAccessGuard hiddenPaths=\{hiddenPaths\} \/>/.test(layout));
check("tutor layout enforces /tutor", /isPathHidden\("\/tutor"/.test(read("src/app/tutor/layout.tsx")));

const server = read("src/lib/page-visibility-server.ts");
check("API guard fails open", /catch \{\s*return null;/.test(server));
check("API guard answers 403 PAGE_HIDDEN", /code: "PAGE_HIDDEN"/.test(server) && /status: 403/.test(server));

// Every API prefix in the map has at least one route under it that refuses
// for that page — the map and the routes cannot drift apart silently.
const mapBody = server.slice(server.indexOf("PAGE_API_PREFIXES"), server.indexOf("};", server.indexOf("PAGE_API_PREFIXES")));
const entries = [...mapBody.matchAll(/"(\/[^"]+)":\s*\[([^\]]*)\]/g)];
function routeFiles(dir: string): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...routeFiles(rel));
    else if (e.name === "route.ts") out.push(rel);
  }
  return out;
}
for (const [, page, list] of entries) {
  for (const [, rawPrefix] of list.matchAll(/"([^"]+)"/g)) {
    const prefix = rawPrefix.replace(/\s*\(.*\)$/, "");
    const files = routeFiles(path.join("src/app", prefix));
    const guarded = files.some((f) => {
      const c = read(f);
      return c.includes(`assertPageVisible(`) && c.includes(`"${page}")`);
    });
    check(`${prefix} refuses when ${page} is hidden`, guarded);
  }
}
for (const f of ["src/app/api/tasks/[id]/start/route.ts", "src/app/api/tasks/[id]/submit/route.ts"]) {
  check(`${f.replace("src/app/api/", "")} refuses by task type`, /assertPageVisible\(session\.user\.id, taskTypePage\(task\.type\)\)/.test(read(f)));
}
for (const f of ["src/app/api/offerwall/[provider]/callback/route.ts", "src/app/api/cpa/postback/route.ts"]) {
  check(`${f.replace("src/app/api/", "")} (postback) is NOT guarded`, !read(f).includes("assertPageVisible"));
}

console.log("\n4. Entry points filtered");
check("earning hub", /hiddenPaths=\{hiddenPaths\}/.test(read("src/app/(main)/earn/page.tsx")) && /quickAccess = QUICK_ACCESS\.filter/.test(read("src/components/user/earn/earning-hub.tsx")));
check("tasks hub categories", /!isPathHidden\(cat\.href, hiddenPaths\)/.test(read("src/components/user/tasks/tasks-hub-view.tsx")));
check("dashboard shortcuts", /EXPLORE\.filter\(\(e\) => shows\(e\.href\)\)/.test(read("src/app/(main)/dashboard/page.tsx")));
check("header shortcuts", /shows\("\/wallet"\)/.test(read("src/components/dashboard/header.tsx")));

console.log("\n5. Hub");
const hub = read("src/app/admin/visibility/page.tsx");
check("roles come from RBAC, not a hard-coded list", /Object\.keys\(ROLE_PERMISSIONS\)/.test(hub));
check("four tabs", ["pages", "features", "categories", "user"].every((t) => hub.includes(`id: "${t}"`)));
check("matrix has an Everyone column", /label: "Everyone"/.test(read("src/components/admin/visibility/visibility-matrix.tsx")));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
