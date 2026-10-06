import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Percent, Info, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getCourseCommissionConfig } from "@/lib/course-commission";
import { CourseCommissionForm } from "./_components/CourseCommissionForm";
import { RefundWindowForm } from "./_components/RefundWindowForm";
import { CourseNumberSettingForm } from "./_components/CourseNumberSettingForm";
import { getCourseSettings } from "@/lib/course-settings";

export default async function CourseSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "courses.view"))) redirect("/admin");

  const [config, categories, courseSettings, rules] = await Promise.all([
    getCourseCommissionConfig(),
    prisma.courseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true },
    }),
    prisma.systemSetting.findUnique({ where: { key: "course_settings" } }),
    getCourseSettings(),
  ]);
  // Read exactly as api/courses/[id]/refund reads it — 30 days when unset.
  const storedWindow =
    courseSettings?.value && typeof courseSettings.value === "object"
      ? (courseSettings.value as { refundWindowDays?: unknown }).refundWindowDays
      : undefined;
  const refundWindowDays =
    typeof storedWindow === "number" && storedWindow >= 0 ? storedWindow : 30;

  const canEdit = await can(session.user.id, "courses.manage");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/courses"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Courses
        </Link>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2 mt-1">
          <Percent className="w-6 h-6 text-indigo-300" />
          Course settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Platform&apos;s cut on every enrolment, and the student refund window.
          Tutors keep the remainder. Per-course overrides set in the course
          builder always win.
        </p>
      </div>

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-indigo-300 mt-0.5 shrink-0" />
        <p className="text-xs text-indigo-100/90 leading-relaxed">
          Rates are in <strong>basis points</strong> (1 bps = 0.01%). 2000 bps = 20%.
          Resolution order: per-course override → per-category rate → default.
        </p>
      </div>

      <CourseCommissionForm
        initial={config}
        categories={categories}
        canEdit={canEdit}
      />

      <RefundWindowForm initial={refundWindowDays} canEdit={canEdit} />

      <CourseNumberSettingForm
        field="refundMaxProgressPercent"
        title="Refund progress limit"
        description="A student who has completed more than this share of a course can no longer ask for a refund. 100 = no limit (progress never blocks a refund)."
        unit="Percent"
        min={0}
        max={100}
        initial={rules.refundMaxProgressPercent}
        canEdit={canEdit}
      />

      <CourseNumberSettingForm
        field="tutorPayoutHoldDays"
        title="Tutor payout hold"
        description="Days a tutor's share of a paid enrolment is held before it reaches their wallet. The hold is never shorter than the refund window, so a refund always comes out of money not yet paid. Applies to new sales only."
        unit="Days"
        min={0}
        max={365}
        initial={rules.tutorPayoutHoldDays}
        canEdit={canEdit}
      />
    </div>
  );
}
