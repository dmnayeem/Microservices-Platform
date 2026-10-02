import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { toCsv, csvResponse, csvFilename } from "@/lib/csv";
import { PUSH_STATE_LABEL, parseReachFilters, reachExport } from "@/lib/notification-reach";

export const runtime = "nodejs";

/** GET — the Notification Reach list as CSV, same filters as the page (two queries). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "users.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filters = parseReachFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await reachExport(filters, 10_000);

  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : "");
  const csv = toCsv(
    ["User ID", "Name", "Username", "Email", "Account status", "Joined", "Push", "Push setting", "Devices", "Email notifications", "App installed", "Platform", "Last active"],
    rows.map((u) => [
      u.id,
      u.name ?? "",
      u.username ?? "",
      u.email,
      u.status,
      iso(u.createdAt),
      PUSH_STATE_LABEL[u.pushState],
      u.pushNotifications ? "on" : "off",
      u.devices,
      u.emailOn ? "on" : "off",
      u.pwaFirstSeenAt ? "yes" : "no",
      u.pwaPlatform ?? "",
      u.lastActive ? iso(u.lastActive).slice(0, 10) : "",
    ])
  );
  return csvResponse(csv, csvFilename("notification-reach"));
}
