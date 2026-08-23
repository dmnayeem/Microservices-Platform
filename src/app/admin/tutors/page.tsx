import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UserCog, ClipboardList, Inbox, ShieldOff } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { TutorRowActions } from "./_components/TutorRowActions";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { SmartImage } from "@/components/user/primitives/smart-image";

export default async function AdminTutorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "tutor.applications.review"))) redirect("/admin");

  const [tutorsRaw, pendingApps, totalTutors, suspendedTutors] = await Promise.all([
    prisma.tutorProfile.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            cashBalance: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.tutorApplication.count({ where: { status: "PENDING" } }),
    prisma.tutorProfile.count(),
    prisma.tutorProfile.count({ where: { isSuspended: true } }),
  ]);

  // Prisma Accelerate's TS types collapse `include` payloads to the base
  // model shape; assert the include here so JSX field access compiles.
  const tutors = tutorsRaw as unknown as Array<{
    id: string;
    headline: string | null;
    totalCourses: number;
    totalEarningsCents: number;
    isSuspended: boolean;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
      role: string;
      cashBalance: number;
      createdAt: Date;
    };
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <UserCog className="w-6 h-6 text-teal-300" />
            Tutors
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage approved tutors and review pending applications.
          </p>
        </div>
        <Link
          href="/admin/tutors/applications"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
        >
          <Inbox className="w-4 h-4" />
          Applications
          {pendingApps > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 text-xs">
              {pendingApps}
            </span>
          )}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<UserCog className="w-4 h-4" />}
          label="Total tutors"
          value={totalTutors}
          tone="text-teal-300"
        />
        <StatCard
          icon={<ClipboardList className="w-4 h-4" />}
          label="Pending applications"
          value={pendingApps}
          tone="text-amber-300"
        />
        <StatCard
          icon={<ShieldOff className="w-4 h-4" />}
          label="Suspended"
          value={suspendedTutors}
          tone="text-rose-300"
        />
      </div>

      <AdminTable
        rows={tutors}
        getRowKey={(t) => t.id}
        empty={
          <div className="glass py-10 text-center text-slate-500">
            No tutors yet. Approve an application to add the first one.
          </div>
        }
        columns={[
          {
            key: "tutor",
            header: "Tutor",
            primary: true,
            cell: (t) => (
              <div className="flex items-center gap-2">
                {t.user.avatar ? (
                  <SmartImage
                    src={t.user.avatar}
                    alt=""
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover bg-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-200 font-bold shrink-0">
                    {(t.user.name ?? t.user.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="leading-tight min-w-0">
                  <p className="text-white font-medium truncate">
                    {t.user.name ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{t.user.email}</p>
                </div>
              </div>
            ),
          },
          {
            key: "headline",
            header: "Headline",
            mobileHidden: true,
            cell: (t) => (
              <span className="text-slate-300 max-w-65 truncate inline-block">
                {t.headline ?? <span className="text-slate-600">—</span>}
              </span>
            ),
          },
          {
            key: "courses",
            header: "Courses",
            mobileHidden: true,
            cell: (t) => (
              <span className="text-slate-300 tabular-nums">{t.totalCourses}</span>
            ),
          },
          {
            key: "earnings",
            header: "Earnings",
            cell: (t) => (
              <span className="text-emerald-300 tabular-nums">
                {usd((t.totalEarningsCents / 100))}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (t) =>
              t.isSuspended ? (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-xs font-medium">
                  Suspended
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-medium">
                  Active
                </span>
              ),
          },
          {
            key: "joined",
            header: "Joined",
            mobileHidden: true,
            cell: (t) => (
              <span className="text-slate-400">
                {formatDistanceToNow(t.createdAt, { addSuffix: true })}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (t) => (
              <TutorRowActions tutorId={t.id} isSuspended={t.isSuspended} />
            ),
          },
        ]}
      />
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
  value: number;
  tone: string;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className={`inline-flex items-center gap-2 text-xs uppercase tracking-wide ${tone}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}
