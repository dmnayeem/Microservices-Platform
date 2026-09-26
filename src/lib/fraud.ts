import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";

/**
 * Anti-fraud helpers (feature: fraud toggles). Every control is admin-gated via
 * `antifraud.*` SystemSetting keys. IP capture + per-IP account cap + a
 * best-effort VPN/proxy heuristic (no external key — an admin-editable
 * datacenter range list; structured so a provider can be dropped in later).
 */

export type LimitAction = "block" | "flag";

export interface FraudConfig {
  /** Max distinct accounts allowed to sign up / work from one IP (0 = off). */
  maxUsersPerIp: number;
  /**
   * What the IP limit does. "flag" (default) records it for review and lets
   * the person in: a home or office WiFi puts many honest people behind one
   * IP, and one person's mobile data changes IP all day, so an IP is a hint,
   * not proof. "block" refuses, as the setting always did.
   */
  ipLimitAction: LimitAction;
  /** Max accounts on one device (0 = off) — the reliable multi-account signal. */
  maxAccountsPerDevice: number;
  /** What the device limit does: "block" (default) or "flag". */
  deviceLimitAction: LimitAction;
  /** Block requests from IPs that look like a VPN/datacenter/proxy. */
  vpnBlockEnabled: boolean;
  /** Admin-editable CIDR/prefix list treated as VPN/datacenter (best-effort). */
  vpnRanges: string[];
  /** Block task work while an ad-blocker is on. */
  adblockGateEnabled: boolean;
  /** Re-remind (toast) to disable the ad-blocker every N minutes (0 = off). */
  adblockReminderMinutes: number;
}

export const FRAUD_DEFAULTS: FraudConfig = {
  maxUsersPerIp: 0,
  ipLimitAction: "flag",
  maxAccountsPerDevice: 3,
  deviceLimitAction: "block",
  vpnBlockEnabled: false,
  vpnRanges: [],
  adblockGateEnabled: true,
  adblockReminderMinutes: 0,
};

export async function getFraudConfig(): Promise<FraudConfig> {
  try {
    const [mx, vpn, ranges, ag, ar, ipAct, perDev, devAct] = await Promise.all([
      getSetting<number>("antifraud.max_users_per_ip", 0),
      getSetting<boolean>("antifraud.vpn_block_enabled", false),
      getSetting<string>("antifraud.vpn_ranges", ""),
      getSetting<boolean>("antifraud.adblock_gate_enabled", true),
      getSetting<number>("antifraud.adblock_reminder_minutes", 0),
      getSetting<string>("antifraud.ip_limit_action", "flag"),
      getSetting<number>("antifraud.max_accounts_per_device", 3),
      getSetting<string>("antifraud.device_limit_action", "block"),
    ]);
    return {
      maxUsersPerIp: Math.max(0, Math.floor(Number(mx)) || 0),
      ipLimitAction: ipAct === "block" ? "block" : "flag",
      maxAccountsPerDevice: Math.max(0, Math.floor(Number(perDev)) || 0),
      deviceLimitAction: devAct === "flag" ? "flag" : "block",
      vpnBlockEnabled: vpn === true,
      vpnRanges: String(ranges || "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      adblockGateEnabled: ag !== false,
      adblockReminderMinutes: Math.max(0, Math.floor(Number(ar)) || 0),
    };
  } catch {
    return FRAUD_DEFAULTS;
  }
}

const usable = (ip: string | null | undefined): ip is string =>
  !!ip && ip !== "unknown" && ip !== "127.0.0.1" && ip !== "::1";

/**
 * Best-effort VPN/proxy/datacenter check (no external service). Matches the IP
 * against the admin-editable prefix list (`antifraud.vpn_ranges`) — e.g.
 * "45.83.", "2607:5300:". Honest limitation: catches ~50–70%, NOT 100%. A
 * provider (proxycheck.io / IPQualityScore) can later replace the body here
 * behind this same signature.
 */
export function isVpnIp(ip: string | null | undefined, cfg: FraudConfig): boolean {
  if (!cfg.vpnBlockEnabled || !usable(ip)) return false;
  return cfg.vpnRanges.some((prefix) => ip.startsWith(prefix));
}

/**
 * Count how many distinct accounts already exist on this IP. Used to enforce
 * `maxUsersPerIp`. Excludes the given user (so an existing account re-working
 * from its own IP isn't counted against itself).
 */
export async function accountsOnIp(
  ip: string | null | undefined,
  excludeUserId?: string
): Promise<number> {
  if (!usable(ip)) return 0;
  return prisma.user.count({
    where: {
      OR: [{ signupIp: ip }, { lastIp: ip }],
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

/** Record a fraud event so the admin Fraud Monitor shows real data. Best-effort. */
export async function recordFraudEvent(args: {
  userId?: string | null;
  eventType: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.fraudEvent.create({
      data: {
        userId: args.userId ?? null,
        eventType: args.eventType,
        severity: (args.severity ?? "MEDIUM") as never,
        ipAddress: args.ipAddress ?? null,
        userAgent: args.userAgent ?? null,
        details: (args.details ?? {}) as object,
      },
    });
  } catch {
    /* never block the caller on telemetry */
  }
}
