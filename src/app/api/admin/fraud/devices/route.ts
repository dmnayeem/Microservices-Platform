import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { csvFilename, csvResponse, csvTextCell, toCsv } from "@/lib/csv";
import { describeUserAgent } from "@/lib/user-agent";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * GET — every user with the devices, IPs, browser and country they have been
 * seen with, as a CSV. One row per user per device; a user never seen since
 * device tracking began gets one row with their sign-up / last IP.
 *
 * IPs are personal data: `fraud.view` only, and every export is audited.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "fraud.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, devices] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, status: true, signupIp: true, lastIp: true, country: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userDevice.findMany({ orderBy: { lastSeenAt: "desc" } }),
  ]);

  // How many accounts share each device and each IP — the columns an admin
  // sorts by to find a farm.
  const perDevice = new Map<string, Set<string>>();
  const perIp = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string | null | undefined, u: string) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(u);
  };
  for (const d of devices) {
    add(perDevice, d.deviceId, d.userId);
    for (const ip of d.ips) add(perIp, ip, d.userId);
  }
  for (const u of users) {
    add(perIp, u.signupIp, u.id);
    add(perIp, u.lastIp, u.id);
  }

  const byUser = new Map<string, typeof devices>();
  for (const d of devices) {
    if (!byUser.has(d.userId)) byUser.set(d.userId, []);
    byUser.get(d.userId)!.push(d);
  }

  const rows = users.flatMap((u) => {
    const base = [u.id, u.name ?? "", u.email, u.role, u.status, u.createdAt.toISOString(), csvTextCell(u.signupIp), csvTextCell(u.lastIp)];
    const ds = byUser.get(u.id) ?? [];
    if (ds.length === 0) {
      return [[...base, "", "", "", "", "", u.country ?? "", "", "", "", "", perIp.get(u.lastIp ?? u.signupIp ?? "")?.size ?? ""]];
    }
    return ds.map((d) => [
      ...base,
      d.deviceId,
      describeUserAgent(d.userAgent),
      d.userAgent ?? "",
      csvTextCell(d.lastIp),
      d.ips.join(" "),
      d.country ?? u.country ?? "",
      d.firstSeenAt.toISOString(),
      d.lastSeenAt.toISOString(),
      d.seenCount,
      perDevice.get(d.deviceId)?.size ?? 1,
      perIp.get(d.lastIp ?? "")?.size ?? "",
    ]);
  });

  await writeAudit({
    actorId: session.user.id,
    action: "USER_DEVICES_EXPORTED",
    entity: "UserDevice",
    summary: `Exported IPs and devices for ${users.length} users`,
  }).catch(() => {});

  const csv = toCsv(
    [
      "User ID", "Name", "Email", "Role", "Status", "Joined", "Sign-up IP", "Last IP",
      "Device ID", "Browser / OS", "User agent", "Device last IP", "Device IPs", "Country",
      "First seen", "Last seen", "Times seen", "Accounts on this device", "Accounts on this IP",
    ],
    rows
  );
  return csvResponse(csv, csvFilename("users-ips-devices"));
}
