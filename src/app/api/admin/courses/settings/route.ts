import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";

/**
 * PATCH /api/admin/courses/settings — fields of the `course_settings` row:
 *  - refundWindowDays          days after enrolling a refund may be asked for
 *  - refundMaxProgressPercent  refuse a refund once more than this % is done
 *  - tutorPayoutHoldDays       days a tutor's share is held before payout
 *
 * Read by `getCourseSettings()` (lib/course-settings.ts). Same permission as
 * the commission sibling (`courses.manage`). The row is MERGED, so any field
 * not sent — or any other field stored under `course_settings` — is kept.
 */
const schema = z
  .object({
    refundWindowDays: z
      .number({ message: "Refund window must be a number." })
      .int("Refund window must be a whole number of days.")
      .min(0, "Refund window cannot be negative.")
      .max(365, "Refund window can be at most 365 days.")
      .optional(),
    refundMaxProgressPercent: z
      .number({ message: "Refund progress limit must be a number." })
      .int("Refund progress limit must be a whole percent.")
      .min(0, "Refund progress limit cannot be negative.")
      .max(100, "Refund progress limit can be at most 100%.")
      .optional(),
    tutorPayoutHoldDays: z
      .number({ message: "Tutor payout hold must be a number." })
      .int("Tutor payout hold must be a whole number of days.")
      .min(0, "Tutor payout hold cannot be negative.")
      .max(365, "Tutor payout hold can be at most 365 days.")
      .optional(),
  })
  .refine((o) => Object.values(o).some((x) => x !== undefined), {
    message: "Nothing to save.",
  });

const LABELS: Record<string, string> = {
  refundWindowDays: "Course refund window (days)",
  refundMaxProgressPercent: "Refund progress limit (%)",
  tutorPayoutHoldDays: "Tutor payout hold (days)",
};

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
  const changes = Object.fromEntries(
    Object.entries(v.data).filter(([, x]) => x !== undefined)
  ) as Record<string, number>;
  const next = { ...current, ...changes };
  await saveSetting("course_settings", next, row?.category ?? "courses");

  await writeAudit({
    actorId: session.user.id,
    action: "COURSE_SETTINGS_UPDATED",
    entity: "SystemSetting",
    entityId: "course_settings",
    summary: Object.entries(changes)
      .map(([k, x]) => `${LABELS[k] ?? k} set to ${x}`)
      .join("; "),
    meta: {
      before: Object.fromEntries(Object.keys(changes).map((k) => [k, current[k] ?? null])),
      after: changes,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...changes });
}
