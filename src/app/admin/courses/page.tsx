import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import {
  GraduationCap,
  Plus,
  Eye,
  Edit,
  Users,
  CheckCircle,
  FileText,
  Archive,
  ChevronLeft,
  ChevronRight,
  Clock,
  UserCog,
  BarChart3,
  Star,
  Wallet,
  Tag,
  RefreshCcw,
  Percent,
} from "lucide-react";
import { ApproveRejectButtons } from "./_components/ApproveRejectButtons";
import { CourseRowFeatureMenu } from "./_components/CourseRowFeatureMenu";
import { AdminBroadcastDialog } from "./_components/AdminBroadcastDialog";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
}

export default async function CoursesAdminPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "courses.view")) redirect("/admin");

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const statusFilter = params.status || "";

  const where = statusFilter ? { status: statusFilter as never } : {};

  const [
    coursesRaw,
    total,
    _draftCount,
    pendingCount,
    publishedCount,
    suspendedCount,
    archivedCount,
    enrollmentTotal,
    pendingRefunds,
    revenueAgg,
    tutorCount,
    activeStudentsCount,
    completionAgg,
  ] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        _count: { select: { lessons: true, enrollments: true } },
        tutor: { select: { id: true, name: true, email: true, avatar: true } },
      },
    }),
    prisma.course.count({ where }),
    prisma.course.count({ where: { status: "DRAFT" } }),
    prisma.course.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.course.count({ where: { status: "SUSPENDED" } }),
    prisma.course.count({ where: { status: "ARCHIVED" } }),
    prisma.courseEnrollment.count(),
    prisma.courseRefundRequest.count({ where: { status: "PENDING" } }),
    prisma.courseEnrollment.aggregate({ _sum: { pricePaid: true } }),
    prisma.tutorProfile.count(),
    prisma.courseEnrollment.count({
      where: { progress: { gt: 0 }, completedAt: null },
    }),
    prisma.courseEnrollment.aggregate({
      _count: { _all: true },
      where: { completedAt: { not: null } },
    }),
  ]);
  const totalRevenue = revenueAgg._sum.pricePaid ?? 0;
  const completionRate =
    enrollmentTotal === 0
      ? 0
      : ((completionAgg._count._all ?? 0) / enrollmentTotal) * 100;

  type CourseRow = {
    id: string;
    title: string;
    category: string;
    difficulty: string;
    status: string;
    createdAt: Date;
    isFeatured: boolean;
    isPromoted: boolean;
    avgRating: number;
    _count: { lessons: number; enrollments: number };
    tutor: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
    } | null;
  };
  const courses = coursesRaw as unknown as CourseRow[];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canManage = hasPermission(adminRole, "courses.manage");

  const buildHref = (newPage: number) => {
    const sp = new URLSearchParams();
    sp.set("page", String(newPage));
    if (statusFilter) sp.set("status", statusFilter);
    return `/admin/courses?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-blue-400" />
              Course Management
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Listings, tutors, refunds, coupons and settings — all in one place.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <AdminBroadcastDialog />
              <Link
                href="/admin/courses/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                Create Course
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/admin/courses/categories"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold"
          >
            <FileText className="w-3.5 h-3.5" />
            Categories
          </Link>
          <Link
            href="/admin/coupons"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold"
          >
            <Tag className="w-3.5 h-3.5" />
            Coupons
          </Link>
          <Link
            href="/admin/courses/refunds"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Refunds
            {pendingRefunds > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">
                {pendingRefunds}
              </span>
            )}
          </Link>
          <Link
            href="/admin/courses/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold"
          >
            <Percent className="w-3.5 h-3.5" />
            Commission settings
          </Link>
          <Link
            href="/admin/tutors"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold"
          >
            <UserCog className="w-3.5 h-3.5" />
            Tutors
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<CheckCircle className="w-5 h-5" />}
          tone="emerald"
          value={publishedCount}
          label="Published"
        />
        <Stat
          icon={<Users className="w-5 h-5" />}
          tone="blue"
          value={activeStudentsCount}
          label="Active students"
        />
        <Stat
          icon={<UserCog className="w-5 h-5" />}
          tone="slate"
          value={tutorCount}
          label="Total tutors"
        />
        <Stat
          icon={<Wallet className="w-5 h-5" />}
          tone="emerald"
          value={`$${totalRevenue.toFixed(2)}`}
          label="Lifetime revenue"
        />
        <Stat
          icon={<Star className="w-5 h-5" />}
          tone="amber"
          value={`${completionRate.toFixed(0)}%`}
          label="Completion rate"
        />
        <Stat
          icon={<Clock className="w-5 h-5" />}
          tone="amber"
          value={pendingCount}
          label="Pending review"
        />
        <Stat
          icon={<RefreshCcw className="w-5 h-5" />}
          tone="rose"
          value={pendingRefunds}
          label="Refund requests"
        />
        <Stat
          icon={<Archive className="w-5 h-5" />}
          tone="slate"
          value={archivedCount + suspendedCount}
          label="Archived + suspended"
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {[
          { id: "", label: "All" },
          { id: "PUBLISHED", label: "Published" },
          { id: "PENDING_REVIEW", label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          { id: "DRAFT", label: "Drafts" },
          { id: "SUSPENDED", label: "Suspended" },
          { id: "ARCHIVED", label: "Archived" },
        ].map((t) => (
          <Link
            key={t.id || "all"}
            href={t.id ? `/admin/courses?status=${t.id}` : "/admin/courses"}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              statusFilter === t.id || (!statusFilter && !t.id)
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* List */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {courses.length === 0 ? (
          <div className="p-16 text-center">
            <GraduationCap className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-white mb-1">
              No courses yet
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Build a course with lessons and reward students for completion.
            </p>
            {canManage && (
              <Link
                href="/admin/courses/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Create First Course
              </Link>
            )}
          </div>
        ) : (
          <AdminTable
            bare
            rows={courses}
            getRowKey={(c) => c.id}
            columns={[
              {
                key: "course",
                header: "Course",
                primary: true,
                cell: (c) => (
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate max-w-70">
                      {c.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                ),
              },
              {
                key: "tutor",
                header: "Tutor",
                cell: (c) =>
                  c.tutor ? (
                    <div className="flex items-center gap-2 min-w-0">
                      {c.tutor.avatar ? (
                        <SmartImage
                          src={c.tutor.avatar}
                          alt=""
                          width={28}
                          height={28}
                          className="w-7 h-7 rounded-full object-cover bg-slate-800 shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white font-bold shrink-0">
                          {(c.tutor.name ?? c.tutor.email ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="text-slate-300 truncate text-sm">
                        {c.tutor.name ?? c.tutor.email}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                      <UserCog className="w-3.5 h-3.5" /> Admin-built
                    </span>
                  ),
              },
              {
                key: "category",
                header: "Category",
                mobileHidden: true,
                cell: (c) => (
                  <span className="text-sm text-slate-300">{c.category}</span>
                ),
              },
              {
                key: "lessons",
                header: "Lessons",
                mobileHidden: true,
                cell: (c) => (
                  <span className="tabular-nums">{c._count.lessons}</span>
                ),
              },
              {
                key: "enrollments",
                header: "Enrollments",
                mobileHidden: true,
                cell: (c) => (
                  <span className="tabular-nums">{c._count.enrollments}</span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (c) => <StatusBadge status={c.status} />,
              },
              {
                key: "actions",
                header: "Actions",
                cell: (c) => (
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/courses/${c.id}`}
                      className="p-1.5 rounded hover:bg-slate-700 text-blue-400"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    {canManage && (
                      <Link
                        href={`/admin/courses/${c.id}/edit`}
                        className="p-1.5 rounded hover:bg-slate-700 text-emerald-400"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                    )}
                    <Link
                      href={`/admin/courses/${c.id}/analytics`}
                      className="p-1.5 rounded hover:bg-slate-700 text-indigo-300"
                      title="Analytics"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Link>
                    {canManage && c.status === "PENDING_REVIEW" && (
                      <ApproveRejectButtons courseId={c.id} />
                    )}
                    {canManage &&
                      (c.status === "PUBLISHED" || c.status === "SUSPENDED") && (
                        <CourseRowFeatureMenu
                          courseId={c.id}
                          isFeatured={c.isFeatured}
                          isPromoted={c.isPromoted}
                          status={c.status}
                        />
                      )}
                  </div>
                ),
              },
            ]}
          />
        )}
        {total > pageSize && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {skip + 1}–{Math.min(skip + pageSize, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? buildHref(page - 1) : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                  page > 1
                    ? "bg-slate-800 text-white hover:bg-slate-700"
                    : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Link>
              <Link
                href={page < totalPages ? buildHref(page + 1) : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                  page < totalPages
                    ? "bg-slate-800 text-white hover:bg-slate-700"
                    : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "slate" | "blue" | "rose";
  value: number | string;
  label: string;
}) {
  const cls = {
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    slate: "bg-slate-700/40 text-slate-300",
    blue: "bg-blue-500/10 text-blue-400",
    rose: "bg-rose-500/10 text-rose-400",
  }[tone];
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${cls}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-white tabular-nums truncate">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    PUBLISHED: { label: "Published", cls: "bg-emerald-500/10 text-emerald-400" },
    PENDING_REVIEW: { label: "Pending review", cls: "bg-amber-500/15 text-amber-300" },
    DRAFT: { label: "Draft", cls: "bg-slate-700/40 text-slate-300" },
    SUSPENDED: { label: "Suspended", cls: "bg-rose-500/15 text-rose-300" },
    ARCHIVED: { label: "Archived", cls: "bg-slate-700/40 text-slate-500" },
  };
  const c = cfg[status] ?? cfg.DRAFT;
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}
