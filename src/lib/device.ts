import "server-only";
import { countryOfIp } from "@/lib/geo";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getFraudConfig, accountsOnIp, recordFraudEvent } from "@/lib/fraud";

/**
 * Devices, for multi-account detection that works in the real world.
 *
 * An IP is a weak signal: a home or office WiFi puts many honest people
 * behind one address, and one person's mobile data changes address all day.
 * A DEVICE is the strong one — several accounts from the same browser is what
 * account farming actually looks like.
 *
 * The device is identified by:
 *   eg_did  a random id the site stores in a cookie AND localStorage
 *           (DeviceBeacon). Reliable; a determined user can clear it.
 *   eg_fp   a coarse fingerprint (browser, OS, screen, timezone, language…)
 *           that survives clearing cookies on the same browser. Identical
 *           office laptops can share one, so it only ever flags.
 */

export const DEVICE_COOKIE = "eg_did";
export const FP_COOKIE = "eg_fp";
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface SeenDevice {
  deviceId: string | null;
  fpHash: string | null;
  ip: string | null;
  userAgent: string | null;
  country: string | null;
}

const clean = (v: string | undefined | null) => (v && ID_RE.test(v) ? v : null);
const usableIp = (ip: string | null | undefined) =>
  ip && ip !== "unknown" && ip !== "127.0.0.1" && ip !== "::1" ? ip : null;

/** The current request's device, IP, browser and country (from Vercel's geo header). */
export async function readDevice(): Promise<SeenDevice> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const ip =
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    null;
  return {
    deviceId: clean(c.get(DEVICE_COOKIE)?.value),
    fpHash: clean(c.get(FP_COOKIE)?.value),
    ip: usableIp(ip),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
    country: (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null)?.toUpperCase() ?? null,
  };
}

/** Record that this user was seen on this device. Never throws. */
export async function recordDevice(userId: string, seen: SeenDevice): Promise<void> {
  // Vercel's own geo header when present, else the offline IP lookup.
  const d = { ...seen, country: seen.country ?? countryOfIp(seen.ip) };
  // Keep the account's last IP + country current for everyone who uses the
  // app — not only for those who start a task, which used to be the only
  // place `lastIp` was written.
  if (d.ip) {
    await prisma.user
      .update({ where: { id: userId }, data: { lastIp: d.ip, ...(d.country ? { lastCountry: d.country } : {}) } })
      .catch(() => {});
  }
  if (!d.deviceId) return;
  try {
    const existing = await prisma.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId: d.deviceId } },
      select: { id: true, ips: true },
    });
    const ips = d.ip ? [d.ip, ...(existing?.ips ?? []).filter((x) => x !== d.ip)].slice(0, 10) : existing?.ips ?? [];
    if (existing) {
      await prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          seenCount: { increment: 1 },
          ips,
          ...(d.ip ? { lastIp: d.ip } : {}),
          ...(d.fpHash ? { fpHash: d.fpHash } : {}),
          ...(d.userAgent ? { userAgent: d.userAgent } : {}),
          ...(d.country ? { country: d.country } : {}),
        },
      });
    } else {
      await prisma.userDevice.create({
        data: {
          userId,
          deviceId: d.deviceId,
          fpHash: d.fpHash,
          userAgent: d.userAgent,
          lastIp: d.ip,
          ips,
          country: d.country,
        },
      });
    }
  } catch {
    /* a race between two tabs inserting the same row is harmless */
  }
}

/** Distinct accounts seen on this device (optionally not counting one user). */
export async function accountsOnDevice(deviceId: string | null, excludeUserId?: string): Promise<number> {
  if (!deviceId) return 0;
  const rows = await prisma.userDevice.findMany({
    where: { deviceId, ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

async function accountsOnFp(fpHash: string | null, excludeUserId?: string): Promise<number> {
  if (!fpHash) return 0;
  const rows = await prisma.userDevice.findMany({
    where: { fpHash, ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

export type SignupCheck = { ok: true } | { ok: false; error: string };

/**
 * May a NEW account be created from this device / IP? Used by email sign-up
 * and by Google sign-up (which used to skip the IP check entirely).
 *
 *   device over the limit  → the admin's device action (block by default)
 *   fingerprint over it    → flag only (identical laptops share fingerprints)
 *   IP over its limit      → the admin's IP action (flag by default)
 *
 * Every hit is a FraudEvent the Fraud Monitor lists; nothing here adds fraud
 * RISK — a new account has none to add to.
 */
export async function checkSignup(d: SeenDevice, email?: string): Promise<SignupCheck> {
  const cfg = await getFraudConfig();
  const base = { ipAddress: d.ip, userAgent: d.userAgent };

  if (cfg.maxAccountsPerDevice > 0 && d.deviceId) {
    const n = await accountsOnDevice(d.deviceId);
    if (n >= cfg.maxAccountsPerDevice) {
      await recordFraudEvent({
        ...base,
        eventType: "MULTIPLE_ACCOUNTS_DEVICE",
        severity: "HIGH",
        details: { at: "signup", accountsOnDevice: n, cap: cfg.maxAccountsPerDevice, action: cfg.deviceLimitAction, email, deviceId: d.deviceId },
      });
      if (cfg.deviceLimitAction === "block") {
        return { ok: false, error: `This device already has ${n} accounts — the limit is ${cfg.maxAccountsPerDevice}.` };
      }
    } else if (d.fpHash && (await accountsOnFp(d.fpHash)) >= cfg.maxAccountsPerDevice) {
      await recordFraudEvent({
        ...base,
        eventType: "MULTIPLE_ACCOUNTS_FINGERPRINT",
        severity: "MEDIUM",
        details: { at: "signup", cap: cfg.maxAccountsPerDevice, email, note: "same browser fingerprint — may be identical devices, review only" },
      });
    }
  }

  if (cfg.maxUsersPerIp > 0 && d.ip) {
    const n = await accountsOnIp(d.ip);
    if (n >= cfg.maxUsersPerIp) {
      await recordFraudEvent({
        ...base,
        eventType: "MULTIPLE_ACCOUNTS",
        severity: cfg.ipLimitAction === "block" ? "HIGH" : "LOW",
        details: { at: "signup", accountsOnIp: n, cap: cfg.maxUsersPerIp, action: cfg.ipLimitAction, email },
      });
      if (cfg.ipLimitAction === "block") {
        return { ok: false, error: "Too many accounts have been created from this network. Please try from a different connection." };
      }
    }
  }
  return { ok: true };
}

/**
 * A review-only FraudEvent, at most once per `dedupeKey` (e.g. per user per
 * day) — so a busy shared IP does not write an event on every task start.
 */
export async function flagOnce(
  dedupeKey: string,
  e: { userId?: string; eventType: string; ipAddress?: string | null; userAgent?: string | null; details?: Record<string, unknown> }
): Promise<void> {
  try {
    await prisma.fraudEvent.create({
      data: {
        userId: e.userId ?? null,
        eventType: e.eventType,
        severity: "LOW",
        dedupeKey,
        ipAddress: e.ipAddress ?? null,
        userAgent: e.userAgent ?? null,
        details: (e.details ?? {}) as object,
      },
    });
  } catch {
    /* already flagged under this key */
  }
}
