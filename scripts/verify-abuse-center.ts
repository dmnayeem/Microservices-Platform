import fs from "fs";
import path from "path";
import {
  ABUSE_ACTIONS,
  ABUSE_DEFAULTS,
  ACCOUNT_ACTIONS,
  maxSeverity,
  openKeyFor,
  providerResponseText,
  severitiesBelow,
  severityForReportPriority,
} from "../src/lib/abuse/policy";

/**
 * Abuse Center — static + pure-function checks. No database.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-abuse-center.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

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

console.log("\n=== Abuse Center ===\n");

/* 1. Dedup */
console.log("1. Signals about the same thing fold into one open case");
const a = { kind: "LINK_UNSAFE" as const, userId: "u1", entityType: "post", entityId: "p1" };
check("same kind+user+item → same key", openKeyFor(a) === openKeyFor({ ...a }));
check("entity type is case-insensitive", openKeyFor(a) === openKeyFor({ ...a, entityType: "POST" }));
check("different item → different key", openKeyFor(a) !== openKeyFor({ ...a, entityId: "p2" }));
check("different kind → different key", openKeyFor(a) !== openKeyFor({ ...a, kind: "USER_REPORT" }));
check("different account → different key", openKeyFor(a) !== openKeyFor({ ...a, userId: "u2" }));
check(
  "no account and no item → no dedup (unrelated public reports never merge)",
  openKeyFor({ kind: "USER_REPORT", userId: null, entityType: undefined, entityId: null }) === null
);
check("severity only rises", maxSeverity("HIGH", "LOW") === "HIGH" && maxSeverity("MEDIUM", "CRITICAL") === "CRITICAL");
check("escalation targets only lower severities", severitiesBelow("HIGH").join() === "LOW,MEDIUM" && severitiesBelow("LOW").length === 0);
check("report priority maps conservatively", severityForReportPriority("URGENT") === "HIGH" && severityForReportPriority("NORMAL") === "LOW");

const cases = code("src/lib/abuse/cases.ts");
check("cases.ts keeps the placeholder's export", /export async function recordAbuseSignal\(signal: AbuseSignal\): Promise<void>/.test(cases));
check("dedup is by the unique openKey (race-safe create + P2002 fold)", /where: \{ openKey \}/.test(cases) && /P2002/.test(cases));
check("recordAbuseSignal never throws", /catch \(e\) \{\s*console\.error\("\[abuse\] recordAbuseSignal failed"/.test(cases));
const schema = read("prisma/schema.prisma");
check("schema: openKey is @unique", /openKey\s+String\?\s+@unique/.test(schema));
const mig = read("prisma/migrations/20260929500000_abuse_center/migration.sql");
check("migration is additive and re-runnable", /CREATE TABLE IF NOT EXISTS "AbuseCase"/.test(mig) && !/\bDROP\b|\bALTER TABLE "(?!AbuseEvidence)/.test(mig));

/* 2. Evidence is append-only */
console.log("\n2. Evidence is append-only");
const files = walk("src").filter((f) => !f.startsWith("src/generated/"));
const evidenceWriters = files.filter((f) => /abuseEvidence\.(update|updateMany|delete|deleteMany|upsert)\b/.test(read(f)));
check("no app code updates or deletes AbuseEvidence", evidenceWriters.length === 0, evidenceWriters.join(", "));
const caseDeleters = files.filter((f) => /abuseCase\.(delete|deleteMany)\b/.test(read(f)));
check("no app code deletes an AbuseCase", caseDeleters.length === 0, caseDeleters.join(", "));
check("evidence → case FK is RESTRICT", /case\s+AbuseCase\s+@relation\(fields: \[caseId\], references: \[id\], onDelete: Restrict\)/.test(schema));
check("migration FK is RESTRICT", /ON DELETE RESTRICT/.test(mig));

/* 3. Actions: hide, never delete; ads through ad-review */
console.log("\n3. Actions hide instead of deleting, and reuse existing mechanisms");
const actions = code("src/lib/abuse/actions.ts");
const abuseLib = walk("src/lib/abuse").map(code).join("\n");
const abuseApi = walk("src/app/api/admin/abuse").concat(walk("src/app/api/abuse")).map(code).join("\n");
check("no .delete / .deleteMany anywhere in the Abuse Center", !/\.(delete|deleteMany)\(/.test(abuseLib + abuseApi));
check("Ad.status is never written directly", !/prisma\.ad\.(update|updateMany)\(/.test(abuseLib + abuseApi));
check("ads are paused through ad-review (adminSetStatus / autoPauseAd)", /from "@\/lib\/ad-review"/.test(actions) && /adminSetStatus\(/.test(actions) && /autoPauseAd\(/.test(actions));
check("posts/comments are hidden with isHidden", /post\.updateMany\([^)]*isHidden: true/.test(actions.replace(/\s+/g, " ")) && /comment\.updateMany\([^)]*isHidden: true/.test(actions.replace(/\s+/g, " ")));
check("listings are unpublished to PENDING_REVIEW, not removed", /status: "PENDING_REVIEW"/.test(actions));
check("tasks are paused, not archived or deleted", /status: "PAUSED"/.test(actions) && !/ARCHIVED/.test(actions));
check("every action records ACTION evidence and an audit row with targetUserId", /addEvidence\(\s*c\.id,\s*"ACTION"/.test(actions) && /targetUserId: c\.userId/.test(actions));
check("restores undo only ids this case recorded", /idsChangedBy\(c\.id, "hide_content"\)/.test(actions) && /idsChangedBy\(c\.id, "pause_ads"\)/.test(actions));
check("account actions require users.ban", ACCOUNT_ACTIONS.includes("suspend_user") && ACCOUNT_ACTIONS.includes("ban_user") && /users\.ban/.test(code("src/lib/abuse/access.ts")));
check("suspension refuses SUPER_ADMIN and respects the staff hierarchy", /SUPER_ADMIN/.test(actions) && /canAdministerStaffAccount\(/.test(actions));
check("automatic rules never suspend staff", /target\.role !== "USER"/.test(actions));

/* 4. No money movement */
console.log("\n4. Holding withdrawals moves no money");
check(
  "no balance field is written by the Abuse Center",
  !/(pointsBalance|cashBalance|adCreditBalance|totalEarnings|taskCreditPoints)\s*:\s*\{\s*(increment|decrement)/.test(abuseLib + abuseApi)
);
check("no withdrawal row is written by the Abuse Center", !/withdrawal\.(update|updateMany|create)\(/.test(abuseLib + abuseApi));
check("no transaction row is written by the Abuse Center", !/transaction\.(create|update|createMany)\(/.test(abuseLib + abuseApi));
const wd = code("src/app/api/admin/withdrawals/[id]/route.ts");
check("the approve step reads the hold", /withdrawalHoldCase\(existingWithdrawal\.userId\)/.test(wd));

/* 5. Auto rules */
console.log("\n5. Auto rules are conservative");
check("auto-suspend on critical is OFF by default", ABUSE_DEFAULTS.autoSuspendOnCritical === false);
check("auto-hide of the single item is ON by default", ABUSE_DEFAULTS.autoHideOnCritical === true);
check("only an explicit true turns auto-suspend on", /autoSuspend === true/.test(cases));
check("default abuse email", ABUSE_DEFAULTS.email === "abuse@revtype.com");

/* 6. Sources wired */
console.log("\n6. Existing streams raise signals");
for (const [f, what] of [
  ["src/app/api/reports/route.ts", "user reports"],
  ["src/lib/fraud.ts", "high-risk FraudEvent"],
  ["src/lib/fraud-risk.ts", "task-fraud risk"],
  ["src/lib/cpa/credit.ts", "CPA reversals"],
  ["src/app/api/offerwall/[provider]/callback/route.ts", "offerwall chargebacks"],
  ["src/app/api/abuse/report/route.ts", "public /abuse form"],
] as const) {
  const src = code(f);
  check(`${what} → abuse signal`, /raiseAbuseSignal\(|recordAbuseSignalForCase\(/.test(src));
}

/* 7. Wiring */
console.log("\n7. Admin + public wiring");
const rbac = read("src/lib/rbac.ts");
check("one sidebar entry", (rbac.match(/href: "\/admin\/abuse"/g) ?? []).length === 1);
check("ShieldAlert is in the sidebar iconMap", /\bShieldAlert,/.test(read("src/components/admin/sidebar.tsx")));
check("API prefix maps to the module", /"\/api\/admin\/abuse": "\/admin\/abuse"/.test(read("src/lib/admin-module-rules.ts")));
const authCfg = read("src/lib/auth/config.ts");
check("/abuse page and its API are public in middleware", /"\/abuse",/.test(authCfg) && /"\/api\/abuse\/report"/.test(authCfg));
const pub = code("src/app/api/abuse/report/route.ts");
check("public form is rate-limited with a honeypot", /rateLimit\(/.test(pub) && /website/.test(pub));
for (const f of walk("src/app/api/admin/abuse")) {
  const src = code(f);
  check(`${f.replace("src/app/api/admin/", "")} checks access`, /abuseAccess\(\)/.test(src) && /status: 403/.test(src));
  if (/export async function (POST|PATCH)/.test(src)) check(`${f.replace("src/app/api/admin/", "")} writes an audit row`, /writeAudit\(|runAbuseAction\(/.test(src));
}

/* 8. Provider response */
console.log("\n8. Provider response template");
const txt = providerResponseText({
  platform: "RevType",
  contactEmail: "abuse@revtype.com",
  providerRef: "T-123",
  caseId: "ABCD1234",
  reported: "Phishing page at /post/x",
  found: "One post by one account",
  actions: [{ at: "2026-09-29T10:00:00Z", label: ABUSE_ACTIONS.hide_content.label, detail: "Hid 1 posts" }],
});
check("names the provider ticket", txt.includes("T-123"));
check("lists actions with timestamps", txt.includes("2026-09-29 10:00 UTC") && txt.includes("Hid 1 posts"));
check("gives the contact", txt.includes("Contact: abuse@revtype.com"));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
