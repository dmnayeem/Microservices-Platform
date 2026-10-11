import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getFraudConfig } from "@/lib/fraud";

/**
 * VPN / proxy detection, and what it may lock (Fraud Control → VPN).
 *
 * Two sources: the admin's own IP prefix list (instant), and — when switched
 * on — proxycheck.io (works without a key at a small daily allowance; a free
 * key raises it). Each IP's answer is cached a week in IpReputation, so the
 * provider is asked about an IP at most once a week.
 *
 * Detection runs whether or not anything is BLOCKED: every member seen on a
 * VPN is recorded (User.vpnLastSeenAt / vpnLastIp / vpnSeenCount) for the
 * "VPN users" list. Blocking is separate and admin-chosen:
 *   - task work, site-wide       (antifraud.vpn_block_enabled — as before)
 *   - every task                 (antifraud.vpn_block_all_tasks)
 *   - one task                   (Task.blockVpn)
 *   - chosen pages               (antifraud.vpn_locked_paths)
 */

export const VPN_PROVIDER_KEY = "antifraud.vpn_provider";
export const VPN_API_KEY_KEY = "antifraud.vpn_api_key";
export const VPN_LOCKED_PATHS_KEY = "antifraud.vpn_locked_paths";
export const VPN_BLOCK_ALL_TASKS_KEY = "antifraud.vpn_block_all_tasks";

const CACHE_DAYS = 7;
const TIMEOUT_MS = 2500;

export interface VpnSettings {
  provider: "none" | "proxycheck";
  apiKey: string;
  ranges: string[];
  blockTaskWork: boolean;
  blockAllTasks: boolean;
  lockedPaths: string[];
}

export async function getVpnSettings(): Promise<VpnSettings> {
  const [fraud, provider, apiKey, paths, allTasks] = await Promise.all([
    getFraudConfig(),
    getSetting<string>(VPN_PROVIDER_KEY, "none"),
    getSetting<string>(VPN_API_KEY_KEY, ""),
    getSetting<string>(VPN_LOCKED_PATHS_KEY, ""),
    getSetting<boolean>(VPN_BLOCK_ALL_TASKS_KEY, false),
  ]);
  return {
    provider: provider === "proxycheck" ? "proxycheck" : "none",
    apiKey: String(apiKey ?? "").trim(),
    ranges: fraud.vpnRanges,
    blockTaskWork: fraud.vpnBlockEnabled,
    blockAllTasks: allTasks === true,
    lockedPaths: String(paths ?? "")
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter((p) => p.startsWith("/")),
  };
}

const usable = (ip: string | null | undefined): ip is string =>
  !!ip && ip !== "unknown" && !/^(127\.|10\.|192\.168\.|::1$|fc|fd)/.test(ip);

async function askProxycheck(ip: string, apiKey: string): Promise<{ isVpn: boolean; kind: string | null } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ""}`;
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    if (d.status !== "ok" && d.status !== "warning") return null;
    const row = d[ip] as { proxy?: string; type?: string } | undefined;
    if (!row) return null;
    return { isVpn: row.proxy === "yes", kind: row.type ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Is this IP a VPN / proxy? null = couldn't tell (no source, or the provider didn't answer). */
export async function detectVpn(ip: string | null | undefined, s?: VpnSettings): Promise<boolean | null> {
  if (!usable(ip)) return null;
  const cfg = s ?? (await getVpnSettings());
  if (cfg.ranges.some((prefix) => ip.startsWith(prefix))) return true;
  if (cfg.provider === "none") return cfg.ranges.length ? false : null;

  const cached = await prisma.ipReputation.findUnique({ where: { ip } }).catch(() => null);
  if (cached && cached.checkedAt.getTime() > Date.now() - CACHE_DAYS * 86_400_000) return cached.isVpn;

  const answer = await askProxycheck(ip, cfg.apiKey);
  if (!answer) return cached ? cached.isVpn : null;
  await prisma.ipReputation
    .upsert({
      where: { ip },
      create: { ip, isVpn: answer.isVpn, kind: answer.kind, provider: "proxycheck" },
      update: { isVpn: answer.isVpn, kind: answer.kind, provider: "proxycheck", checkedAt: new Date() },
    })
    .catch(() => {});
  return answer.isVpn;
}

/** Record that a member was seen on a VPN (at most once an hour per IP). */
export async function noteVpnUser(userId: string, ip: string): Promise<void> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  await prisma.user
    .updateMany({
      where: { id: userId, OR: [{ vpnLastSeenAt: null }, { vpnLastSeenAt: { lt: hourAgo } }, { vpnLastIp: { not: ip } }] },
      data: { vpnLastSeenAt: new Date(), vpnLastIp: ip, vpnSeenCount: { increment: 1 } },
    })
    .catch(() => {});
}

/** Detect and record in one go; returns whether the member is on a VPN right now. */
export async function checkAndNoteVpn(userId: string, ip: string | null | undefined, s?: VpnSettings): Promise<boolean> {
  const vpn = await detectVpn(ip, s);
  if (vpn && ip) await noteVpnUser(userId, ip);
  return vpn === true;
}

/** Does a VPN lock cover this path? (prefix match: "/withdrawal" covers "/withdrawal/x") */
export function pathVpnLocked(path: string, locked: string[]): boolean {
  return locked.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}
