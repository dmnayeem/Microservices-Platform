import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { RefreshCcw, Clock, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { formatDistanceToNow } from "date-fns";
import { RefundDecisionButtons } from "./_components/RefundDecisionButtons";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function CourseRefundsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "courses.manage")) redirect("/admin");

  const { status } = await searchParams;
  const filter =
    status === "PENDING" || status === "APPROVED" || status === "REJECTED"
      ? status
      : undefined;

  const [rowsRaw, summary] = await Promise.all([
    prisma.courseRefundRequest.findMany({
      where: filter ? { status: filter } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        course: { select: { id: true, title: true } },
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        enrollment: { select: { id: true, pricePaid: true, createdAt: true } },
      },
    }),
    prisma.courseRefundRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const c of summary as Array<{ status: string; _count: { _all: number } }>) {
    counts[c.status] = c._count._all;
  }

  const rows = rowsRaw as unknown as Array<{
    id: string;
    status: string;
    reason: string;
    refundedAmount: number | null;
    adminNote: string | null;
    createdAt: Date;
    processedAt: Date | null;
    course: { id: string; title: string };
    user: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
    };
    enrollment: { id: string; pricePaid: number; createdAt: Date } | null;
  }>;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <Link href="/admin/courses" className="hover:text-white">
            ← Courses
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2 mt-1">
          <RefreshCcw className="w-6 h-6 text-rose-300" />
          Refund requests
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Approving refunds returns the buyer&apos;s wallet balance and claws back the
          tutor&apos;s share.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Chip
          href="/admin/courses/refunds"
          label="All"
          count={counts.PENDING + counts.APPROVED + counts.REJECTED}
          active={!filter}
        />
        <Chip
          href="/admin/courses/refunds?status=PENDING"
          label="Pending"
          count={counts.PENDING}
          active={filter === "PENDING"}
          icon={<Clock className="w-3.5 h-3.5" />}
          tone="amber"
        />
        <Chip
          href="/admin/courses/refunds?status=APPROVED"
          label="Approved"
          count={counts.APPROVED}
          active={filter === "APPROVED"}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          tone="emerald"
        />
        <Chip
          href="/admin/courses/refunds?status=REJECTED"
          label="Rejected"
          count={counts.REJECTED}
          active={filter === "REJECTED"}
          icon={<XCircle className="w-3.5 h-3.5" />}
          tone="rose"
        />
      </div>

      {rows.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-10 text-center">
          <RefreshCcw className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-white font-bold">Nothing in the queue</p>
          <p className="text-sm text-slate-400 mt-1">
            Refund requests will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="bg-slate-900 rounded-xl border border-slate-800 p-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {r.user.avatar ? (
                    <SmartImage
                      src={r.user.avatar}
                      alt=""
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover bg-slate-800"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm text-white font-bold">
                      {(r.user.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-white">
                        {r.user.name ?? r.user.email}
                      </p>
                      <StatusPill status={r.status} />
                      <span className="ml-auto text-[11px] text-slate-500">
                        {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <Link
                        href={`/admin/courses/${r.course.id}/edit`}
                        className="text-indigo-300 hover:underline"
                      >
                        {r.course.title}
                      </Link>
                      {r.enrollment && (
                        <>
                          {" · "}
                          Paid{" "}
                          <span className="text-emerald-300 tabular-nums">
                            ${r.enrollment.pricePaid.toFixed(2)}
                          </span>
                          {" · "}
                          Enrolled{" "}
                          {formatDistanceToNow(r.enrollment.createdAt, {
                            addSuffix: true,
                          })}
                        </>
                      )}
                    </p>
                    <p className="text-sm text-slate-200 mt-2 whitespace-pre-wrap">
                      {r.reason}
                    </p>
                    {r.adminNote && (
                      <p className="text-xs text-slate-400 mt-2 italic">
                        Admin note: {r.adminNote}
                      </p>
                    )}
                    {r.refundedAmount !== null && (
                      <p className="text-xs text-emerald-300 mt-1 tabular-nums">
                        Refunded ${r.refundedAmount.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                {r.status === "PENDING" && (
                  <RefundDecisionButtons refundId={r.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
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

function Chip({
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
