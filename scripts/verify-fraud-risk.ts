/**
 * Fraud risk → auto-suspension → appeal link, against the real database.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-fraud-risk.ts
 *
 * (tsconfig.script.json stubs `server-only`, which src/lib/fraud-risk.ts imports.)
 * Creates one throwaway user, drives it to the bar, and deletes it.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  addFraudRisk,
  getRiskConfig,
  signAppealToken,
  verifyAppealToken,
} from "../src/lib/fraud-risk";

let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && info !== undefined ? `  → ${JSON.stringify(info)}` : ""}`);
  if (!ok) failed++;
};

async function main() {
  const cfg = await getRiskConfig();
  console.log("config:", JSON.stringify(cfg));
  const tag = `fraudrisk-${Date.now()}`;
  const user = await prisma.user.create({
    data: { email: `${tag}@verify.invalid`, name: tag, referralCode: tag, role: "USER", status: "ACTIVE" },
    select: { id: true },
  });
  const uid = user.id;
  const risk = async () =>
    (await prisma.user.findUnique({ where: { id: uid }, select: { fraudRisk: true, status: true, suspendedReason: true } }))!;

  try {
    const p = cfg.points;
    const r1 = await addFraudRisk({ userId: uid, signal: "DUPLICATE_PROOF", dedupeKey: `${tag}:1` });
    check("first offence adds its points", r1?.after === Math.min(100, p.DUPLICATE_PROOF), r1);

    const again = await addFraudRisk({ userId: uid, signal: "DUPLICATE_PROOF", dedupeKey: `${tag}:1` });
    check("the same offence (same key) is not counted twice", again === null && (await risk()).fraudRisk === r1?.after, again);

    const events1 = await prisma.fraudEvent.count({ where: { userId: uid } });
    check("one FraudEvent per offence, not per retry", events1 === 1, events1);

    let expected = r1!.after;
    const notesBefore = await prisma.notification.count({ where: { userId: uid } });
    for (const k of ["2", "3"]) {
      const r = await addFraudRisk({ userId: uid, signal: "ADMIN_FRAUD_REJECT", dedupeKey: `${tag}:${k}` });
      expected = Math.min(100, expected + p.ADMIN_FRAUD_REJECT);
      check(`reviewer "cheating" verdict ${k} → ${expected}%`, r?.after === expected, r);
    }
    const warned = (await prisma.notification.count({ where: { userId: uid } })) - notesBefore;
    check("user was warned on crossing 50% / 80%", expected < cfg.suspendAt ? warned >= 1 : true, warned);

    const ev = await prisma.fraudEvent.findFirst({ where: { dedupeKey: `${tag}:3` } });
    check(
      "event records points and before→after for the admin",
      ev?.riskPoints === p.ADMIN_FRAUD_REJECT && (ev?.details as { riskAfter?: number })?.riskAfter === expected,
      ev
    );

    // Drive to the bar.
    let n = 10;
    let last = null as Awaited<ReturnType<typeof addFraudRisk>>;
    while ((await risk()).status === "ACTIVE" && n-- > 0) {
      last = await addFraudRisk({ userId: uid, signal: "KEY_OF_ANOTHER_USER", dedupeKey: `${tag}:k${n}` });
    }
    const after = await risk();
    if (cfg.enabled && cfg.autoSuspend) {
      check(`suspended automatically at ${cfg.suspendAt}%`, after.status === "SUSPENDED" && after.fraudRisk >= cfg.suspendAt, after);
      check("the suspension says why", !!after.suspendedReason?.includes("fraud risk"), after.suspendedReason);
      check("the call that crossed the bar reports it", last?.suspended === true, last);
      const auto = await prisma.fraudEvent.count({ where: { userId: uid, eventType: "AUTO_SUSPENDED" } });
      check("an AUTO_SUSPENDED event is raised for the admin", auto === 1, auto);
      const more = await addFraudRisk({ userId: uid, signal: "KEY_OF_ANOTHER_USER", dedupeKey: `${tag}:extra` });
      check("risk is capped at 100% and nothing suspends twice", (await risk()).fraudRisk <= 100 && more?.suspended === false, more);
    } else {
      console.log("SKIP  auto-suspension is off in settings");
    }

    // Appeal link.
    const tok = signAppealToken(uid);
    check("appeal link names the user", verifyAppealToken(tok) === uid);
    check("a tampered link is refused", verifyAppealToken(tok.slice(0, -2) + (tok.endsWith("A") ? "BB" : "AA")) === null);
    check("an expired link is refused", verifyAppealToken(signAppealToken(uid, -5)) === null);
    const [payload] = tok.split(".");
    const forged = `${Buffer.from(`someone-else.${Math.floor(Date.now() / 1000) + 999}`).toString("base64url")}.${tok.split(".")[1]}`;
    check("another user's id cannot reuse a signature", verifyAppealToken(forged) === null && !!payload);
  } finally {
    await prisma.fraudEvent.deleteMany({ where: { userId: uid } });
    await prisma.auditLog.deleteMany({ where: { targetUserId: uid } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: uid } });
    await prisma.user.delete({ where: { id: uid } });
  }
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
