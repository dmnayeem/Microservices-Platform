import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getPointsPerUsd } from "@/lib/economy";
import { creditPoints } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { isStaffRole } from "@/lib/staff";
import { notifyUser } from "@/lib/notify";
import { writeAudit } from "@/lib/audit";
import { recordUserAction } from "@/lib/goal-progress";
import { raiseAbuseSignal } from "@/lib/abuse/signal";
import { TransactionType, UserStatus } from "@/generated/prisma/client";
import {
  PWA_REWARD_DEFAULTS,
  PWA_SETTING_KEYS,
  normalizePwaRewardConfig,
  type PwaPlatform,
  type PwaRewardConfig,
  type PwaRewardStatus,
} from "@/lib/pwa-shared";

/**
 * Installed-app (PWA) tracking and the one-time install reward.
 *
 * The browser tells us it is running as an installed app (display-mode
 * standalone). The server cannot verify that claim — any script can POST
 * "standalone" — so the reward is built so that the claim alone is never
 * enough and can never pay twice:
 *
 *  1. DAYS, NOT HITS. `pwaDays` only moves when the last standalone sighting
 *     was on an EARLIER UTC day, and that check is the `where` of the update
 *     itself, so two concurrent requests on the same day move it once. The
 *     reward needs `pwa.install_reward_min_days` (default 2) separate days.
 *  2. ONCE PER ACCOUNT. The payout is a compare-and-set on
 *     `pwaRewardedAt IS NULL` inside the same transaction as the ledger row,
 *     and the ledger row's reference `pwa_install_<userId>` is unique per user
 *     (`@@unique([userId, reference])`). Either guard alone stops a double pay.
 *  3. REAL ACCOUNTS ONLY. ACTIVE status (checked inside the CAS) and never
 *     staff. Multi-account farming is the device/IP rules' job, as for every
 *     other one-time bonus.
 *  4. RATE-LIMITED. /api/pwa/seen caps each user per hour (DB-backed).
 *
 * The Events/Missions action `PWA_INSTALLED` follows the same min-days rule
 * and is deduped per goal per user by goal-progress.ts (`pwa:<userId>`).
 */

export const PWA_REWARD_REFERENCE = (userId: string) => `pwa_install_${userId}`;

export async function getPwaRewardConfig(): Promise<PwaRewardConfig> {
  const [enabled, points, minDays] = await Promise.all([
    getSetting<unknown>(PWA_SETTING_KEYS.enabled, PWA_REWARD_DEFAULTS.enabled),
    getSetting<unknown>(PWA_SETTING_KEYS.points, PWA_REWARD_DEFAULTS.points),
    getSetting<unknown>(PWA_SETTING_KEYS.minDays, PWA_REWARD_DEFAULTS.minDays),
  ]);
  return normalizePwaRewardConfig({ enabled, points, minDays });
}

/** Midnight UTC today. */
function utcToday(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface PwaSeenInput {
  platform: PwaPlatform;
  /** True when the page reported it is running as the installed app. */
  standalone: boolean;
  /** The browser's `appinstalled` event (fires in the browser tab, not the app). */
  installedEvent: boolean;
  host: string | null;
}

export interface PwaSeenResult {
  newDay: boolean;
  days: number;
  paid: number;
}

/**
 * Record one sighting. Only a standalone sighting counts a day; the
 * `appinstalled` event only stamps the first-seen date and platform, so an
 * install the user immediately removes is still visible to the admin but pays
 * nothing.
 */
/**
 * The app was removed. Chrome and Edge only offer "Install app"
 * (`beforeinstallprompt`) when it is NOT installed, so a user who had it and
 * is offered it again in a browser on the SAME platform has uninstalled it.
 * A different platform proves nothing (the phone may still have it), so that
 * is ignored. Once per removal: the stamp stays until the app is opened
 * installed again (recordPwaSeen clears it).
 */
export async function recordPwaUninstalled(userId: string, platform: PwaPlatform): Promise<boolean> {
  const r = await prisma.user.updateMany({
    where: {
      id: userId,
      pwaFirstSeenAt: { not: null },
      pwaUninstalledAt: null,
      pwaPlatform: platform,
    },
    data: { pwaUninstalledAt: new Date() },
  });
  return r.count > 0;
}

export async function recordPwaSeen(userId: string, input: PwaSeenInput): Promise<PwaSeenResult> {
  const now = new Date();
  const out: PwaSeenResult = { newDay: false, days: 0, paid: 0 };

  if (!input.standalone && !input.installedEvent) return out;

  // Installed again (opened from the home screen, or the browser's install
  // event): whatever earlier "uninstalled" signal there was no longer holds.
  await prisma.user.updateMany({
    where: { id: userId, pwaUninstalledAt: { not: null } },
    data: { pwaUninstalledAt: null },
  });

  // The browser's install event only stamps the first-seen date (rare: once).
  if (!input.standalone) {
    await prisma.user.updateMany({
      where: { id: userId, pwaFirstSeenAt: null },
      data: { pwaFirstSeenAt: now, pwaPlatform: input.platform },
    });
    return out;
  }

  // ONE statement per user per day: it only matches when the last sighting was
  // before today (UTC), so a repeat the same day changes nothing and costs one
  // cheap no-op — and the day check sits in the WHERE, so it is race-safe.
  const rows = await prisma.$queryRaw<
    { pwaDays: number; pwaRewardedAt: Date | null; status: string; role: string }[]
  >`
    UPDATE "User"
       SET "pwaDays" = "pwaDays" + 1,
           "pwaLastSeenAt" = ${now},
           "pwaFirstSeenAt" = COALESCE("pwaFirstSeenAt", ${now}),
           "pwaPlatform" = ${input.platform},
           "pwaHost" = COALESCE(${input.host}, "pwaHost")
     WHERE "id" = ${userId}
       AND ("pwaLastSeenAt" IS NULL OR "pwaLastSeenAt" < ${utcToday(now)})
 RETURNING "pwaDays", "pwaRewardedAt", "status"::text AS "status", "role"::text AS "role"`;
  const user = rows[0];
  if (!user) return out;
  out.newDay = true;
  out.days = user.pwaDays;

  // Staff and inactive accounts are tracked but never rewarded or credited.
  if (isStaffRole(user.role as never) || user.status !== UserStatus.ACTIVE) return out;

  const cfg = await getPwaRewardConfig();
  if (user.pwaDays < cfg.minDays) return out;

  // Events/Missions "Install the app". Deduped per goal per user, so calling
  // it on each qualifying day is harmless — and it lets someone who installed
  // before the event was published count when they next open the app.
  await recordUserAction({ userId, action: "pwa_installed", targetId: userId });

  if (cfg.enabled && cfg.points > 0 && !user.pwaRewardedAt) {
    out.paid = await payInstallReward(userId, cfg, input.platform);
  }
  return out;
}

/** Account must be at least this old before the install bonus pays. */
const MIN_ACCOUNT_AGE_MS = 3 * 86_400_000;

/**
 * The anti-farm checks, run only on the day a user would be paid (once in an
 * account's life), so their queries cost nothing day to day. The install
 * signal itself comes from the browser and could be faked; what makes faking
 * worthless is that the bonus needs a real, used account on a device that has
 * not already collected it for another account.
 */
async function rewardBlockedReason(userId: string): Promise<string | null> {
  const [user, approved, devices] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, emailVerified: true } }),
    prisma.taskSubmission.count({
      where: { userId, status: { in: ["APPROVED", "AUTO_APPROVED"] } },
      take: 1,
    }),
    prisma.userDevice.findMany({ where: { userId }, select: { deviceId: true, fpHash: true }, take: 20 }),
  ]);
  if (!user) return "no account";
  if (Date.now() - user.createdAt.getTime() < MIN_ACCOUNT_AGE_MS) return "account younger than 3 days";
  if (!user.emailVerified) return "email not verified";
  if (approved === 0) return "no approved task yet";
  const ids = devices.map((d) => d.deviceId).filter(Boolean);
  const fps = devices.map((d) => d.fpHash).filter((x): x is string => !!x);
  if (ids.length === 0 && fps.length === 0) return "no known device";
  const shared = await prisma.userDevice.findFirst({
    where: {
      userId: { not: userId },
      OR: [
        ...(ids.length ? [{ deviceId: { in: ids } }] : []),
        ...(fps.length ? [{ fpHash: { in: fps } }] : []),
      ],
      user: { pwaRewardedAt: { not: null } },
    },
    select: { userId: true },
  });
  if (shared) {
    raiseAbuseSignal({
      kind: "FRAUD_PATTERN",
      severity: "LOW",
      userId,
      entityType: "user",
      entityId: userId,
      summary: "App install bonus refused: this device already earned it on another account",
      evidence: { otherUserId: shared.userId },
    });
    return "device already rewarded on another account";
  }
  return null;
}

/** Pay the install reward once. Returns the points paid (0 when not paid). */
async function payInstallReward(userId: string, cfg: PwaRewardConfig, platform: PwaPlatform): Promise<number> {
  const points = cfg.points;
  const blocked = await rewardBlockedReason(userId);
  if (blocked) return 0;
  let paid = false;
  try {
    const pointsPerUsd = await getPointsPerUsd();
    paid = await prisma.$transaction(
      async (tx) => {
        // The CAS: only one request can move pwaRewardedAt off null.
        const won = await tx.user.updateMany({
          where: {
            id: userId,
            pwaRewardedAt: null,
            status: UserStatus.ACTIVE,
            pwaDays: { gte: cfg.minDays },
          },
          data: { pwaRewardedAt: new Date() },
        });
        if (won.count !== 1) return false;
        await creditPoints(tx, {
          userId,
          points,
          type: TransactionType.EARNING,
          description: "App install bonus",
          reference: PWA_REWARD_REFERENCE(userId),
          metadata: { source: "pwa_install", platform, minDays: cfg.minDays },
          pointsPerUsd,
        });
        return true;
      },
      { timeout: 10_000, maxWait: 5_000 }
    );
  } catch (err) {
    if (!isDuplicateLedgerError(err)) console.error("[pwa-install] reward failed for", userId, err);
    return 0;
  }
  if (!paid) return 0;

  const amount = `${points.toLocaleString()} points`;
  await Promise.all([
    notifyUser({
      userId,
      title: "App installed",
      message: `App installed — +${amount}. Thanks for using the app!`,
      link: "/wallet",
      popup: {
        kind: "achievement",
        headline: "App installed",
        amount: `+${amount}`,
        sub: "Your install bonus has been added to your balance.",
        cta: { label: "View wallet", href: "/wallet" },
      },
    }).catch(() => {}),
    writeAudit({
      actorId: userId,
      action: "PWA_INSTALL_REWARD",
      entity: "User",
      entityId: userId,
      targetUserId: userId,
      summary: `App install bonus paid: ${amount} (${platform})`,
      meta: { points, platform, reference: PWA_REWARD_REFERENCE(userId) },
    }).catch(() => {}),
  ]);
  return points;
}

/**
 * For the user-side card, from a user row the caller already read (the
 * dashboard's own query) — no query here. Staff and inactive accounts are
 * never offered it.
 */
export function pwaRewardStatus(
  cfg: PwaRewardConfig,
  user: {
    pwaDays: number;
    pwaFirstSeenAt: Date | null;
    pwaRewardedAt: Date | null;
    status: string;
    role: string;
  }
): PwaRewardStatus {
  const eligibleAccount = user.status === UserStatus.ACTIVE && !isStaffRole(user.role as never);
  return {
    offered: cfg.enabled && cfg.points > 0 && eligibleAccount,
    points: cfg.points,
    minDays: cfg.minDays,
    days: user.pwaDays,
    installed: !!user.pwaFirstSeenAt,
    rewarded: !!user.pwaRewardedAt,
  };
}
