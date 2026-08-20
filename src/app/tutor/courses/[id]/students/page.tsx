import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { ChevronLeft, Users, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function TutorCourseStudentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, title: true, tutorId: true, enrollmentCount: true },
  });
  if (!course) notFound();
  if (course.tutorId !== session.user.id) redirect("/tutor/courses");

  const enrollmentsRaw = await prisma.courseEnrollment.findMany({
    where: { courseId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: {
        select: { id: true, name: true, email: true, avatar: true, country: true },
      },
    },
  });
  const enrollments = enrollmentsRaw as unknown as Array<{
    id: string;
    progress: number;
    completedAt: Date | null;
    createdAt: Date;
    pricePaid: number;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
      country: string | null;
    };
  }>;
  type Enrollment = (typeof enrollments)[number];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/tutor/courses/${id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to course
        </Link>
        <h1 className="text-2xl font-bold text-white mt-1 inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-300" />
          Enrolled students
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {course.title} — {course.enrollmentCount} total enrolment{course.enrollmentCount === 1 ? "" : "s"}.
        </p>
      </div>

      <AdminTable<Enrollment>
        rows={enrollments}
        getRowKey={(e) => e.id}
        empty={
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center">
            <Search className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-white font-bold">No enrolments yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Once a student enrols, they&apos;ll show up here with live progress.
            </p>
          </div>
        }
        columns={[
          {
            key: "student",
            header: "Student",
            primary: true,
            cell: (e) => (
              <div className="flex items-center gap-2">
                {e.user.avatar ? (
                  <SmartImage
                    src={e.user.avatar}
                    alt=""
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover bg-slate-800"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                    {(e.user.name ?? e.user.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white truncate font-medium">
                    {e.user.name ?? "—"}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {e.user.email}
                  </p>
                </div>
              </div>
            ),
          },
          {
            key: "country",
            header: "Country",
            cell: (e) => <span className="text-slate-400">{e.user.country ?? "—"}</span>,
          },
          {
            key: "progress",
            header: "Progress",
            cell: (e) => <ProgressBar value={e.progress} />,
          },
          {
            key: "paid",
            header: "Paid",
            cell: (e) => (
              <span className="text-emerald-300 tabular-nums">
                {usd(e.pricePaid)}
              </span>
            ),
          },
          {
            key: "enrolled",
            header: "Enrolled",
            className: "whitespace-nowrap",
            cell: (e) => (
              <span className="text-slate-400">
                {formatDistanceToNow(e.createdAt, { addSuffix: true })}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (e) =>
              e.completedAt ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-medium">
                  Completed
                </span>
              ) : e.progress > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-medium">
                  Learning
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 text-xs font-medium">
                  Not started
                </span>
              ),
          },
        ]}
      />
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-400 tabular-nums w-9 text-right">
        {pct}%
      </span>
    </div>
  );
}
