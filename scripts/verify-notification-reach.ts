import fs from "fs";
import path from "path";

/**
 * Static checks for /admin/users/notification-reach.
 *  - the page list is a fixed number of queries (no N+1)
 *  - the summary is one cached aggregate
 *  - reminders dedup on the notification itself for 7 days, insert in chunks, audit once
 *  - staff are excluded everywhere
 *  - the reminder link lands on a button that actually subscribes the browser
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-notification-reach.ts
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
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const fnBody = (src: string, name: string) => {
  const i = src.indexOf(name);
  if (i < 0) return "";
  const rest = src.slice(i);
  const next = rest.slice(1).search(/\n(export )?(async )?function |\nexport const /);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

console.log("\n=== Notification reach ===\n");

const lib = code("src/lib/notification-reach.ts");
const page = code("src/app/admin/users/notification-reach/page.tsx");
const remind = code("src/app/api/admin/users/notification-reach/remind/route.ts");
const exp = code("src/app/api/admin/users/notification-reach/export/route.ts");

console.log("1. Fixed query count per page load");
const pageFn = fnBody(lib, "async function reachPage(");
check("page rows: one $queryRaw with the total as a window count", count(pageFn, /\$queryRaw/g) === 1 && /COUNT\(\*\) OVER \(\)/.test(pageFn));
const extras = fnBody(lib, "async function pageExtras(");
check("device counts + last active: ONE batched query for all page ids", count(extras, /\$queryRaw/g) === 1 && /unnest\(/.test(extras));
check("no query inside a per-row loop", !/\.map\([^)]*=>\s*prisma\./.test(lib) && !/for \([^)]*\)\s*\{[^}]*await prisma\.(user|pushSubscription|userActiveDay)/.test(lib));
check("page does no Prisma calls of its own", !/prisma\./.test(page));
const statsBody = lib.slice(lib.indexOf("export const reachStats"), lib.indexOf("export type ReminderTarget"));
check("summary cards: one aggregate query", count(statsBody, /\$queryRaw/g) === 1 && /FILTER \(WHERE/.test(statsBody));
check("summary cached 60 s", /unstable_cache\(/.test(statsBody) && /revalidate:\s*60\b/.test(statsBody));
check("CSV export reuses the same two-query path", /reachExport\(/.test(exp) && !/prisma\./.test(exp));

console.log("\n2. Staff and inactive accounts");
check("staff excluded via STAFF_ROLES from lib/staff", /import \{ STAFF_ROLES \} from "@\/lib\/staff"/.test(lib) && /u\.role::text NOT IN/.test(lib));
const base = fnBody(lib, "function baseWhere(");
check("baseWhere always adds the staff filter, ACTIVE by default", /NOT IN/.test(base) && /u\.status = 'ACTIVE'/.test(base));
check("every list/stat/reminder query goes through baseWhere", count(lib, /baseWhere\(/g) >= 4);
check("reminders only ever target ACTIVE accounts", /accounts: "active" as const/.test(lib) && /baseWhere\("active"\)/.test(fnBody(lib, "async function reminderCandidates(")));

console.log("\n3. Push definitions");
check("ON = subscription AND setting on", /PUSH_ON = Prisma\.sql`\(u\."pushNotifications" AND \$\{HAS_SUB\}\)`/.test(lib));
check("OFF = setting off", /PUSH_OFF = Prisma\.sql`\(NOT u\."pushNotifications"\)`/.test(lib));
check("NOT SET UP = setting on, no subscription", /PUSH_NOTSET = Prisma\.sql`\(u\."pushNotifications" AND NOT \$\{HAS_SUB\}\)`/.test(lib));

console.log("\n4. Reminder");
const send = fnBody(lib, "export async function sendPushReminders(");
check("cooldown is 7 days", /PUSH_REMINDER_COOLDOWN_DAYS = 7\b/.test(lib));
check(
  "dedup: ONE notification query, by marker, within the cooldown",
  count(send, /prisma\.notification\.findMany/g) === 1 &&
    /path: \["kind"\], equals: PUSH_REMINDER_KIND/.test(send) &&
    /createdAt: \{ gte: since \}/.test(send) &&
    /userId: \{ in: ids \}/.test(send)
);
check("inserts are createMany in chunks of 1,000", /createMany/.test(send) && /i \+= 1_000/.test(send) && !/notification\.create\(/.test(send));
check("in-app only — no push/email delivery from the reminder", !/notifyUser|webPushToUsers|deliverToUser|sendNotificationEmail/.test(lib));
check("capped at 5,000", /PUSH_REMINDER_CAP = 5_000/.test(lib) && /LIMIT \$\{PUSH_REMINDER_CAP \+ 1\}/.test(lib));
check("users already ON are never reminded", count(fnBody(lib, "async function reminderCandidates("), /NOT \$\{PUSH_ON\}/g) === 2);
check("reports skipped (recent) back to the admin", /skippedRecent: recentSet\.size/.test(send));
check("route writes ONE audit row with the counts", count(remind, /writeAudit\(/g) === 1 && /PUSH_REMINDER_SENT/.test(remind) && !/writeAuditMany/.test(remind));
check("route needs users.view AND notifications.send", /"users\.view"/.test(remind) && /"notifications\.send"/.test(remind));
check("link goes to the settings notifications section", /PUSH_REMINDER_LINK = "\/settings#notifications"/.test(lib) && /actionUrl: PUSH_REMINDER_LINK/.test(send));

console.log("\n5. The link lets the user actually turn push on");
const settings = code("src/components/user/settings/settings-view.tsx");
check("settings has an id=notifications anchor", /id="notifications"/.test(settings));
check("…with a button that calls subscribeToPush()", /subscribeToPush\(\)/.test(settings) && /Turn on notifications/.test(settings));

console.log("\n6. Navigation");
const rbac = read("src/lib/rbac.ts");
check("sidebar entry under Users", /href: "\/admin\/users\/notification-reach",\s*icon: "BellRing",\s*permissions: \["users\.view"\],\s*category: "USERS"/.test(rbac));
check("BellRing is in the sidebar iconMap", /iconMap[\s\S]*?\bBellRing,/.test(read("src/components/admin/sidebar.tsx")));

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
