import fs from "fs";
import path from "path";
import { USER_PAGES, ALWAYS_VISIBLE_PATHS, pathMatches } from "../src/lib/page-visibility";
import { ADMIN_MODULES, CATEGORY_ORDER, CATEGORY_LABELS, moduleForPath } from "../src/lib/rbac";
import { API_MODULE_PREFIXES } from "../src/lib/admin-module-rules";

/**
 * Page registry guard — the owner's standing rule made mechanical:
 *
 *   (a) every USER page can be switched off (everyone / package / role / user)
 *       → it must sit under a USER_PAGES entry, or be on the always-visible
 *       safe list, or be a public page (marketing / auth / legal / publicRoutes);
 *   (b) every ADMIN page can be switched off (all admins / role / admin)
 *       → it must be owned by its own ADMIN_MODULES entry. A page that only
 *       falls under a parent module is allowed when it is a detail / create
 *       route (`[id]…`, `new`) or is listed in ADMIN_INHERITS below, with a
 *       reason. A new admin page nobody registered FAILS here.
 *
 * Plus: every module icon exists in the sidebar iconMap, every module category
 * is drawn on /admin/access, every API prefix behind a user page or admin page
 * exists (and the user ones actually call assertPageVisible), and no registry
 * entry points at a page that no longer exists.
 *
 * Run: npm run verify:registry
 *   (= npx tsx --tsconfig tsconfig.script.json scripts/verify-page-registry.ts)
 */

const root = process.cwd();
const APP = path.join(root, "src", "app");
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

// ── Explicit exemptions (keep the reason next to every entry) ────────────────

/**
 * Signed-in pages outside USER_PAGES / ALWAYS_VISIBLE / public routes that
 * deliberately have no visibility switch of their own.
 */
const USER_EXEMPT: Record<string, string> = {
  "/welcome":
    "first-run onboarding (username). The middleware sends a new account here until it is done — hiding it would loop the user.",
  "/cert-print/[serial]":
    "printable copy of an already-issued certificate, opened from /certificates; looked up by serial, nothing to earn or buy.",
  "/impersonate":
    "admin impersonation hand-off (one-time token from the admin panel), not a user feature.",
};

/**
 * Admin pages with a STATIC path below a module that do not get a module of
 * their own: they are tabs / tools of the parent page and are switched off
 * with it. Prefix match. Anything else under a module — except `[param]` and
 * `new` routes, which are always the parent's detail / create screens — must
 * be registered in ADMIN_MODULES.
 */
const ADMIN_INHERITS: Record<string, string> = {
  "/admin/no-access": "the refusal landing page itself — must always be reachable.",
  "/admin/courses/refunds": "Courses → refund queue (linked from /admin/courses).",
  "/admin/marketplace/brands": "Marketplace → brands manager (marketplace.manage, linked from /admin/marketplace).",
  "/admin/marketplace/studio": "Marketplace → Stock Studio listing maker (marketplace.manage, linked from /admin/marketplace).",
  "/admin/notifications/send": "Notifications → compose form.",
  "/admin/referrals/settings": "redirect stub → /admin/referrals?tab=commission.",
  "/admin/settings/feed-widgets": "redirect stub → /admin/settings/feed?tab=widgets.",
  "/admin/settings/social-earning": "redirect stub → /admin/settings/feed.",
  "/admin/tasks/removed": "Tasks → removed / archived list (linked from /admin/tasks).",
  "/admin/tutors/applications": "Tutors → application queue (same permission as the module).",
  "/admin/finance/company/print": "print views of Company books (entries, P&L, payslip, voucher, tax).",
};

// ── Route discovery ──────────────────────────────────────────────────────────

/** Every page.tsx under `dir`, as a URL path (route groups dropped). */
function pageRoutes(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith("_") || e.name.startsWith("@")) continue; // private / parallel slots
        walk(p);
      } else if (e.name === "page.tsx" || e.name === "page.ts") {
        const segs = path
          .relative(APP, path.dirname(p))
          .split(path.sep)
          .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
        out.push("/" + segs.join("/"));
      }
    }
  };
  walk(dir);
  return out.map((r) => (r === "/" ? "/" : r.replace(/\/$/, ""))).sort();
}

/** `publicRoutes` from the auth config (prefix-matched there). */
function authPublicRoutes(): string[] {
  const src = read("src/lib/auth/config.ts");
  const m = src.match(/const publicRoutes = \[([\s\S]*?)\];/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const PUBLIC_GROUPS = ["(marketing)", "(auth)", "(legal)"];
const SIGNED_IN_GROUPS = ["(main)", "(onboarding)", "tutor"];

const topDirs = fs.readdirSync(APP, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

console.log("\n=== Page registry ===\n");

// ── 1. User pages ────────────────────────────────────────────────────────────
console.log("1. Every signed-in user page has an off switch (or a reason it has none)");

const publicRoutes = authPublicRoutes();
check("publicRoutes parsed from src/lib/auth/config.ts", publicRoutes.length > 5, `got ${publicRoutes.length}`);
const isPublicRoute = (r: string) =>
  publicRoutes.some((p) => r === p || (p !== "/" && r.startsWith(`${p}/`)));

const inUserPages = (r: string) => USER_PAGES.some((p) => pathMatches(r, p.path));
const inSafeList = (r: string) => ALWAYS_VISIBLE_PATHS.some((p) => pathMatches(r, p));

const signedInRoutes = SIGNED_IN_GROUPS.filter((g) => topDirs.includes(g)).flatMap((g) => pageRoutes(path.join(APP, g)));
// Top-level folders that are not a known group, admin or api (e.g. /post, /offer, /appeal).
const otherRoutes = topDirs
  .filter((d) => ![...PUBLIC_GROUPS, ...SIGNED_IN_GROUPS, "admin", "api"].includes(d))
  .flatMap((d) => pageRoutes(path.join(APP, d)));

const userMisses: string[] = [];
for (const r of signedInRoutes) {
  if (inUserPages(r) || inSafeList(r) || USER_EXEMPT[r]) continue;
  userMisses.push(r);
}
for (const r of otherRoutes) {
  if (inUserPages(r) || inSafeList(r) || isPublicRoute(r) || USER_EXEMPT[r]) continue;
  userMisses.push(r);
}
check(
  `${signedInRoutes.length + otherRoutes.length} signed-in / top-level pages are registered, safe-listed, public or exempt`,
  userMisses.length === 0,
  `unregistered: ${userMisses.join(", ")}\n       → add to USER_PAGES (src/lib/page-visibility.ts) or, with a reason, to USER_EXEMPT here`
);

// Public catalog pages under (main) (/marketplace, /courses …) are open to
// guests, but a SIGNED-IN user must still be governed by visibility.
const catalogRoutes = signedInRoutes.filter((r) => /^\/(marketplace|courses)(\/|$)/.test(r));
check(
  "marketplace + course catalog pages are governed for signed-in users",
  catalogRoutes.every(inUserPages),
  catalogRoutes.filter((r) => !inUserPages(r)).join(", ")
);

const staleExempt = Object.keys(USER_EXEMPT).filter((r) => ![...signedInRoutes, ...otherRoutes].includes(r));
check("USER_EXEMPT names only pages that exist", staleExempt.length === 0, staleExempt.join(", "));

// Every USER_PAGES entry must still point at a page (or a page below it).
const allUserRoutes = [...signedInRoutes, ...otherRoutes];
const staleUserPages = USER_PAGES.filter((p) => !allUserRoutes.some((r) => pathMatches(r, p.path)));
check("every USER_PAGES entry still has a page", staleUserPages.length === 0, staleUserPages.map((p) => p.path).join(", "));

const dupUser = USER_PAGES.map((p) => p.path).filter((p, i, a) => a.indexOf(p) !== i);
check("USER_PAGES paths are unique", dupUser.length === 0, dupUser.join(", "));
check(
  "every USER_PAGES entry has a label and group (the /admin/visibility matrix groups by it)",
  USER_PAGES.every((p) => p.label.trim() && p.group.trim())
);
const safeInRegistry = USER_PAGES.filter((p) => inSafeList(p.path));
check("no safe-listed path is offered in the matrix", safeInRegistry.length === 0, safeInRegistry.map((p) => p.path).join(", "));

// ── 2. User-page API prefixes ────────────────────────────────────────────────
console.log("\n2. APIs behind user pages exist and are guarded");

function routeFilesUnder(urlPath: string): string[] {
  const dir = path.join(APP, ...urlPath.split("/").filter(Boolean));
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts" || e.name === "route.tsx") out.push(p);
    }
  };
  walk(dir);
  return out;
}

// Parsed from source: page-visibility-server imports prisma, and this script
// must run without a database.
const PAGE_API_PREFIXES: Record<string, string[]> = (() => {
  const src = read("src/lib/page-visibility-server.ts");
  const body = src.match(/export const PAGE_API_PREFIXES[^{]*\{([\s\S]*?)\r?\n\};/)?.[1] ?? "";
  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/^\s*"([^"]+)":\s*\[([^\]]*)\]/gm)) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return out;
})();
check("PAGE_API_PREFIXES parsed from page-visibility-server.ts", Object.keys(PAGE_API_PREFIXES).length > 10);

for (const [page, prefixes] of Object.entries(PAGE_API_PREFIXES)) {
  check(`PAGE_API_PREFIXES["${page}"] is a USER_PAGES entry`, USER_PAGES.some((p) => p.path === page));
  for (const raw of prefixes) {
    const prefix = raw.replace(/\s*\([A-Z, ]+\)\s*$/, "");
    const files = routeFilesUnder(prefix);
    if (files.length === 0) {
      check(`${page}: ${raw} exists`, false, `no route.ts at or under src/app${prefix}`);
      continue;
    }
    const guarded = files.some((f) => fs.readFileSync(f, "utf8").includes("assertPageVisible"));
    check(`${page}: ${raw} exists and calls assertPageVisible`, guarded, `none of ${files.length} route file(s) call it`);
  }
}

// ── 3. Admin pages ───────────────────────────────────────────────────────────
console.log("\n3. Every admin page is owned by an admin module");

const adminRoutes = pageRoutes(path.join(APP, "admin"));
const adminMisses: string[] = [];
const inheritsHit = new Set<string>();
for (const r of adminRoutes) {
  const mod = moduleForPath(r);
  if (mod && mod.href === r) continue; // the module's own page
  const inherit = Object.keys(ADMIN_INHERITS).find((p) => r === p || r.startsWith(`${p}/`));
  if (inherit) {
    inheritsHit.add(inherit);
    continue;
  }
  if (mod && mod.href !== "/admin") {
    const rest = r.slice(mod.href.length + 1).split("/")[0];
    if (rest.startsWith("[") || rest === "new") continue; // detail / create screen of the module
  }
  adminMisses.push(`${r} (falls to ${mod ? mod.href : "nothing"})`);
}
check(
  `${adminRoutes.length} admin pages are owned by a module, a module's detail/new route, or ADMIN_INHERITS`,
  adminMisses.length === 0,
  `unregistered: ${adminMisses.join(", ")}\n       → add an ADMIN_MODULES entry (src/lib/rbac.ts) or, with a reason, ADMIN_INHERITS here`
);
const staleInherits = Object.keys(ADMIN_INHERITS).filter((p) => !inheritsHit.has(p));
check("ADMIN_INHERITS names only pages that exist", staleInherits.length === 0, staleInherits.join(", "));

const staleModules = ADMIN_MODULES.filter((m) => !adminRoutes.includes(m.href));
check("every ADMIN_MODULES href has a page", staleModules.length === 0, staleModules.map((m) => m.href).join(", "));
const dupHref = ADMIN_MODULES.map((m) => m.href).filter((h, i, a) => a.indexOf(h) !== i);
check("ADMIN_MODULES hrefs are unique", dupHref.length === 0, dupHref.join(", "));
check("every module has at least one permission", ADMIN_MODULES.every((m) => m.permissions.length > 0));

// The /admin/access "Admin pages" tab and the sidebar draw modules by category.
const badCat = ADMIN_MODULES.filter((m) => !CATEGORY_ORDER.includes(m.category) || !CATEGORY_LABELS[m.category]);
check(
  "every module category is drawn (CATEGORY_ORDER + CATEGORY_LABELS) — so /admin/access lists it",
  badCat.length === 0,
  badCat.map((m) => `${m.href}:${m.category}`).join(", ")
);

// Sidebar icon map (parsed — the sidebar is a client component).
const sidebar = read("src/components/admin/sidebar.tsx");
const mapSrc = sidebar.match(/export const iconMap[^{]*\{([\s\S]*?)\r?\n\};/);
const iconKeys = new Set(
  (mapSrc ? mapSrc[1] : "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    .map((l) => l.match(/^([A-Za-z0-9_]+)\s*[:,]/)?.[1])
    .filter((k): k is string => !!k)
);
check("sidebar iconMap parsed", iconKeys.size > 10, `got ${iconKeys.size}`);
const missingIcons = ADMIN_MODULES.filter((m) => !iconKeys.has(m.icon));
check(
  "every module icon is in the sidebar iconMap",
  missingIcons.length === 0,
  missingIcons.map((m) => `${m.href} → ${m.icon}`).join(", ")
);

// ── 4. Admin API → module prefixes ───────────────────────────────────────────
console.log("\n4. Single-page admin APIs point at real APIs and real modules");
for (const [prefix, href] of Object.entries(API_MODULE_PREFIXES)) {
  check(
    `${prefix} → ${href}`,
    routeFilesUnder(prefix).length > 0 && ADMIN_MODULES.some((m) => m.href === href),
    routeFilesUnder(prefix).length === 0 ? `no route.ts under src/app${prefix}` : `no module ${href}`
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
