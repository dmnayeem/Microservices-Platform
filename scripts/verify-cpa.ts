import * as fs from "fs";
import * as path from "path";
import { buildCpaTrackingUrl, isValidCpaTemplate } from "../src/lib/cpa/link";
import { CPA_PUBLIC_OFFER_SELECT } from "../src/lib/cpa/public";
import { deriveSource } from "../src/lib/tx-sources";
import { pointSourceOf } from "../src/lib/finance/points-source";
import {
  CPA_RETRY_DEFAULT_HOURS,
  CPA_RETRY_SETTING_KEY,
  clampCpaRetryHours,
  cpaAttemptBoundary,
  cpaRetryState,
} from "../src/lib/cpa/retry";
import { gateCovers } from "../src/lib/profile-gate-features";
import {
  DEFAULT_COMMISSION_SOURCES,
  TASK_COMMISSION_TYPES,
  normalizeCommissionSources,
  taskTypeCommissionOn,
} from "../src/lib/referral-commission-sources";
import { NUMERIC_SETTING_BOUNDS } from "../src/lib/setting-guards";

/**
 * CPA offers — the invariants that keep the module from losing money.
 *
 * Read-only: no database, no network. Pure functions are exercised directly;
 * the rest is asserted from the source, because the failures worth catching
 * (a second payout path, a leaked tracking link, a postback the middleware
 * bounces to /login) all look fine in review.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-cpa.ts
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}
const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );

console.log("Tracking link");
{
  const t = "https://net.example/c?pub=7&sub1={clickId}&sub2={userId}&u={username}&geo={country}";
  const url = buildCpaTrackingUrl(t, { clickId: "ck1", userId: "u1", username: "a b&c", country: "BD" });
  check("macros filled", url === "https://net.example/c?pub=7&sub1=ck1&sub2=u1&u=a%20b%26c&geo=BD", String(url));
  check(
    "macros are case-insensitive",
    buildCpaTrackingUrl("https://x.io/?s={CLICKID}", { clickId: "z" }) === "https://x.io/?s=z"
  );
  check(
    "missing value → empty, never the literal macro",
    buildCpaTrackingUrl("https://x.io/?c={country}", {}) === "https://x.io/?c="
  );
  const inj = buildCpaTrackingUrl("https://x.io/?s={clickId}", { clickId: "a&evil=1#frag" }) ?? "";
  check("values cannot inject parameters", new URL(inj).searchParams.get("evil") === null, inj);
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "/relative/{clickId}", "ftp://x.io/", "", "https://x.io/a b"]) {
    check(`refuses ${JSON.stringify(bad)}`, !isValidCpaTemplate(bad) && buildCpaTrackingUrl(bad, {}) === null);
  }
}

console.log("Tracking link never reaches the browser");
{
  check("public select has no trackingUrl", !("trackingUrl" in CPA_PUBLIC_OFFER_SELECT));
  const userApi = walk("src/app/api/cpa").filter((f) => f.endsWith(".ts"));
  for (const f of userApi) {
    check(`${f} does not read trackingUrl`, !read(f).includes("trackingUrl"));
  }
  const go = read("src/app/go/cpa/[id]/route.ts");
  check("/go route redirects (302) with the built URL", /NextResponse\.redirect\(url, 302\)/.test(go));
  check("/go route never JSON-returns the offer", !/NextResponse\.json/.test(go));
  check("/go route requires a session", /auth\(\)/.test(go) && /\/login/.test(go));
  check("/go route is rate limited", /enforceRateLimit\(/.test(go));
}

console.log("Money path");
{
  const credit = read("src/lib/cpa/credit.ts");
  check("credit reference is cpa_<id>", /cpaCreditRef = \(conversionId: string\) => `cpa_\$\{conversionId\}`/.test(credit));
  check(
    "approval flips status with a CAS before crediting",
    /where: \{ id, status: "PENDING", attempts: c\.attempts \},\s*data: \{ status: "APPROVED"/.test(credit)
  );
  check("hold release is a CAS on HELD + heldUntil", /status: "HELD", heldUntil: \{ lte: now \}/.test(credit));
  check("reversal clamps to the balance", /Math\.min\(holder\?\.pointsBalance \?\? 0, owed\)/.test(credit));
  check("reversal never trusts Transaction.amount's sign", /Math\.abs\(Number\(credit\?\.amount/.test(credit));
  check("cap claim is a conditional UPDATE", /"totalCap" IS NULL OR "conversionsCount" < "totalCap"/.test(credit));
  check("rejection gives the cap slot back", /REJECTED[\s\S]*releaseCpaCap\(tx, c\.offerId\)/.test(credit));
  check("transactions stay under Accelerate's 15s", /timeout: 15_000/.test(credit));

  // creditPoints / pointsBalance increments for CPA live in credit.ts only.
  const cpaFiles = [...walk("src/lib/cpa"), ...walk("src/app/api/cpa"), ...walk("src/app/api/admin/cpa"), ...walk("src/app/go/cpa")].filter((f) => f.endsWith(".ts"));
  for (const f of cpaFiles) {
    if (f.replace(/\\/g, "/").endsWith("src/lib/cpa/credit.ts")) continue;
    const s = read(f);
    check(`${f} moves no points itself`, !/creditPoints\(|pointsBalance: \{ (increment|decrement)/.test(s));
  }
}

console.log("Schema");
{
  const schema = read("prisma/schema.prisma");
  const conv = /model CpaConversion \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
  check("one conversion per user per offer", /@@unique\(\[offerId, userId\]\)/.test(conv));
  check("txid is unique", /txid\s+String\?\s+@unique/.test(conv));
  check("conversion → user is Restrict", /user\s+User\s+@relation\([^)]*onDelete: Restrict/.test(conv));
  const sql = read("prisma/migrations/20260929200000_cpa_offers/migration.sql");
  check("migration creates the unique (offerId, userId)", /UNIQUE INDEX IF NOT EXISTS "CpaConversion_offerId_userId_key"/.test(sql));
  check("migration creates the unique txid", /UNIQUE INDEX IF NOT EXISTS "CpaConversion_txid_key"/.test(sql));
  check("migration is additive", !/\bDROP\b|ALTER TABLE "(?!Cpa)[A-Za-z]+" (ALTER|DROP)/.test(sql));
}

console.log("Postback");
{
  const cfg = read("src/lib/auth/config.ts");
  check("middleware lets the postback through", cfg.includes('"/api/cpa/postback"'));
  const pb = read("src/lib/cpa/postback.ts");
  check("signature compared in constant time", /timingSafeEqual/.test(pb));
  check("no secret → refused", /if \(!secret\) return false;/.test(pb));
  check("txid replays are caught before any write", /where: \{ txid: p\.txid \}/.test(pb));
  const route = read("src/app/api/cpa/postback/route.ts");
  check("bad signature → 403", /Bad signature" \}, \{ status: 403 \}/.test(route));
  check("the public route never creates the secret", !/ensureCpaPostbackSecret|rotateCpaPostbackSecret/.test(route));
}

console.log("Ledger labels");
{
  check("wallet labels cpa_ as CPA", deriveSource("EARNING", "cpa_cxyz") === "cpa");
  check("wallet labels a reversal as CPA", deriveSource("EARNING", "cpa_rev_cxyz") === "cpa");
  check("finance labels cpa_ as CPA", pointSourceOf({ type: "EARNING", reference: "cpa_cxyz" }) === "cpa");
  check("offerwall rows unchanged", pointSourceOf({ type: "EARNING", reference: "offerwall_hold_x" }) === "offerwall");
}

console.log("Retry after a rejection");
{
  check("setting key is cpa.retry_after_hours", CPA_RETRY_SETTING_KEY === "cpa.retry_after_hours");
  check("default wait is 24h", CPA_RETRY_DEFAULT_HOURS === 24 && clampCpaRetryHours(undefined) === 24);
  check("wait is clamped to 0–720", clampCpaRetryHours(-5) === 0 && clampCpaRetryHours(99999) === 720);
  const bound = NUMERIC_SETTING_BOUNDS["cpa.retry_after_hours"];
  check("the generic settings POST bounds the key too", bound?.min === 0 && bound?.max === 720 && !!bound?.integer);
  const rej = new Date("2026-09-01T00:00:00Z");
  const s23 = cpaRetryState({ reviewedAt: rej }, 24, new Date("2026-09-01T23:00:00Z"));
  const s24 = cpaRetryState({ reviewedAt: rej }, 24, new Date("2026-09-02T00:00:00Z"));
  check("23h after a rejection → not yet", !s23.ready && s23.retryAt.toISOString() === "2026-09-02T00:00:00.000Z");
  check("24h after a rejection → may retry", s24.ready);
  check("no reviewedAt counts as rejected just now", !cpaRetryState({ reviewedAt: null }, 24).ready);
  check("first attempt has no boundary", cpaAttemptBoundary(null) === null);
  check(
    "attempt boundary = the last rejection",
    cpaAttemptBoundary([{ reviewedAt: "2026-09-01T00:00:00.000Z", retriedAt: "2026-09-03T00:00:00.000Z" }])?.toISOString() ===
      "2026-09-01T00:00:00.000Z"
  );

  const credit = read("src/lib/cpa/credit.ts");
  const reopen = /async function reopenRejected[\s\S]*?\n\}/.exec(credit)?.[0] ?? "";
  check("retry reopens ONLY a REJECTED row", /where: \{\s*id: row\.id,\s*status: "REJECTED",/.test(reopen));
  check("retry CAS pins the attempt and the wait", /attempts: row\.attempts,\s*reviewedAt: \{ lte: waitedSince \}/.test(reopen));
  check("retry keeps the previous attempt in history", /\[\.\.\.readCpaHistory\(row\.history\), prev\]/.test(reopen));
  check("retry re-claims the cap with the conditional update", /claimCpaCap\(tx, row\.offerId\)/.test(reopen));
  check("retry clears the rejection fields", /rejectionReason: null,\s*reviewedById: null,\s*reviewedAt: null/.test(reopen));
  check("retry never touches money", reopen.length > 0 && !/creditPoints|pointsBalance|transaction\./.test(reopen));
  check("a retry is audited", /action: "CPA_CONVERSION_RETRIED"/.test(credit));
  check("within the wait → RETRY_LATER", /reason: "RETRY_LATER", retryAt: state\.retryAt/.test(credit));
  check("hold CAS pins attempts", /where: \{ id, status: "PENDING", attempts: c\.attempts \},\s*data: \{ status: "HELD"/.test(credit));
  check("hold release CAS pins attempts", /status: "HELD", heldUntil: \{ lte: now \}, attempts: c\.attempts/.test(credit));

  const elig = read("src/lib/cpa/eligibility.ts");
  check(
    "gate: only REJECTED can be retried; PENDING/HELD/APPROVED/REVERSED are ALREADY",
    /if \(ctx\.mine\.status !== "REJECTED"\) return \{ ok: false, reason: "ALREADY" \}/.test(elig)
  );
  const go = read("src/app/go/cpa/[id]/route.ts");
  check(
    "/go/cpa refuses through the same gate (RETRY_LATER before the wait)",
    /checkCpaEligibility\(offer, viewer\)/.test(go) && /back\(gate\.ok \? "NOT_FOUND" : gate\.reason\)/.test(go)
  );
  const detail = read("src/app/api/cpa/offers/[id]/route.ts");
  check("offer page: 'started' counts only clicks since the rejection", /createdAt: \{ gt: my\.reviewedAt \}/.test(detail));
  const submit = read("src/app/api/cpa/offers/[id]/submit/route.ts");
  check("submit: a retry needs a Start made since the rejection", /createdAt: \{ gt: existing\.reviewedAt \}/.test(submit));
  const shared = read("src/components/user/cpa/cpa-shared.tsx");
  check("user UI explains RETRY_LATER", /RETRY_LATER: \{/.test(shared) && /You can try again in/.test(shared));
  check("user UI explains PROFILE_INCOMPLETE", /PROFILE_INCOMPLETE: \{/.test(shared));
  const schema = read("prisma/schema.prisma");
  const conv = /model CpaConversion \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
  check("still one row per user per offer, with an attempt counter", /@@unique\(\[offerId, userId\]\)/.test(conv) && /attempts\s+Int\s+@default\(1\)/.test(conv));
  const sql = read("prisma/migrations/20260929200000_cpa_offers/migration.sql");
  check("migration adds attempts/history re-runnably", /ADD COLUMN IF NOT EXISTS "attempts"/.test(sql) && /ADD COLUMN IF NOT EXISTS "history"/.test(sql));
}

console.log("Manual approval + postback, every interleaving");
{
  const pb = read("src/lib/cpa/postback.ts");
  const credit = read("src/lib/cpa/credit.ts");
  const handler = /export async function handleCpaPostback[\s\S]*?\n\}\n/.exec(pb)?.[0] ?? "";
  const mark = /async function markVerified[\s\S]*?\n\}/.exec(pb)?.[0] ?? "";
  check("(a) proof → postback: the PENDING row is only marked verified", /markVerified\(existing\.id, \["PENDING"\]/.test(handler));
  check(
    "(a) auto-approve only in POSTBACK mode with auto-approve on and a cap slot",
    /completionMode === "POSTBACK" &&\s*click\.offer\.autoApproveOnPostback &&\s*capOk/.test(handler)
  );
  const attach = /if \(existing\.status === "PENDING" && empty\) \{[\s\S]*?\n {6}\}/.exec(credit)?.[0] ?? "";
  check("(b) postback → proof: the proof is attached to the PENDING row", attach.length > 0);
  check("(b) attaching proof keeps postbackVerified and txid", !/postbackVerified|txid/.test(attach));
  check("(b) a create that loses the race re-reads the row", /e\.code === "P2002"\) continue;/.test(credit) && /e\.code === "P2002"\) \{[\s\S]{0,200}continue;/.test(handler));
  check(
    "(c)(f) HELD/APPROVED + postback: marked verified, returns before any approval",
    /existing\.status === "HELD" \|\| existing\.status === "APPROVED"\) \{[^}]*markVerified\(existing\.id, \["HELD", "APPROVED"\][^\n]*\n\s*return /.test(handler)
  );
  const markData = /data: \{[\s\S]*?\n {6}\}/.exec(mark)?.[0] ?? "";
  check("markVerified never changes status, points or proof", markData.length > 0 && !/status|points:|proofImages|proofText/.test(markData));
  check("(d) reversal after approval → reverseCpaConversion", /existing\.status === "APPROVED"\) \{\s*const r = await reverseCpaConversion/.test(handler));
  check("(d) reversal is a CAS on APPROVED", /where: \{ id, status: "APPROVED" \},\s*data: \{\s*status: "REVERSED"/.test(credit));
  check("(d) reversal ledger ref is unique per conversion", /cpaReversalRef = \(conversionId: string\) => `cpa_rev_\$\{conversionId\}`/.test(credit));
  const txidAt = handler.indexOf("where: { txid: p.txid }");
  const firstWrite = Math.min(
    ...["$transaction(", "markVerified(existing", "reopenCpaConversionByPostback("].map((k) => {
      const i = handler.indexOf(k);
      return i < 0 ? Infinity : i;
    })
  );
  check("(e) a seen txid is refused before any confirmation write", txidAt > 0 && txidAt < firstWrite);
  check(
    "(g) a postback for the rejected attempt keeps the rejection",
    /click\.createdAt\.getTime\(\) <= rejectedAt\) \{\s*return \{ userId, outcome: "REJECTED_KEPT"/.test(handler)
  );
  check("(g) a click after the wait reopens through the shared CAS", /reopenCpaConversionByPostback\(\{/.test(handler));
  check(
    "(g) a click from an older attempt is ignored, confirmation or reversal",
    handler.includes('"STALE_CLICK"') && handler.indexOf('"STALE_CLICK"') < handler.indexOf("if (p.reversal)")
  );
  check("REVERSED stays final", /existing\.status === "REVERSED"\) \{\s*return \{ userId, outcome: "DUPLICATE"/.test(handler));
  check("(h) credit only after the CAS moved this row", /if \(moved\.count === 0\) return false;\s*await creditConversion\(tx, c, rate\);/.test(credit));
  check("(h) the ledger unique is the backstop", /isDuplicateLedgerError\(e\)\) return \{ ok: false, reason: "NOT_PENDING" \}/.test(credit));
  check("the postback moves no points itself", !/creditPoints\(|pointsBalance/.test(pb));
  const tab = read("src/components/admin/cpa/cpa-postback-tab.tsx");
  check("admin Postback tab says manual + API work together", /Manual approval and the postback work together on the same offer/.test(tab));
}

console.log("Profile gate");
{
  check("'tasks' also locks CPA", gateCovers(["tasks", "missions"], "cpa"));
  check("'tasks' also locks offerwalls", gateCovers(["tasks"], "offerwalls"));
  check("CPA can be locked on its own", gateCovers(["cpa"], "cpa") && !gateCovers(["missions"], "cpa"));
  const go = read("src/app/go/cpa/[id]/route.ts");
  check("/go/cpa enforces the gate server-side", /getProfileGateState\(userId, "cpa"\)/.test(go) && /back\("PROFILE_INCOMPLETE"\)/.test(go));
  const submit = read("src/app/api/cpa/offers/[id]/submit/route.ts");
  check("CPA submit enforces it for a user who never started", /profileGateResponse\(userId, "cpa"\)/.test(submit));
  check("/cpa shows the gate", /getProfileGateState\(session\.user\.id, "cpa"\)/.test(read("src/app/(main)/cpa/page.tsx")));
  for (const [f, feat] of [
    ["src/app/api/tasks/[id]/start/route.ts", "tasks"],
    ["src/app/api/article-tasks/[taskId]/start/route.ts", "tasks"],
    ["src/app/api/tasks/quiz/route.ts", "tasks"],
    ["src/app/api/tasks/boards/[id]/claim/route.ts", "tasks"],
    ["src/app/api/offerwall/offers/[id]/start/route.ts", "offerwalls"],
  ] as const) {
    check(`${f} is gated (${feat})`, new RegExp(`profileGateResponse\\([^,]+, "${feat}"`).test(read(f)));
  }
}

console.log("Referral commission sources");
{
  for (const t of TASK_COMMISSION_TYPES) {
    check(`default: ${t.type} tasks pay commission (as before)`, DEFAULT_COMMISSION_SOURCES[`task.${t.type}`] === true);
  }
  check("default: CPA pays none (as before)", DEFAULT_COMMISSION_SOURCES.cpa === false);
  check("default: offerwall pays none (as before)", DEFAULT_COMMISSION_SOURCES.offerwall === false);
  check("no setting row = the defaults", JSON.stringify(normalizeCommissionSources(null)) === JSON.stringify(DEFAULT_COMMISSION_SOURCES));
  check(
    "junk values are ignored",
    normalizeCommissionSources({ cpa: "yes" }).cpa === false && normalizeCommissionSources({ "task.VIDEO": false })["task.VIDEO"] === false
  );
  check("an unknown task type still pays (today's rule)", taskTypeCommissionOn(DEFAULT_COMMISSION_SOURCES, "NEWTYPE"));
  const comm = read("src/lib/referral-commissions.ts");
  check(
    "task commission reference unchanged",
    /referenceBase: submissionId \? `referral_\$\{submissionId\}` : `referral_\$\{userId\}_\$\{taskId\}`/.test(comm) &&
      /const reference = `\$\{ev\.referenceBase\}_L\$\{level\}`/.test(comm)
  );
  check("CPA commission keyed on the conversion", /referenceBase: `referral_cpa_\$\{conversionId\}`/.test(comm));
  check("CPA commission labelled CPA, not TASK", /sourceType: "CPA"/.test(comm) && /label: " · CPA offer"/.test(comm));
  check("CPA commission only when switched on", /if \(!\(await getCommissionSources\(\)\)\.cpa\) return;/.test(comm));
  const credit = read("src/lib/cpa/credit.ts");
  check(
    "CPA credit calls the commission after commit",
    /async function afterCredit[\s\S]*?processCpaReferralCommissions\(c\.userId, c\.points, c\.id, c\.offerId\)/.test(credit)
  );
  for (const f of [
    "src/lib/offerwall.ts",
    "src/app/api/offerwall/[provider]/callback/route.ts",
    "src/app/api/admin/offerwall-callbacks/[id]/route.ts",
  ]) {
    check(`${f} pays offerwall commission only through the switch`, /processOfferwallReferralCommissions\(/.test(read(f)));
  }
  check("wallet files the commission as a referral", deriveSource("REFERRAL", "referral_cpa_cx_L1") === "referral");
  check("finance files it as My Team commission", pointSourceOf({ type: "REFERRAL", reference: "referral_cpa_cx_L1" }) === "referral");
  const sql = read("prisma/migrations/20260929200000_cpa_offers/migration.sql");
  check("enum values added re-runnably", /ADD VALUE IF NOT EXISTS 'CPA'/.test(sql) && /ADD VALUE IF NOT EXISTS 'OFFERWALL'/.test(sql));
}

console.log("Offerwall untouched");
{
  const admin = walk("src/app/api/admin/cpa").map((f) => read(f)).join("\n");
  check("CPA admin never writes offerwall tables", !/prisma\.offerwall/i.test(admin));
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll CPA checks passed.");
process.exit(failures ? 1 : 0);
