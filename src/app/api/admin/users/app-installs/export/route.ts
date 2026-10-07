import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse, csvFilename } from "@/lib/csv";
import { PWA_ROW_SELECT, parsePwaInstallFilters, pwaInstallWhere } from "@/lib/pwa-admin";

export const runtime = "nodejs";

/** GET — the PWA App list as CSV, same filters as the page. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "users.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filters = parsePwaInstallFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await prisma.user.findMany({
    where: pwaInstallWhere(filters),
    select: PWA_ROW_SELECT,
    orderBy: filters.status === "not" ? { createdAt: "desc" } : { pwaFirstSeenAt: "desc" },
    take: 10_000,
  });

  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  const csv = toCsv(
    ["User ID", "Name", "Username", "Email", "Status", "Joined", "Installed", "Platform", "First seen", "Last seen", "Days opened", "Rewarded at", "Last host", "Uninstalled at"],
    rows.map((u) => [
      u.id,
      u.name ?? "",
      u.username ?? "",
      u.email,
      u.status,
      iso(u.createdAt),
      u.pwaFirstSeenAt ? (u.pwaUninstalledAt ? "removed" : "yes") : "no",
      u.pwaPlatform ?? "",
      iso(u.pwaFirstSeenAt),
      iso(u.pwaLastSeenAt),
      u.pwaDays,
      iso(u.pwaRewardedAt),
      u.pwaHost ?? "",
      iso(u.pwaUninstalledAt),
    ])
  );
  return csvResponse(csv, csvFilename("pwa-app"));
}
