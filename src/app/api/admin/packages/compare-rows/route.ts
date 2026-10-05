import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting, saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { COMPARE_ROWS_SETTING, sanitizeCompareRows } from "@/lib/plan-compare";

// Which rows the plan comparison table shows users (/packages + home page).
// The VALUES always come from the plans' real switches; only the choice of
// rows is the admin's.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "packages.view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ rows: sanitizeCompareRows(await getSetting<unknown>(COMPARE_ROWS_SETTING, null)) });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "packages.edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { rows?: unknown };
  const rows = sanitizeCompareRows(body.rows);
  await saveSetting(COMPARE_ROWS_SETTING, rows, "packages");
  await writeAudit({
    actorId: session.user.id,
    action: "UPDATE",
    entity: "Package",
    summary: `Plan comparison now shows ${rows.length} rows`,
    meta: { rows },
  });
  return NextResponse.json({ rows });
}
