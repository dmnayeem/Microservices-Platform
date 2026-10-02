import fs from "fs";
import path from "path";
import {
  advanceOneCycle,
  cleanCustomFields,
  cleanRemindDays,
  dueTone,
  monthlyFactor,
  nextDueFrom,
  reminderDecision,
  reminderKey,
  reminderMessage,
} from "../src/lib/company-finance/subscriptions-shared";

/**
 * Company subscriptions & renewals tracker. Static + pure checks, no DB.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-company-subscriptions.ts
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
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "null");

console.log("Routes are behind the finance guard");
const ROUTES = [
  "src/app/api/admin/company-finance/subscriptions/route.ts",
  "src/app/api/admin/company-finance/subscriptions/[id]/route.ts",
];
for (const r of ROUTES) {
  const src = code(r);
  const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
  const guards = src.match(/await financeGuard\(/g) ?? [];
  check(`${r}: every handler calls financeGuard`, handlers.length > 0 && guards.length === handlers.length, `${handlers.length} handlers, ${guards.length} guards`);
  check(`${r}: no session-role shortcut`, !/session\.user\.role\s*===/.test(src));
}
check("list needs finance.view", /financeGuard\("finance\.view"\)/.test(code(ROUTES[0])));
check("writes need finance.entries.create", (code(ROUTES[1]).match(/financeGuard\("finance\.entries\.create"\)/g) ?? []).length === 2);
check("renew-as-paid needs finance.entries.approve", /finance\.entries\.approve/.test(code(ROUTES[1])));

console.log("Schema: no password field");
const schema = read("prisma/schema.prisma");
const model = schema.match(/model CompanySubscription \{[\s\S]*?\n\}/)?.[0] ?? "";
check("model exists", model.length > 0);
check("no password / secret column", !/^\s*(password|pass|secret|pwd)\w*\s/im.test(model));
const sql = read("prisma/migrations/20261004200000_company_subscriptions/migration.sql");
check("migration is additive and re-runnable", /CREATE TABLE IF NOT EXISTS "CompanySubscription"/.test(sql) && !/\b(DROP|ALTER TABLE)\b/i.test(sql));
check("migration has no password column", !/password/i.test(sql.replace(/--.*$/gm, "")));
check("form warns not to store passwords", /Don't store passwords here/.test(read("src/components/admin/company-finance/subscriptions-tab.tsx")));

console.log("Fail soft without the table");
const lib = code("src/lib/company-finance/subscriptions.ts");
check("missing-table detector covers P2021", /P2021/.test(lib));
const softCalls = lib.match(/isMissingSubscriptionsTable\(e\)/g) ?? [];
check("every DB entry point catches the missing table", softCalls.length >= 6, `${softCalls.length} catches`);
check("reminder sweep returns ready:false on a missing table", /return \{ \.\.\.out, ready: false \}/.test(lib));
check("tab shows the migration message", /SUBSCRIPTIONS_NOT_READY/.test(code(ROUTES[0])));
const jobs = code("src/lib/scheduler/jobs.ts");
check("scheduler job registered", /name: "finance-subscription-reminders"/.test(jobs) && /runSubscriptionReminders\(\)/.test(jobs));

console.log("Reminders are idempotent");
check("claim is a compare-and-set on lastRemindedFor before sending", /updateMany\(\{[\s\S]*?lastRemindedFor: s\.lastRemindedFor[\s\S]*?data: \{ lastRemindedFor: d\.key/.test(lib) && /if \(claim\.count === 0\) continue;/.test(lib));
check("claim happens before notifications are written", lib.indexOf("claim.count === 0") < lib.indexOf("notification.createMany"));
check("one query for due items, one for recipients", (lib.match(/companySubscription\.findMany/g) ?? []).length === 2 && /people = await prisma\.user\.findMany/.test(lib));

const base = { status: "ACTIVE", autoRenew: true, remindDaysBefore: [30, 7, 1], lastRemindedFor: null as string | null };
const end = d("2026-11-01");
let dec = reminderDecision({ ...base, endDate: end }, d("2026-10-25"));
check("7 days out → 7-day reminder", dec.kind === "remind" && dec.threshold === 7 && dec.key === "2026-11-01:7", JSON.stringify(dec));
dec = reminderDecision({ ...base, endDate: end, lastRemindedFor: "2026-11-01:7" }, d("2026-10-26"));
check("rerun with the key stored → nothing", dec.kind === "none", JSON.stringify(dec));
dec = reminderDecision({ ...base, endDate: end, lastRemindedFor: "2026-11-01:30" }, d("2026-10-31"));
check("missed days jump straight to the most urgent (1-day)", dec.kind === "remind" && dec.threshold === 1, JSON.stringify(dec));
dec = reminderDecision({ ...base, endDate: end, lastRemindedFor: "2026-11-01:1" }, d("2026-10-31"));
check("never goes back to a less urgent threshold", dec.kind === "none");
dec = reminderDecision({ ...base, endDate: end }, d("2026-09-01"));
check("outside every threshold → nothing", dec.kind === "none");
dec = reminderDecision({ ...base, autoRenew: false, endDate: end }, d("2026-11-02"));
check("lapsed without auto-renew → expire", dec.kind === "expire" && dec.key === reminderKey(end, "expired"));
dec = reminderDecision({ ...base, endDate: end }, d("2026-11-03"));
check("lapsed with auto-renew → one overdue notice", dec.kind === "overdue");
dec = reminderDecision({ ...base, endDate: end, lastRemindedFor: "2026-11-01:overdue" }, d("2026-11-05"));
check("overdue notice sent once", dec.kind === "none");
dec = reminderDecision({ ...base, status: "CANCELLED", endDate: end }, d("2026-10-31"));
check("cancelled → nothing", dec.kind === "none");
dec = reminderDecision({ ...base, endDate: d("2027-01-01"), lastRemindedFor: "2026-11-01:1" }, d("2026-12-25"));
check("a new due date starts reminders afresh", dec.kind === "remind" && dec.threshold === 7);
const msg = reminderMessage({ name: "Hostinger hosting", autoRenew: true, cost: 12.99, currency: "USD" }, { kind: "remind", key: "k", threshold: 7, daysLeft: 7 });
check("message reads like the owner's example", msg?.message === "Hostinger hosting renews in 7 days ($12.99).", msg?.message);

console.log("Next-due computation per cycle");
check("MONTHLY 15 Jan → 15 Feb", day(advanceOneCycle(d("2026-01-15"), "MONTHLY")) === "2026-02-15");
check("MONTHLY 31 Jan → 28 Feb (clamped)", day(advanceOneCycle(d("2026-01-31"), "MONTHLY")) === "2026-02-28");
check("MONTHLY 31 Jan 2028 → 29 Feb (leap)", day(advanceOneCycle(d("2028-01-31"), "MONTHLY")) === "2028-02-29");
check("QUARTERLY 30 Nov → 28 Feb", day(advanceOneCycle(d("2026-11-30"), "QUARTERLY")) === "2027-02-28");
check("YEARLY 29 Feb 2028 → 28 Feb 2029", day(advanceOneCycle(d("2028-02-29"), "YEARLY")) === "2029-02-28");
check("YEARLY 1 Oct → 1 Oct next year", day(advanceOneCycle(d("2026-10-01"), "YEARLY")) === "2027-10-01");
check("CUSTOM 45 days", day(advanceOneCycle(d("2026-10-01"), "CUSTOM", 45)) === "2026-11-15");
check("CUSTOM without days → null", advanceOneCycle(d("2026-10-01"), "CUSTOM", null) === null);
check("ONE_TIME → null", advanceOneCycle(d("2026-10-01"), "ONE_TIME") === null);
check("nextDueFrom rolls a 2024 yearly start to the next anniversary", day(nextDueFrom(d("2024-03-10"), "YEARLY", null, d("2026-10-02"))) === "2027-03-10");
check("nextDueFrom monthly", day(nextDueFrom(d("2026-01-05"), "MONTHLY", null, d("2026-10-02"))) === "2026-10-05");
check("nextDueFrom today counts as due", day(nextDueFrom(d("2026-09-02"), "MONTHLY", null, d("2026-10-02"))) === "2026-10-02");
check("nextDueFrom one-time → null", nextDueFrom(d("2026-01-01"), "ONE_TIME") === null);
check("monthly factors", monthlyFactor("YEARLY") === 1 / 12 && monthlyFactor("QUARTERLY") === 1 / 3 && monthlyFactor("ONE_TIME") === 0);

console.log("Chips and inputs");
const now = d("2026-10-02");
check("overdue red", dueTone(d("2026-10-01"), "ACTIVE", now) === "overdue");
check("≤7 orange", dueTone(d("2026-10-09"), "ACTIVE", now) === "week");
check("≤30 amber", dueTone(d("2026-11-01"), "ACTIVE", now) === "month");
check("later green", dueTone(d("2026-11-02"), "ACTIVE", now) === "ok");
check("remind days cleaned", JSON.stringify(cleanRemindDays([1, "7", 30, 7, -2, 999])) === "[30,7,1]");
const cf = cleanCustomFields([{ label: " Registrar ", type: "text", value: "Namecheap" }, { label: "", value: "x" }, { label: "Seats", type: "bogus", value: 5 }]);
check("custom fields cleaned", cf.length === 2 && cf[0].label === "Registrar" && cf[1].type === "text" && cf[1].value === "5");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
