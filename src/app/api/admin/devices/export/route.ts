import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { csvFilename, csvResponse, toCsv } from "@/lib/csv";
import { deviceListWhere, parseDeviceFilters } from "@/lib/device-report";
import {
  deviceBrandLabel,
  deviceBrowserLabel,
  deviceOsLabel,
  deviceTypeLabel,
} from "@/lib/device-info";
import { userDisplayId } from "@/lib/display-id";

// GET /api/admin/devices/export?range=&type=&os=&brand=&browser=&q= — the
// devices on /admin/devices, with the same filters, as CSV (full user agent).
const MAX_ROWS = 50_000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "analytics.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const f = parseDeviceFilters(Object.fromEntries(request.nextUrl.searchParams));
  const rows = (await prisma.userDevice.findMany({
    where: deviceListWhere(f),
    orderBy: { lastSeenAt: "desc" },
    take: MAX_ROWS,
    select: {
      deviceType: true,
      os: true,
      osVersion: true,
      brand: true,
      model: true,
      browser: true,
      userAgent: true,
      country: true,
      lastIp: true,
      firstSeenAt: true,
      lastSeenAt: true,
      seenCount: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })) as unknown as Array<{
    deviceType: string | null;
    os: string | null;
    osVersion: string | null;
    brand: string | null;
    model: string | null;
    browser: string | null;
    userAgent: string | null;
    country: string | null;
    lastIp: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    seenCount: number;
    user: { id: string; name: string | null; email: string };
  }>;

  const csv = toCsv(
    [
      "User ID",
      "Name",
      "Email",
      "Device type",
      "System",
      "System version",
      "Brand",
      "Model",
      "Browser",
      "Country",
      "Last IP",
      "First seen",
      "Last seen",
      "Times seen",
      "User agent",
    ],
    rows.map((d) => [
      userDisplayId(d.user.id),
      d.user.name,
      d.user.email,
      d.deviceType ? deviceTypeLabel(d.deviceType) : "",
      d.os ? deviceOsLabel(d.os) : "",
      d.osVersion,
      d.brand ? deviceBrandLabel(d.brand) : "",
      d.model,
      d.browser ? deviceBrowserLabel(d.browser) : "",
      d.country,
      d.lastIp,
      d.firstSeenAt.toISOString(),
      d.lastSeenAt.toISOString(),
      d.seenCount,
      d.userAgent,
    ])
  );

  await writeAudit({
    actorId: session.user.id,
    action: "DEVICES_EXPORTED",
    entity: "UserDevice",
    entityId: "export",
    summary: `Exported ${rows.length} device row(s)`,
    meta: { filters: { ...f, since: f.since.toISOString() } },
  });

  return csvResponse(csv, csvFilename("devices"));
}
