import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { readDevice } from "@/lib/device";
import { isStaffRole } from "@/lib/staff";

/**
 * One account per device, at sign-in (Fraud Control → Devices).
 *
 * Many honest people share one WiFi / IP, so the IP is never the rule; the
 * device id (`eg_did`, set by the page beacon on every visit) is. The account
 * that first used a device keeps it; any OTHER member account signing in on
 * that device is refused. Staff are never blocked, and the admin can exempt
 * addresses (a family sharing one phone, say).
 *
 * No device id (first ever visit, cookies cleared) = nothing to compare: the
 * sign-in goes ahead, and the beacon records the device for next time.
 */

export const ONE_ACCOUNT_PER_DEVICE_KEY = "antifraud.one_account_per_device";
export const DEVICE_LOGIN_EXEMPT_KEY = "antifraud.device_login_exempt";

export async function deviceLoginBlocked(user: { id: string; email: string; role: string }): Promise<boolean> {
  try {
    const on = (await getSetting<boolean>(ONE_ACCOUNT_PER_DEVICE_KEY, true)) !== false;
    if (!on || isStaffRole(user.role)) return false;
    const exempt = String((await getSetting<string>(DEVICE_LOGIN_EXEMPT_KEY, "")) ?? "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (exempt.includes(user.email.toLowerCase())) return false;

    const { deviceId } = await readDevice();
    if (!deviceId) return false;

    // Everyone this device has carried, oldest first — the first owner keeps it.
    const rows = await prisma.userDevice.findMany({
      where: { deviceId },
      orderBy: { firstSeenAt: "asc" },
      select: { userId: true },
      take: 20,
    });
    const others = [...new Set(rows.map((r) => r.userId))].filter((id) => id !== user.id);
    if (others.length === 0) return false;
    const members = await prisma.user.findMany({
      where: { id: { in: others }, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
      select: { id: true, role: true, email: true },
    });
    const otherMembers = members.filter((m) => !isStaffRole(m.role) && !exempt.includes(m.email.toLowerCase()));
    if (otherMembers.length === 0) return false;
    const firstOwner = rows.find((r) => r.userId === user.id || otherMembers.some((m) => m.id === r.userId))?.userId;
    if (firstOwner === user.id) return false;

    const { raiseAbuseSignal } = await import("@/lib/abuse/signal");
    raiseAbuseSignal({
      kind: "FRAUD_PATTERN",
      severity: "MEDIUM",
      userId: user.id,
      entityType: "device",
      entityId: deviceId,
      summary: "Sign-in refused: this device already belongs to another member account",
      evidence: { deviceId, otherAccounts: otherMembers.map((m) => m.id).slice(0, 5) },
    });
    return true;
  } catch (e) {
    console.error("[device-login] check failed:", e);
    return false; // a lookup failure must never lock an honest member out
  }
}
