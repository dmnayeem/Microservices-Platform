import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { CREATOR_TYPES } from "@/lib/creator-application";
import type { CreatorApplicationType, CreatorApplicationStatus } from "@/generated/prisma";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CreatorDecisionButtons } from "./_components/CreatorDecisionButtons";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
};

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string }>;
}

type AppRow = {
  id: string;
  type: CreatorApplicationType;
  status: CreatorApplicationStatus;
  message: string;
  links: string[];
  payload: unknown;
  adminNote: string | null;
  createdAt: Date;
  user: { name: string | null; email: string; avatar: string | null } | null;
};

export default async function AdminCreatorsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "creators.review")) redirect("/admin");

  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as CreatorApplicationStatus)
    : "PENDING";
  const type =
    sp.type && sp.type in CREATOR_TYPES ? (sp.type as CreatorApplicationType) : undefined;

  const [apps, counts, tutorPending] = (await Promise.all([
    prisma.creatorApplication.findMany({
      where: { status, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true, avatar: true } } },
    }),
    prisma.creatorApplication.groupBy({ by: ["status"], _count: true }),
    prisma.tutorApplication.count({ where: { status: "PENDING" } }),
    // The Prisma Accelerate extension degrades include/groupBy return types to `{}`
    // inside this tuple, so the result shapes are declared explicitly.
  ])) as unknown as [AppRow[], { status: string; _count: number }[], number];

  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count;

  const canManage = hasPermission(role, "creators.review");

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Creator Applications</h1>
          <p className="text-sm text-slate-400">
            Marketplace sellers, advertisers, agencies &amp; affiliates.
          </p>
        </div>
        <Link
          href="/admin/tutors"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold"
        >
          Tutor applications
          {tutorPending > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-bold">
              {tutorPending}
            </span>
          )}
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/creators?status=${s}${type ? `&type=${type}` : ""}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${status === s ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            {s}
            {countByStatus[s] ? ` (${countByStatus[s]})` : ""}
          </Link>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            href={`/admin/creators?status=${status}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${!type ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400"}`}
          >
            All types
          </Link>
          {(Object.keys(CREATOR_TYPES) as CreatorApplicationType[]).map((t) => (
            <Link
              key={t}
              href={`/admin/creators?status=${status}&type=${t}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${type === t ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400"}`}
            >
              {CREATOR_TYPES[t].label}
            </Link>
          ))}
        </div>
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          No {status.toLowerCase()} applications.
        </p>
      ) : (
        <div className="space-y-2">
          {apps.map((a) => {
            const payload = (a.payload ?? null) as { detail?: string } | null;
            return (
              <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">
                      {a.user?.name ?? a.user?.email ?? "Unknown"}
                      <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300">
                        {CREATOR_TYPES[a.type].label}
                      </span>
                      <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONE[a.status]}`}>
                        {a.status}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.user?.email} · {new Date(a.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{a.message}</p>
                    {payload?.detail && (
                      <p className="text-xs text-slate-400 mt-1">
                        <span className="text-slate-500">Detail:</span> {payload.detail}
                      </p>
                    )}
                    {a.links.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {a.links.map((l, i) => (
                          <a
                            key={i}
                            href={l}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline break-all"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            {l.replace(/^https?:\/\//, "").slice(0, 40)}
                          </a>
                        ))}
                      </div>
                    )}
                    {a.status === "REJECTED" && a.adminNote && (
                      <p className="text-[11px] text-red-300/80 mt-1.5">Note: {a.adminNote}</p>
                    )}
                  </div>

                  {canManage && a.status === "PENDING" && (
                    <CreatorDecisionButtons id={a.id} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
