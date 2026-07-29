import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  GraduationCap,
  Users,
  Star,
  Wallet,
  PlayCircle,
  BookOpen,
  MessageSquare,
  Plus,
  Clock,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { formatDistanceToNow } from "date-fns";

export default async function TutorDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [profile, courseAgg, courses, recentEnrollments, pendingQuestions] =
    await Promise.all([
      prisma.tutorProfile.findUnique({ where: { userId } }),
      prisma.course.aggregate({
        where: { tutorId: userId },
        _count: { _all: true },
        _sum: { enrollmentCount: true, totalRevenueCents: true },
      }),
      prisma.course.findMany({
        where: { tutorId: userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          enrollmentCount: true,
          avgRating: true,
          updatedAt: true,
        },
      }),
      prisma.courseEnrollment.findMany({
        where: { course: { tutorId: userId } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      prisma.courseQuestion.findMany({
        where: {
          course: { tutorId: userId },
          answeredAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          course: { select: { id: true, title: true } },
          asker: { select: { id: true, name: true, avatar: true } },
        },
      }),
    ]);

  const totalCourses = courseAgg._count._all;
  const totalStudents = courseAgg._sum.enrollmentCount ?? 0;
  const totalRevenue = (courseAgg._sum.totalRevenueCents ?? 0) / 100;
  const avgRating = profile?.avgRating ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-300" />
            Tutor dashboard
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Build courses, track students, earn from every enrolment.
          </p>
        </div>
        <Link
          href="/tutor/courses/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
        >
          <Plus className="w-4 h-4" />
          New course
        </Link>
      </div>

      {profile?.isSuspended && (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-4 text-sm text-rose-200">
          Your tutor account is suspended. You can&apos;t publish or edit courses
          until an admin reinstates it.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<BookOpen className="w-4 h-4" />}
          label="Courses"
          value={totalCourses}
          tone="text-indigo-300"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Students"
          value={totalStudents}
          tone="text-emerald-300"
        />
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label="Lifetime earnings"
          value={`$${totalRevenue.toFixed(2)}`}
          tone="text-amber-300"
        />
        <StatCard
          icon={<Star className="w-4 h-4" />}
          label="Avg rating"
          value={avgRating > 0 ? avgRating.toFixed(2) : "—"}
          tone="text-fuchsia-300"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Your courses" href="/tutor/courses">
          {courses.length === 0 ? (
            <Empty icon={<PlayCircle />} title="No courses yet" cta="Build your first course" href="/tutor/courses/new" />
          ) : (
            <ul className="divide-y divide-gray-800">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/tutor/courses/${c.id}`}
                    className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-gray-800/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">
                        {c.title}
                      </p>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                        <CourseStatusPill status={c.status} />
                        <span>{c.enrollmentCount} students</span>
                        {c.avgRating > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                            {c.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-500">
                      {formatDistanceToNow(c.updatedAt, { addSuffix: true })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent enrolments" href="/tutor/courses">
          {recentEnrollments.length === 0 ? (
            <Empty
              icon={<Users />}
              title="No enrolments yet"
              hint="Once a student enrols in one of your courses they'll show up here."
            />
          ) : (
            <ul className="divide-y divide-gray-800">
              {(recentEnrollments as unknown as Array<{
                id: string;
                createdAt: Date;
                user: { id: string; name: string | null; email: string | null; avatar: string | null };
                course: { id: string; title: string };
              }>).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-3 px-2">
                  {e.user.avatar ? (
                    <SmartImage
                      src={e.user.avatar}
                      alt=""
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full object-cover bg-gray-800"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-white">
                      {(e.user.name ?? e.user.email ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="text-white truncate">
                      <span className="font-bold">{e.user.name ?? "—"}</span>{" "}
                      enrolled in{" "}
                      <Link
                        href={`/tutor/courses/${e.course.id}`}
                        className="text-indigo-300 hover:underline"
                      >
                        {e.course.title}
                      </Link>
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">
                    {formatDistanceToNow(e.createdAt, { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Pending student questions" href={null}>
          {pendingQuestions.length === 0 ? (
            <Empty
              icon={<MessageSquare />}
              title="Inbox clear"
              hint="No unanswered student questions right now."
            />
          ) : (
            <ul className="divide-y divide-gray-800">
              {(pendingQuestions as unknown as Array<{
                id: string;
                question: string;
                createdAt: Date;
                course: { id: string; title: string };
                asker: { id: string; name: string | null; avatar: string | null };
              }>).map((q) => (
                <li key={q.id} className="py-3 px-2">
                  <div className="flex items-start gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-fuchsia-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white line-clamp-2">{q.question}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {q.asker.name ?? "Anonymous"} on{" "}
                        <Link
                          href={`/tutor/courses/${q.course.id}`}
                          className="text-indigo-300 hover:underline"
                        >
                          {q.course.title}
                        </Link>
                        {" · "}
                        {formatDistanceToNow(q.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Tips" href={null}>
          <ul className="text-sm text-gray-300 space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              Add at least 2 modules and 4–6 lessons per module — students drop
              off on courses that feel padded.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              Free preview lessons boost enrolment conversion by ~30%.
            </li>
            <li className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              Reply to student questions within 24h — answer rate is visible to
              new students before they enrol.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wide font-bold ${tone}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-extrabold text-white tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {href && (
          <Link
            href={href}
            className="text-xs text-indigo-300 hover:text-indigo-200 font-bold"
          >
            View all →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({
  icon,
  title,
  hint,
  cta,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="text-center py-8 text-gray-400">
      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 mx-auto mb-2">
        {icon}
      </div>
      <p className="text-sm font-bold text-white">{title}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {cta && href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-indigo-300 hover:text-indigo-200"
        >
          {cta} →
        </Link>
      )}
    </div>
  );
}

function CourseStatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: "Draft", cls: "bg-gray-700/40 text-gray-300" },
    PENDING_REVIEW: {
      label: "In review",
      cls: "bg-amber-500/15 text-amber-300",
    },
    PUBLISHED: { label: "Live", cls: "bg-emerald-500/15 text-emerald-300" },
    SUSPENDED: { label: "Suspended", cls: "bg-rose-500/15 text-rose-300" },
    ARCHIVED: { label: "Archived", cls: "bg-gray-700/40 text-gray-400" },
  };
  const c = cfg[status] ?? cfg.DRAFT;
  return (
    <span
      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
