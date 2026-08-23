import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canAny } from "@/lib/permissions";
import { parsePage } from "@/lib/paginate";
import { StatCard } from "@/components/admin/stat-card";
import { ActiveFilterChips, type FilterChip } from "@/components/admin/active-filter-chips";
import { Flag, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import {
  REPORT_CONTENT_TYPES,
  REPORT_REASONS,
  REPORT_PRIORITIES,
  CONTENT_TYPE_LABEL,
  REASON_LABEL,
  PRIORITY_LABEL,
  ACTIONED_RESOLUTIONS,
  priorityRank,
} from "@/lib/moderation";
import { resolveReportPreviews } from "@/lib/report-previews";
import { ReportQueue } from "@/components/admin/social/report-queue";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
    reason?: string;
    priority?: string;
    page?: string;
  }>;
}

export default async function SocialModerationPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // `canAny` + both permissions: the sidebar link accepts `social.moderate` OR
  // `moderation.view`, so a role granted only the latter used to see the link
  // and get bounced. This also uses the async, custom-role-aware check the API
  // uses — the synchronous `hasPermission` can't see a CustomRole grant.
  if (!(await canAny(session.user.id, ["social.moderate", "moderation.view"]))) {
    redirect("/admin");
  }
  const canAct = await canAny(session.user.id, [
    "social.moderate",
    "moderation.manage",
  ]);

  const params = await searchParams;
  const status = params.status === "RESOLVED" ? "RESOLVED" : "PENDING";
  const page = parsePage(params.page);

  const type = REPORT_CONTENT_TYPES.includes(params.type as never)
    ? params.type
    : undefined;
  const reason = REPORT_REASONS.includes(params.reason as never)
    ? params.reason
    : undefined;
  const priority = REPORT_PRIORITIES.includes(params.priority as never)
    ? params.priority
    : undefined;

  const where = {
    status,
    ...(type ? { contentType: type } : {}),
    ...(reason ? { reason } : {}),
    ...(priority ? { priority } : {}),
  };

  const [rows, total, pending, urgent, actioned] = await Promise.all([
    prisma.socialReport.findMany({
      where,
      // NOT ordered by priority: it is a String column, so SQL sorts it
      // alphabetically (HIGH < NORMAL < URGENT) and buries the urgent ones.
      // The page is bounded, so the real ranking is applied below.
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.socialReport.count({ where }),
    prisma.socialReport.count({ where: { status: "PENDING" } }),
    prisma.socialReport.count({ where: { status: "PENDING", priority: "URGENT" } }),
    prisma.socialReport.count({
      where: { status: "RESOLVED", resolution: { in: ACTIONED_RESOLUTIONS } },
    }),
  ]);

  // Urgent first, then newest. Done here rather than in SQL for the reason above.
  const reports = [...rows].sort(
    (a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      b.createdAt.getTime() - a.createdAt.getTime()
  );

  // Resolve the reported content AND the reporter in two batched passes — the
  // page used to render a bare cuid and ask a moderator to act on it.
  const [previews, reporters] = await Promise.all([
    resolveReportPreviews(reports),
    reports.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(reports.map((r) => r.reporterId))] } },
          select: { id: true, name: true, username: true, email: true },
        })
      : [],
  ]);
  const reporterById = new Map(reporters.map((u) => [u.id, u]));

  // How many OTHER pending reports point at the same content, so ten reports
  // about one post read as one problem instead of ten.
  const dupeGroups = reports.length
    ? ((await prisma.socialReport.groupBy({
        by: ["contentId"],
        where: {
          status: "PENDING",
          contentId: { in: [...new Set(reports.map((r) => r.contentId))] },
        },
        _count: { _all: true },
      })) as unknown as { contentId: string; _count: { _all: number } }[])
    : [];
  const dupeCount = new Map(dupeGroups.map((g) => [g.contentId, g._count._all]));

  const items = reports.map((r) => {
    const rep = reporterById.get(r.reporterId);
    return {
      id: r.id,
      contentType: r.contentType,
      contentId: r.contentId,
      reason: r.reason,
      details: r.details,
      priority: r.priority,
      status: r.status,
      resolution: r.resolution,
      resolverNote: r.resolverNote,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      reporter: rep
        ? { name: rep.name ?? rep.username ?? rep.email, id: rep.id }
        : null,
      preview: previews.get(r.contentId) ?? null,
      alsoReported: Math.max(0, (dupeCount.get(r.contentId) ?? 1) - 1),
    };
  });

  const chips: FilterChip[] = [
    type && { key: "type", label: "Type", value: CONTENT_TYPE_LABEL[type] ?? type },
    reason && { key: "reason", label: "Reason", value: REASON_LABEL[reason] ?? reason },
    priority && {
      key: "priority",
      label: "Priority",
      value: PRIORITY_LABEL[priority] ?? priority,
    },
  ].filter(Boolean) as FilterChip[];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { status: params.status, type, reason, priority, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/admin/social-moderation?${s}` : "/admin/social-moderation";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Flag className="w-6 h-6 text-amber-400" />
          Reported content
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Everything users have flagged, with the content shown so you can see
          what you&apos;re deciding on. Urgent reports sort first.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Waiting"
          value={pending}
          subtext="unresolved reports"
          icon={Clock}
          tone="amber"
        />
        <StatCard
          title="Urgent"
          value={urgent}
          subtext={urgent > 0 ? "needs attention now" : "nothing urgent"}
          icon={AlertTriangle}
          tone={urgent > 0 ? "red" : "slate"}
        />
        <StatCard
          title="Actioned"
          value={actioned}
          subtext="all time"
          icon={ShieldCheck}
          tone="green"
        />
      </div>

      <div className="border-b border-slate-800 flex gap-1">
        <Link
          href={qs({ status: undefined, page: undefined })}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            status === "PENDING"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Pending ({pending})
        </Link>
        <Link
          href={qs({ status: "RESOLVED", page: undefined })}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            status === "RESOLVED"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Resolved
        </Link>
      </div>

      {/* Filters — every one of these columns is already indexed. */}
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="All types"
          value={type}
          options={REPORT_CONTENT_TYPES.map((t) => ({
            value: t,
            label: CONTENT_TYPE_LABEL[t] ?? t,
          }))}
          hrefFor={(v) => qs({ type: v, page: undefined })}
        />
        <FilterSelect
          label="All reasons"
          value={reason}
          options={REPORT_REASONS.map((r) => ({
            value: r,
            label: REASON_LABEL[r] ?? r,
          }))}
          hrefFor={(v) => qs({ reason: v, page: undefined })}
        />
        <FilterSelect
          label="Any priority"
          value={priority}
          options={REPORT_PRIORITIES.map((p) => ({
            value: p,
            label: PRIORITY_LABEL[p] ?? p,
          }))}
          hrefFor={(v) => qs({ priority: v, page: undefined })}
        />
      </div>

      {chips.length > 0 && <ActiveFilterChips chips={chips} />}

      <ReportQueue items={items} canAct={canAct} status={status} />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">
            Page {page} of {totalPages} · {total.toLocaleString()} report
            {total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={qs({ page: String(page - 1) })}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={qs({ page: String(page + 1) })}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A filter rendered as links, so the whole page stays a server component. */
function FilterSelect({
  label,
  value,
  options,
  hrefFor,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  hrefFor: (v: string | undefined) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <Link
        href={hrefFor(undefined)}
        className={`px-2.5 py-1 rounded-full text-xs ${
          !value
            ? "bg-blue-500/15 text-blue-300"
            : "bg-slate-800 text-slate-400 hover:text-white"
        }`}
      >
        {label}
      </Link>
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          className={`px-2.5 py-1 rounded-full text-xs ${
            value === o.value
              ? "bg-blue-500/15 text-blue-300"
              : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
