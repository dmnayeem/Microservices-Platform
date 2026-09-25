import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { sendNotificationEmail } from "@/lib/email";
import { FRAUD_SIGNALS, type FraudSignal } from "@/lib/fraud-signals";

/**
 * Task-fraud risk: a 0–100% score per user that climbs each time they are
 * caught cheating on a task, and suspends the account when it reaches the
 * admin's bar (100% by default). A suspended user can appeal from /appeal.
 *
 * The score is a column (`User.fraudRisk`), bumped in SQL so two signals
 * landing together both count. Every bump is a `FraudEvent` carrying the
 * points it added, keyed by `dedupeKey`, so a retried request cannot add the
 * same offence twice — and the admin Fraud Monitor lists each one.
 *
 * Settings (Settings → Limits → Anti-fraud):
 *   antifraud.risk_enabled          master switch (on)
 *   antifraud.auto_suspend_enabled  suspend at the bar (on)
 *   antifraud.auto_suspend_at       the bar, 10–100 (100)
 *   antifraud.risk_points           { SIGNAL: points } overrides
 */

export { FRAUD_SIGNALS } from "@/lib/fraud-signals";
export type { FraudSignal } from "@/lib/fraud-signals";

/** Levels at which the user is warned and the admin sees a HIGH/CRITICAL event. */
const WARN_LEVELS = [50, 80] as const;

export interface RiskConfig {
  enabled: boolean;
  autoSuspend: boolean;
  suspendAt: number;
  points: Record<FraudSignal, number>;
}

const clampPct = (v: unknown, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : dflt;
};

export async function getRiskConfig(): Promise<RiskConfig> {
  const [enabled, autoSuspend, suspendAt, overrides] = await Promise.all([
    getSetting<boolean>("antifraud.risk_enabled", true),
    getSetting<boolean>("antifraud.auto_suspend_enabled", true),
    getSetting<number>("antifraud.auto_suspend_at", 100),
    getSetting<Record<string, number>>("antifraud.risk_points", {}),
  ]);
  const points = {} as Record<FraudSignal, number>;
  for (const k of Object.keys(FRAUD_SIGNALS) as FraudSignal[]) {
    const o = overrides && typeof overrides === "object" ? overrides[k] : undefined;
    points[k] = o === undefined ? FRAUD_SIGNALS[k].points : clampPct(o, FRAUD_SIGNALS[k].points);
  }
  return {
    enabled: enabled !== false,
    autoSuspend: autoSuspend !== false,
    suspendAt: Math.max(10, clampPct(suspendAt, 100)),
    points,
  };
}

const severityFor = (after: number, suspendAt: number) =>
  after >= suspendAt ? "CRITICAL" : after >= 80 ? "CRITICAL" : after >= 50 ? "HIGH" : "MEDIUM";

export interface RiskResult {
  added: number;
  before: number;
  after: number;
  suspended: boolean;
}

/**
 * Add one offence to a user's risk. Returns null when the offence was already
 * counted (same `dedupeKey`), when risk scoring is off, or the signal is worth
 * 0 points. Never throws — a fraud score must not be able to fail the request
 * that caught the fraud.
 */
export async function addFraudRisk(opts: {
  userId: string;
  signal: FraudSignal;
  /** One offence, one key — e.g. `dup:<submissionId>`. */
  dedupeKey: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Admin who flagged it, for ADMIN_FRAUD_REJECT. */
  actorId?: string | null;
}): Promise<RiskResult | null> {
  try {
    const cfg = await getRiskConfig();
    // With scoring off (or a signal set to 0) the offence is still recorded
    // for the Fraud Monitor — once, by the same key — it just adds nothing.
    const points = cfg.enabled ? cfg.points[opts.signal] : 0;

    // The event first: its unique dedupeKey is what stops a second count.
    let eventId: string;
    try {
      const ev = await prisma.fraudEvent.create({
        data: {
          userId: opts.userId,
          eventType: opts.signal,
          severity: "MEDIUM",
          dedupeKey: opts.dedupeKey,
          riskPoints: points,
          ipAddress: opts.ipAddress ?? null,
          userAgent: opts.userAgent ?? null,
          details: { ...(opts.details ?? {}), label: FRAUD_SIGNALS[opts.signal].label } as object,
        },
        select: { id: true },
      });
      eventId = ev.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
    if (points <= 0) return null;

    const rows = await prisma.$queryRaw<Array<{ before: number; after: number; status: string; role: string }>>(
      Prisma.sql`
        UPDATE "User" u
        SET "fraudRisk" = LEAST(100, u."fraudRisk" + ${points})
        FROM (SELECT id, "fraudRisk" AS before FROM "User" WHERE id = ${opts.userId} FOR UPDATE) o
        WHERE u.id = o.id
        RETURNING o.before, u."fraudRisk" AS after, u.status::text AS status, u.role::text AS role
      `
    );
    const row = rows[0];
    if (!row) return null;
    const { before, after } = row;

    await prisma.fraudEvent.update({
      where: { id: eventId },
      data: {
        severity: severityFor(after, cfg.suspendAt) as never,
        details: {
          ...(opts.details ?? {}),
          label: FRAUD_SIGNALS[opts.signal].label,
          riskBefore: before,
          riskAfter: after,
          ...(opts.actorId ? { flaggedBy: opts.actorId } : {}),
        } as object,
      },
    });

    let suspended = false;
    // Staff are scored (the admin should see it) but never auto-suspended —
    // locking an admin out of the panel is not a call a counter should make.
    if (cfg.autoSuspend && after >= cfg.suspendAt && row.status === "ACTIVE" && row.role === "USER") {
      suspended = await autoSuspend(opts.userId, after, opts.signal);
    } else {
      const crossed = WARN_LEVELS.filter((l) => before < l && after >= l && l < cfg.suspendAt);
      if (crossed.length && row.role === "USER") {
        await notifyUser({
          userId: opts.userId,
          type: "SYSTEM",
          title: "Warning: your account has been flagged",
          message: `Suspicious task activity has put your account at ${after}% risk. At ${cfg.suspendAt}% it is suspended automatically. Complete every task yourself and submit only your own proof.`,
          link: "/tasks",
        }).catch(() => {});
      }
    }

    return { added: after - before, before, after, suspended };
  } catch (e) {
    console.error("[fraud-risk] addFraudRisk failed:", e);
    return null;
  }
}

async function autoSuspend(userId: string, risk: number, signal: FraudSignal): Promise<boolean> {
  const reason = `Automatic suspension: task-fraud risk reached ${risk}% (last: ${FRAUD_SIGNALS[signal].label.toLowerCase()}).`;
  // CAS on ACTIVE: two signals crossing the bar together suspend once.
  const res = await prisma.user.updateMany({
    where: { id: userId, status: "ACTIVE" },
    data: { status: "SUSPENDED", suspendedReason: reason, suspendedAt: new Date() },
  });
  if (res.count === 0) return false;

  await prisma.fraudEvent
    .create({
      data: {
        userId,
        eventType: "AUTO_SUSPENDED",
        severity: "CRITICAL",
        details: { risk, lastSignal: signal, reason } as object,
      },
    })
    .catch(() => {});
  await writeAudit({
    actorId: null,
    action: "USER_AUTO_SUSPENDED",
    entity: "User",
    entityId: userId,
    targetUserId: userId,
    summary: `Suspended automatically at ${risk}% fraud risk`,
    meta: { risk, signal },
  }).catch(() => {});

  // They can no longer sign in, so the way back has to reach them outside the
  // app: an email with a signed appeal link. Transactional — a service notice
  // must not depend on the marketing switch.
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (u?.email) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
    await sendNotificationEmail(
      u.email,
      "Your account has been suspended",
      `${reason}\n\nIf you believe this is a mistake, you can appeal. An admin will review it and reply by email.`,
      `${base}/appeal?t=${signAppealToken(userId)}`,
      { transactional: true, style: "URGENT" }
    ).catch(() => {});
  }
  return true;
}

/* ── Appeal link ──────────────────────────────────────────────────────────
   A suspended account cannot sign in, so /appeal accepts a signed token
   instead: from the login screen (after the password was verified) or from
   the suspension email. It names the user and expires. */

const APPEAL_TTL_SECONDS = 60 * 60 * 24 * 14;

function appealSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing NEXTAUTH_SECRET / AUTH_SECRET");
  return s;
}

const sign = (payload: string) =>
  createHmac("sha256", appealSecret()).update(`appeal:${payload}`).digest("base64url");

export function signAppealToken(userId: string, ttlSeconds = APPEAL_TTL_SECONDS): string {
  const payload = Buffer.from(`${userId}.${Math.floor(Date.now() / 1000) + ttlSeconds}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The user id the token names, or null when it is forged or expired. */
export function verifyAppealToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [userId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!userId || !(Number(exp) > Date.now() / 1000)) return null;
  return userId;
}
