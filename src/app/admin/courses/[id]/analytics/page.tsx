import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SmartImage } from "@/components/user/primitives/smart-image";
import {
  BarChart3,
  Eye,
  Users,
  Heart,
  PlayCircle,
  CheckCircle2,
  Award,
  Star,
  Wallet,
  MessageCircleQuestion,
  ArrowLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "courses.view"))) redirect("/admin");

  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      thumbnail: true,
      uniqueViewers: true,
      enrollmentCount: true,
      avgRating: true,
      totalReviews: true,
      totalRevenueCents: true,
    },
  });
  if (!course) notFound();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [
    totalViews,
    revenueAgg,
    enrollments,
    completions,
    certCount,
    reviewCount,
    questionCount,
    bookmarkCount,
    recentViewsRaw,
    recentEnrollsRaw,
  ] = await Promise.all([
    prisma.courseListingView.count({ where: { courseId: id } }),
    prisma.courseEnrollment.aggregate({
      where: { courseId: id },
      _sum: { pricePaid: true },
    }),
    prisma.courseEnrollment.count({ where: { courseId: id } }),
    prisma.courseEnrollment.count({
      where: { courseId: id, completedAt: { not: null } },
    }),
    prisma.courseCertificate.count({ where: { courseId: id } }),
    prisma.courseReview.count({ where: { courseId: id } }),
    prisma.courseQuestion.count({ where: { courseId: id } }),
    prisma.courseBookmark.count({ where: { courseId: id } }),
    prisma.courseListingView.findMany({
      where: { courseId: id, viewedAt: { gte: fourteenDaysAgo } },
      select: { viewedAt: true },
    }),
    prisma.courseEnrollment.findMany({
      where: { courseId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    }),
  ]);

  const recentEnrolls = recentEnrollsRaw as unknown as Array<{
    id: string;
    pricePaid: number;
    progress: number;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
    };
  }>;

  // Daily-views buckets (14 days)
  const dayBuckets: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayBuckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const dayIndex = new Map(dayBuckets.map((b, i) => [b.date, i]));
  for (const v of recentViewsRaw) {
    const key = v.viewedAt.toISOString().slice(0, 10);
    const i = dayIndex.get(key);
    if (i !== undefined) dayBuckets[i].count += 1;
  }
  const maxDay = Math.max(1, ...dayBuckets.map((b) => b.count));

  const revenue = revenueAgg._sum.pricePaid ?? 0;
  const conversionRate = totalViews > 0 ? (enrollments / totalViews) * 100 : 0;
  const completionRate =
    enrollments > 0 ? (completions / enrollments) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Link
            href="/admin/courses"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Courses
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1 inline-flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-300" />
            Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">{course.title}</p>
        </div>
        <Link
          href={`/admin/courses/${id}/edit`}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
        >
          Edit course
        </Link>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={<Eye />} tone="text-indigo-300" label="Total views" value={totalViews} />
        <Stat icon={<Users />} tone="text-fuchsia-300" label="Unique viewers" value={course.uniqueViewers} />
        <Stat icon={<Heart />} tone="text-rose-300" label="Wishlisted" value={bookmarkCount} />
        <Stat icon={<PlayCircle />} tone="text-emerald-300" label="Enrolments" value={enrollments} />
        <Stat icon={<CheckCircle2 />} tone="text-cyan-300" label="Completions" value={completions} />
        <Stat icon={<Award />} tone="text-amber-300" label="Certificates" value={certCount} />
      </div>

      {/* Conversion + revenue */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat icon={<Wallet />} tone="text-emerald-300" label="Revenue" value={`${usd(revenue)}`} />
        <Stat icon={<BarChart3 />} tone="text-indigo-300" label="View → enrol" value={`${conversionRate.toFixed(1)}%`} />
        <Stat icon={<BarChart3 />} tone="text-cyan-300" label="Enrol → complete" value={`${completionRate.toFixed(1)}%`} />
      </div>

      {/* Daily views */}
      <section className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
        <h2 className="text-base font-bold text-white mb-3">
          Daily views — last 14 days
        </h2>
        <div className="flex items-end gap-1 h-32">
          {dayBuckets.map((b) => {
            const h = (b.count / maxDay) * 100;
            return (
              <div
                key={b.date}
                className="flex-1 flex flex-col items-center justify-end gap-1"
                title={`${b.date}: ${b.count} views`}
              >
                <div
                  className="w-full rounded-t bg-indigo-500/80 hover:bg-indigo-400 transition-colors"
                  style={{ height: `${h}%`, minHeight: b.count > 0 ? 4 : 0 }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-500 tabular-nums">
          <span>{dayBuckets[0].date}</span>
          <span>{dayBuckets[dayBuckets.length - 1].date}</span>
        </div>
      </section>

      {/* Recent enrolments */}
      <section className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white">Recent enrolments</h2>
          <Link
            href={`/admin/courses/${id}/edit`}
            className="text-xs text-indigo-300 hover:text-indigo-200 font-bold"
          >
            View course →
          </Link>
        </div>
        {recentEnrolls.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No enrolments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {recentEnrolls.map((e) => (
              <li key={e.id} className="py-3 flex items-center gap-3">
                {e.user.avatar ? (
                  <SmartImage
                    src={e.user.avatar}
                    alt=""
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover bg-slate-800"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white font-bold">
                    {(e.user.name ?? e.user.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {e.user.name ?? e.user.email ?? "—"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Progress {e.progress}%
                    {" · "}
                    {formatDistanceToNow(e.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <span className="text-xs text-emerald-300 tabular-nums whitespace-nowrap">
                  {usd(e.pricePaid)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Engagement footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat icon={<Star />} tone="text-amber-300" label="Reviews" value={reviewCount} />
        <Stat icon={<MessageCircleQuestion />} tone="text-fuchsia-300" label="Questions" value={questionCount} />
        <Stat icon={<Star />} tone="text-amber-300" label="Avg rating" value={course.avgRating > 0 ? course.avgRating.toFixed(2) : "—"} />
      </div>
    </div>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <p
        className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold ${tone}`}
      >
        <span className="w-3.5 h-3.5">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-white tabular-nums">
        {value}
      </p>
    </div>
  );
}
