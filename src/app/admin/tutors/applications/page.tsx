import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { Inbox, CheckCircle, XCircle, Clock, Filter } from "lucide-react";
import Link from "next/link";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { formatDistanceToNow } from "date-fns";
import { ApplicationDecisionButtons } from "./_components/ApplicationDecisionButtons";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function TutorApplicationsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "tutor.applications.review")) redirect("/admin");

  const { status } = await searchParams;
  const statusFilter =
    status === "APPROVED" || status === "REJECTED" || status === "PENDING"
      ? status
      : undefined;

  const [rowsRaw, summary] = await Promise.all([
    prisma.tutorApplication.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            country: true,
            createdAt: true,
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
      take: 100,
    }),
    prisma.tutorApplication.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const rows = rowsRaw as unknown as Array<{
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    bio: string;
    expertise: string[];
    portfolioUrl: string | null;
    idDocumentUrl: string | null;
    adminNote: string | null;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
      role: string;
      country: string | null;
      createdAt: Date;
    };
    reviewedBy: { id: string; name: string | null } | null;
  }>;

  const counts = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  } as Record<string, number>;
  for (const c of summary as Array<{ status: string; _count: { _all: number } }>) {
    counts[c.status] = c._count._all;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tutors"
            className="text-xs text-slate-400 hover:text-white"
          >
            ← Tutors
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2 mt-1">
          <Inbox className="w-6 h-6 text-indigo-300" />
          Tutor Applications
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Review users who applied for tutor status. Approving promotes them to
          the TUTOR role and creates their tutor profile.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip
          href="/admin/tutors/applications"
          label="All"
          count={counts.PENDING + counts.APPROVED + counts.REJECTED}
          active={!statusFilter}
        />
        <FilterChip
          href="/admin/tutors/applications?status=PENDING"
          label="Pending"
          count={counts.PENDING}
          active={statusFilter === "PENDING"}
          icon={<Clock className="w-3.5 h-3.5" />}
          tone="amber"
        />
        <FilterChip
          href="/admin/tutors/applications?status=APPROVED"
          label="Approved"
          count={counts.APPROVED}
          active={statusFilter === "APPROVED"}
          icon={<CheckCircle className="w-3.5 h-3.5" />}
          tone="emerald"
        />
        <FilterChip
          href="/admin/tutors/applications?status=REJECTED"
          label="Rejected"
          count={counts.REJECTED}
          active={statusFilter === "REJECTED"}
          icon={<XCircle className="w-3.5 h-3.5" />}
          tone="rose"
        />
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-10 text-center">
            <Filter className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No applications here yet.</p>
          </div>
        )}
        {rows.map((app) => (
          <div
            key={app.id}
            className="bg-slate-900 rounded-xl border border-slate-800 p-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {app.user.avatar ? (
                  <SmartImage
                    src={app.user.avatar}
                    alt=""
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full object-cover bg-slate-800"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-base text-slate-200 font-bold">
                    {(app.user.name ?? app.user.email ?? "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-white font-bold">{app.user.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{app.user.email}</p>
                    <StatusBadge status={app.status} />
                    <span className="text-[10px] text-slate-500 ml-auto">
                      {formatDistanceToNow(app.createdAt, { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap line-clamp-5">
                    {app.bio}
                  </p>
                  {app.expertise.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {app.expertise.map((e) => (
                        <span
                          key={e}
                          className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 text-[11px] font-medium"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {app.portfolioUrl && (
                      <a
                        href={app.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-300 hover:underline truncate"
                      >
                        Portfolio: {app.portfolioUrl}
                      </a>
                    )}
                    {app.idDocumentUrl && (
                      <a
                        href={app.idDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-300 hover:underline truncate"
                      >
                        ID document
                      </a>
                    )}
                  </div>
                  {app.adminNote && (
                    <p className="text-xs text-slate-400 mt-2 italic">
                      Note: {app.adminNote}
                      {app.reviewedBy?.name ? ` — ${app.reviewedBy.name}` : ""}
                    </p>
                  )}
                </div>
              </div>
              {app.status === "PENDING" && (
                <ApplicationDecisionButtons applicationId={app.id} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    PENDING: { label: "Pending", cls: "bg-amber-500/15 text-amber-300" },
    APPROVED: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-300" },
    REJECTED: { label: "Rejected", cls: "bg-rose-500/15 text-rose-300" },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function FilterChip({
  href,
  label,
  count,
  active,
  icon,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
  icon?: React.ReactNode;
  tone?: "amber" | "emerald" | "rose";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-300"
      : tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
      ? "text-rose-300"
      : "text-slate-300";
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border " +
        (active
          ? "border-indigo-500 bg-indigo-500/20 text-white"
          : `border-slate-700 bg-slate-900 hover:bg-slate-800 ${toneCls}`)
      }
    >
      {icon}
      {label}
      <span className="ml-1 text-slate-500 tabular-nums">{count}</span>
    </Link>
  );
}
