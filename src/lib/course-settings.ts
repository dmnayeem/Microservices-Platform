import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * `course_settings` — one JSON row, edited at /admin/courses/settings
 * (PATCH /api/admin/courses/settings merges it). One reader for every field.
 */
export const COURSE_SETTING_DEFAULTS = {
  /** Days after enrolling a student may ask for a refund. */
  refundWindowDays: 30,
  /** A refund is refused once the student has completed MORE than this % of the course. 100 = no limit. */
  refundMaxProgressPercent: 50,
  /**
   * Days a tutor's share of a paid enrolment is held before it reaches their
   * wallet. The effective hold is never shorter than the refund window, so a
   * refund always has unpaid money to come from.
   */
  tutorPayoutHoldDays: 30,
} as const;

export type CourseSettings = {
  refundWindowDays: number;
  refundMaxProgressPercent: number;
  tutorPayoutHoldDays: number;
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fallback;
}

export async function getCourseSettings(): Promise<CourseSettings> {
  const row = await prisma.systemSetting
    .findUnique({ where: { key: "course_settings" } })
    .catch(() => null);
  const v =
    row?.value && typeof row.value === "object" && !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {};
  const d = COURSE_SETTING_DEFAULTS;
  return {
    refundWindowDays: num(v.refundWindowDays, d.refundWindowDays, 0, 365),
    refundMaxProgressPercent: num(
      v.refundMaxProgressPercent,
      d.refundMaxProgressPercent,
      0,
      100
    ),
    tutorPayoutHoldDays: num(v.tutorPayoutHoldDays, d.tutorPayoutHoldDays, 0, 365),
  };
}

/** Effective tutor hold in days: the setting, but never under the refund window. */
export function effectiveTutorHoldDays(s: CourseSettings): number {
  return Math.max(s.tutorPayoutHoldDays, s.refundWindowDays);
}
