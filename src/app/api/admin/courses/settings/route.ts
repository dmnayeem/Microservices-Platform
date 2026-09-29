import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";

/**
 * PATCH /api/admin/courses/settings — `course_settings.refundWindowDays`.
 *
 * The student refund route (api/courses/[id]/refund) has always read this and
 * defaulted to 30 days; nothing wrote it. Same permission as the commission
 * sibling (`courses.manage`). The row is MERGED, so any other field already
 * stored under `course_settings` is kept exactly as it is.
 */
const schema = z.object({
  refundWindowDays: z
    .number({ message: "Refund window must be a number." })
    .int("Refund window must be a whole number of days.")
    .min(0, "Refund window cannot be negative.")
    .max(365, "Refund window can be at most 365 days."),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "courses.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await req.json().catch(() => null));
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const row = await prisma.systemSetting.findUnique({ where: { key: "course_settings" } });
  const current =
    row?.value && typeof row.value === "object" && !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {};
  const next = { ...current, refundWindowDays: v.data.refundWindowDays };
  await saveSetting("course_settings", next, row?.category ?? "courses");

  await writeAudit({
    actorId: session.user.id,
    action: "COURSE_SETTINGS_UPDATED",
    entity: "SystemSetting",
    entityId: "course_settings",
    summary: `Course refund window set to ${v.data.refundWindowDays} days`,
    meta: { before: current.refundWindowDays ?? null, after: v.data.refundWindowDays },
  }).catch(() => {});

  return NextResponse.json({ ok: true, refundWindowDays: v.data.refundWindowDays });
}
