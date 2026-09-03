import "dotenv/config";
import fs from "fs";
import path from "path";
import { FEATURE_TO_COLUMN, FEATURES, FEATURE_KEYS } from "../src/lib/features";
import { USER_PAGES, computeHiddenPaths, parsePageOverrides } from "../src/lib/page-visibility";

/**
 * The owner's five: admin accountability, referral origin, donation gating,
 * per-user visibility, and the task-type back button.
 *
 * The through-line for the first four is the same failure: a control or a
 * record that LOOKS present and is empty. An audit row with no target user, a
 * referrer that is fetched and then not rendered, a donation composer with no
 * gate behind it, a per-user layer in the resolver that nothing writes. So the
 * assertions here are mostly "and it is actually wired to something".
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-admin-oversight.ts
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
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

console.log("\n=== Admin oversight, referrals, donations, per-user visibility ===\n");

/* ────────────────────────────────────────────────────────────────
   1. Every admin action that touches a person is attributable
   ──────────────────────────────────────────────────────────────── */
console.log("1. Admin actions name the person they happened to");

const approve = code("src/app/api/admin/users/[id]/approve/route.ts");
check(
  "activating an account is recorded at all",
  /writeAudit\(/.test(approve) && /USER_ACTIVATED/.test(approve),
  "this wrote nothing: the account turned ACTIVE with no record of who did it"
);
check(
  "…naming the account and its previous status",
  /targetUserId: id/.test(approve) && /previousStatus: user\.status/.test(approve)
);

const bulk = code("src/app/api/admin/users/bulk/route.ts");
check(
  "a bulk action writes one row PER USER, not one for the batch",
  /writeAuditMany\(/.test(bulk) && /targetIds\.map\(\(uid\) => \(\{/.test(bulk),
  "the single batch row named nobody, so a bulk ban left no trace on any account it banned"
);
check(
  "each bulk row carries the affected user",
  /targetUserId: uid/.test(bulk)
);
check(
  "bulk uses the same action codes as the single-user path",
  /USER_BANNED/.test(bulk) &&
    /BALANCE_ADD_POINTS/.test(bulk) &&
    !/BULK_\$\{action/.test(bulk),
  'filtering the feed by "who was banned" has to catch both routes, not just one'
);
check(
  "a bulk points change says how many points",
  /"Gave" : "Deducted"/.test(bulk) && /Math\.abs\(points \?\? 0\)/.test(bulk)
);

const audit = code("src/lib/audit.ts");
check(
  "the batch writer is one round trip, not one insert per user",
  /createMany\(/.test(audit),
  "500 sequential inserts inside a request is not a fix, it is a timeout"
);
check(
  "the batch writer is fail-safe like the single writer",
  /export async function writeAuditMany[\s\S]{0,1800}catch \(e\)/.test(audit),
  "an audit failure must never undo work that already happened"
);

// Routes that move money or change what a person can do. Each must name the
// person — a row that says only "SUBSCRIPTION_APPROVED" is not oversight.
const TARGETED: [string, string][] = [
  ["src/app/api/admin/users/[id]/impersonate/route.ts", "targetUserId: targetUser.id"],
  ["src/app/api/admin/users/[id]/display-boost/route.ts", "targetUserId: id"],
  ["src/app/api/admin/users/route.ts", "targetUserId: user.id"],
  ["src/app/api/admin/kyc/[id]/route.ts", "targetUserId: doc.userId"],
  ["src/app/api/admin/users/kyc/appeals/[id]/route.ts", "targetUserId: appeal.userId"],
  ["src/app/api/admin/creators/applications/[id]/route.ts", "targetUserId: app.userId"],
  ["src/app/api/admin/subscriptions/[id]/route.ts", "targetUserId: subscription.userId"],
  ["src/app/api/admin/courses/refunds/[id]/route.ts", "targetUserId: request.userId"],
  ["src/app/api/admin/offerwall-callbacks/[id]/route.ts", "targetUserId: callback.userId"],
];
for (const [file, needle] of TARGETED) {
  check(
    `${file.replace("src/app/api/admin/", "")} names the affected user`,
    code(file).includes(needle),
    "User Activity pivots on targetUserId — without it the action is invisible on that account"
  );
}

const disputes = code("src/app/api/admin/disputes/[id]/route.ts");
check(
  "resolving a marketplace dispute is audited",
  /writeAudit\(/.test(disputes) && /DISPUTE_RESOLVED_/.test(disputes),
  "this moves cash between two real accounts and recorded nothing"
);
check(
  "…and the summary says who was paid what",
  /refunded \$\{usd\(refundAmount\)\}/.test(disputes) &&
    /clawed back/.test(disputes),
  '"resolved" alone does not say who ended up with the money'
);

const deals = code("src/app/api/admin/marketplace/deals/[id]/route.ts");
check(
  "releasing/refunding escrow is audited",
  /writeAudit\(/.test(deals) && /MARKETPLACE_DEAL_/.test(deals)
);
check(
  "escrow audit points at whoever received the money",
  /v\.data\.action === "release" \? deal\?\.sellerId/.test(deals),
  "release pays the seller, refund pays the buyer — the row should name the one who got paid"
);
check(
  "a rejected escrow action is not audited as if it happened",
  deals.indexOf("if (!result.ok)") < deals.indexOf("writeAudit("),
  "the audit write sits after the failure return"
);

const timeline = code("src/lib/user-activity.ts");
check(
  "the per-user timeline also finds rows written before targetUserId was filled in",
  /targetUserId: null, entity: "User", entityId: userId/.test(timeline),
  "otherwise this user's history appears to begin the day the writers were fixed"
);

const adminActivity = code("src/app/admin/admin-activity/page.tsx");
check(
  "the feed renders the summary and the target",
  /l\.summary \|\| "—"/.test(adminActivity) &&
    /l\.targetUserId \?\? \(l\.entity === "User" \? l\.entityId : null\)/.test(adminActivity)
);

/* ────────────────────────────────────────────────────────────────
   2. Where an account came from
   ──────────────────────────────────────────────────────────────── */
console.log("\n2. Who referred whom");

const usersPage = code("src/app/admin/users/page.tsx");
check(
  "the users list fetches the referrer",
  /referredBy: \{ select: \{ id: true, name: true, username: true \} \}/.test(usersPage)
);
const usersTable = code("src/components/admin/users-table-client.tsx");
check(
  "…and shows it as a column",
  /Referred by<\/th>/.test(usersTable) && /u\.referredBy \?/.test(usersTable),
  'the list could filter on "has referrals" but never showed the upstream side'
);
check(
  "a direct signup reads as Direct, not as blank",
  /Direct<\/span>/.test(usersTable),
  "an empty cell is indistinguishable from missing data"
);
check(
  "the referrer is reachable in one click",
  /href=\{`\/admin\/users\/\$\{u\.referredBy\.id\}`\}/.test(usersTable)
);
check(
  "the mobile card carries it too",
  /via\{" "\}/.test(usersTable),
  "admins do this from a phone; a desktop-only column is half a feature"
);

const userDetail = code("src/app/admin/users/[id]/page.tsx");
check(
  "the detail page prints the referrer's NAME",
  /user\.referredBy\.name \|\| user\.referredBy\.username/.test(userDetail),
  'it fetched the name and rendered "View referrer" — one click per user just to find out who'
);
check(
  "…and says so explicitly when there is no referrer",
  /signed up directly/i.test(userDetail),
  "the block used to vanish entirely, which looks the same as not knowing"
);

const referralsPage = code("src/app/admin/referrals/page.tsx");
check(
  "the referrals page answers the reverse direction",
  /Recent Referred Signups/.test(referralsPage) &&
    /referredById: \{ not: null \}/.test(referralsPage),
  "it only ranked top referrers — 'this account, where did it come from?' was unanswerable here"
);
check(
  "newest first, since that is when the question gets asked",
  /orderBy: \{ createdAt: "desc" \}[\s\S]{0,120}take: 25/.test(referralsPage)
);

/* ────────────────────────────────────────────────────────────────
   3. Donations are granted, not assumed
   ──────────────────────────────────────────────────────────────── */
console.log("\n3. Donation posts are admin-granted");

check(
  "there is a donations feature key backed by a column",
  FEATURE_TO_COLUMN.donations === "donationsEnabled" &&
    FEATURE_KEYS.includes("donations")
);
check(
  "it appears in the admin catalogue as a creator capability",
  FEATURES.some((f) => f.key === "donations" && f.group === "creator"),
  "the per-user override grid is driven by this list — not being in it means not being grantable"
);

const schema = read("prisma/schema.prisma");
check(
  "the column defaults to OFF",
  /donationsEnabled\s+Boolean @default\(false\)/.test(schema),
  "nobody should keep a money-collecting capability they were never deliberately given"
);
const migration = read(
  "prisma/migrations/20260903100000_package_donations_enabled/migration.sql"
);
check(
  "the migration is idempotent",
  /ADD COLUMN IF NOT EXISTS "donationsEnabled"/.test(migration)
);

const feedApi = code("src/app/api/feed/route.ts");
check(
  "the SERVER refuses a donation post without the grant",
  /userCanFeature\(session\.user\.id, "donations"\)/.test(feedApi),
  "the composer tab is not what a scripted request goes through"
);
check(
  "…checked on donationGoal, which is what actually opens the collection",
  /typeof donationGoal === "number" && donationGoal > 0 && !isPrivileged/.test(feedApi)
);
check(
  "admins/staff are not blocked by it",
  /!isPrivileged/.test(feedApi)
);

const composer = code("src/components/user/feed/create-post-composer.tsx");
check(
  "the composer hides the tab rather than showing it disabled",
  /\.\.\.\(canDonate$/m.test(composer) || /\.\.\.\(canDonate\s*\?/.test(composer),
  "a greyed-out tab invites a support ticket for something most accounts never get"
);
const socialPage = code("src/app/(main)/social/page.tsx");
check(
  "the grant is resolved server-side and passed down",
  /effectiveFeatures\.enabled\.has\("donations"\)/.test(socialPage)
);

const pkgForm = code("src/app/admin/packages/_components/PackageForm.tsx");
check(
  "a plan can grant it",
  /donationsEnabled/.test(pkgForm)
);
for (const f of [
  "src/app/api/admin/packages/route.ts",
  "src/app/api/admin/packages/[id]/route.ts",
]) {
  check(
    `${f.replace("src/app/api/admin/", "")} accepts the field`,
    /donationsEnabled: z\.boolean\(\)\.optional\(\)/.test(code(f)),
    "a form field the API silently drops is worse than no field"
  );
}

/* ────────────────────────────────────────────────────────────────
   4. Visibility for one named person
   ──────────────────────────────────────────────────────────────── */
console.log("\n4. Page + function visibility per user");

// The resolver already supported this layer; the gap was that nothing sensible
// wrote it. These pin the resolver's contract so the new UI cannot drift.
check(
  "a per-user override beats the role rule that hides a page",
  computeHiddenPaths({ packages: {}, roles: { USER: ["/wallet"] } }, null, "USER", {
    "/wallet": true,
  }).includes("/wallet") === false,
  "force-show has to win, or the per-user tab cannot open anything"
);
check(
  "…and can hide a page the role leaves visible",
  computeHiddenPaths({ packages: {}, roles: {} }, null, "USER", {
    "/wallet": false,
  }).includes("/wallet")
);
check(
  "no override means the inherited answer is untouched",
  computeHiddenPaths({ packages: {}, roles: { USER: ["/wallet"] } }, null, "USER", {})
    .join() === "/wallet",
  "this is what the third state exists for"
);
check(
  "unknown paths are dropped rather than stored",
  Object.keys(parsePageOverrides({ "/not-a-page": false })).length === 0
);

const matrix = code("src/components/admin/visibility/visibility-matrix.tsx");
check(
  "the visibility screen has a By user tab",
  /setTab\("user"\)/.test(matrix) && /By user/.test(matrix),
  "the capability existed but only inside the Edit User modal, where nothing said the role rules were already acting"
);
check(
  "the shared matrix Save button is not shown on it",
  /hidden=\{tab === "user"\}/.test(matrix),
  "that button saves the package/role rules — on the user tab it would be a different, wrong action"
);

const panel = code("src/components/admin/visibility/user-visibility-panel.tsx");
check(
  "the per-user control has THREE states, not a checkbox",
  /type Tri = "inherit" \| "show" \| "hide"/.test(panel),
  "a checkbox cannot say 'leave this alone', so the first save would freeze every page at its current value"
);
check(
  "choosing inherit deletes the key instead of storing a value",
  /if \(tri === "inherit"\) delete next\[path\]/.test(panel),
  "storing it would silently pin the user against later rule changes"
);
check(
  "it covers functions as well as pages",
  /FEATURES\.map/.test(panel) && /USER_PAGES\.map/.test(panel),
  'the ask was "pages or functions" — features are the functions half'
);
check(
  "it shows what is inherited next to what is being overridden",
  /inherited:/.test(panel) && /same as inherited/.test(panel),
  "without the baseline you cannot tell whether your override is doing anything"
);
check(
  "there is a way back to fully inherited",
  /Reset to inherited/.test(panel)
);

const visApi = code("src/app/api/admin/users/[id]/visibility/route.ts");
check(
  "the endpoint returns both the inherited answer and the overrides",
  /inheritedHidden/.test(visApi) &&
    /pageOverrides/.test(visApi) &&
    /inheritedFeatures/.test(visApi) &&
    /featureOverrides/.test(visApi)
);
check(
  "the inherited baseline is computed WITHOUT the user's overrides",
  /computeHiddenPaths\(rules, pkg\?\.slug \?\? null, user\.role\)/.test(visApi),
  "passing the overrides in would make the baseline equal the result and the comparison meaningless"
);
check(
  "it is super-admin only",
  /isSuperAdmin\(session\.user\.role/.test(visApi)
);
check(
  "every catalogued page is reachable from the panel",
  USER_PAGES.length > 0 && /USER_PAGES/.test(panel)
);

/* ────────────────────────────────────────────────────────────────
   5. Back goes back
   ──────────────────────────────────────────────────────────────── */
console.log("\n5. Task type: Back returns to the picker");

const form = code("src/app/admin/tasks/_components/TaskForm.tsx");
check(
  "the chosen type lives in the URL",
  /searchParams\.get\("type"\)/.test(form),
  "it was React state only, so Back had nothing to pop and left the page"
);
check(
  "picking a type pushes a history entry",
  /window\.history\.pushState\(null, "", `\$\{window\.location\.pathname\}\?\$\{params\}`\)/.test(form)
);
check(
  "Back is listened for and returns to step 1",
  /addEventListener\("popstate", onPop\)/.test(form) &&
    /removeEventListener\("popstate", onPop\)/.test(form),
  "and the listener is cleaned up"
);
check(
  "pushState rather than router.push",
  !/router\.push\(`\?type=/.test(form),
  "a real navigation would refetch the board list and throw away anything already typed"
);
check(
  "going back keeps the rest of the form",
  /prev\.type === valid \? prev : \{ \.\.\.prev, type: valid \}/.test(form),
  "re-picking the same type should not wipe what was already written"
);
check(
  "a type this admin cannot create resolves to the picker",
  /visibleTaskTypes\.some\(\(t\) => t\.id === next\) \? next : ""/.test(form),
  "otherwise a hand-edited URL opens a form for a type they are not allowed to use"
);
check(
  '"Change Type" lands where Back lands',
  /if \(isCreate && pushedTypeRef\.current\) \{\s*window\.history\.back\(\);/.test(form),
  "two controls for one move should not end up in two different places"
);
check(
  "editing an existing task is left alone",
  /const isCreate = !task;/.test(form) && /if \(!isCreate\) return;/.test(form),
  "the type is fixed there — the URL step only makes sense while creating"
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
