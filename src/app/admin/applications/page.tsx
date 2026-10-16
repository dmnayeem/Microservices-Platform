import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Inbox } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  PROGRAMS,
  PROGRAM_KEYS,
  answersFromPayload,
  splitAnswersText,
  type ProgramKey,
} from "@/lib/application-requirements";
import { evaluateApplicants, getRequirementsConfig } from "@/lib/application-requirements-server";
import { getAmbassadorConfig } from "@/lib/ambassadors-server";
import { RequirementsEditor } from "./_components/requirements-editor";
import { PendingReview, type PendingItem } from "./_components/pending-review";

export const metadata = { title: "Applications" };

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
  REMOVED: "bg-slate-700 text-slate-300",
};

type Row = {
  id: string;
  program: ProgramKey;
  status: string;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
  href: string;
};

export default async function AdminApplicationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  if (!(await can(userId, "creators.review"))) redirect("/admin");

  const [canEdit, creatorPending, tutorPending, ambassadorPending, kycPending, creatorRecent, tutorRecent, ambassadorRecent, config, ambCfg] =
    (await Promise.all([
      can(userId, "settings.edit"),
      prisma.creatorApplication.groupBy({ by: ["type"], where: { status: "PENDING" }, _count: true }),
      prisma.tutorApplication.count({ where: { status: "PENDING" } }),
      prisma.ambassadorApplication.count({ where: { status: "PENDING" } }),
      prisma.kYCDocument.count({ where: { status: "PENDING" } }),
      prisma.creatorApplication.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, type: true, status: true, createdAt: true, user: { select: { name: true, email: true } } },
      }),
      prisma.tutorApplication.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, status: true, createdAt: true, user: { select: { name: true, email: true } } },
      }),
      prisma.ambassadorApplication.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, userId: true, status: true, createdAt: true },
      }),
      getRequirementsConfig(),
      getAmbassadorConfig(),
      // The Accelerate extension degrades groupBy/include types inside this
      // tuple, so the shapes are declared explicitly.
    ])) as unknown as [
      boolean,
      { type: ProgramKey; _count: number }[],
      number,
      number,
      number,
      { id: string; type: ProgramKey; status: string; createdAt: Date; user: Row["user"] }[],
      { id: string; status: string; createdAt: Date; user: Row["user"] }[],
      { id: string; userId: string; status: string; createdAt: Date }[],
      Awaited<ReturnType<typeof getRequirementsConfig>>,
      Awaited<ReturnType<typeof getAmbassadorConfig>>,
    ];

  // Everything waiting, with what the reviewer needs to decide inline.
  const [creatorWaiting, tutorWaiting, ambWaiting, canTutor, canAmbassador, canGrantBadge] = (await Promise.all([
    prisma.creatorApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        type: true,
        message: true,
        links: true,
        payload: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.tutorApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: {
        id: true,
        userId: true,
        bio: true,
        expertise: true,
        sampleOutline: true,
        portfolioUrl: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.ambassadorApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { id: true, userId: true, message: true, createdAt: true },
    }),
    can(userId, "tutor.applications.review"),
    can(userId, "community.manage"),
    can(userId, "users.grant_badge"),
  ])) as unknown as [
    {
      id: string;
      userId: string;
      type: ProgramKey;
      message: string;
      links: string[];
      payload: unknown;
      createdAt: Date;
      user: Row["user"];
    }[],
    {
      id: string;
      userId: string;
      bio: string;
      expertise: string[];
      sampleOutline: string | null;
      portfolioUrl: string | null;
      createdAt: Date;
      user: Row["user"];
    }[],
    { id: string; userId: string; message: string | null; createdAt: Date }[],
    boolean,
    boolean,
    boolean,
  ];

  const ambUsers = await prisma.user.findMany({
    where: { id: { in: [...new Set([...ambassadorRecent, ...ambWaiting].map((a) => a.userId))] } },
    select: { id: true, name: true, email: true },
  });
  const ambUserById = new Map(ambUsers.map((u) => [u.id, u]));

  const evals = await evaluateApplicants([
    ...creatorWaiting.map((a) => ({ userId: a.userId, program: a.type })),
    ...tutorWaiting.map((a) => ({ userId: a.userId, program: "TUTOR" as const })),
    ...ambWaiting.map((a) => ({ userId: a.userId, program: "AMBASSADOR" as const })),
  ]);
  const checksFor = (program: ProgramKey, uid: string) =>
    (evals.get(`${program}:${uid}`)?.checks ?? []).map((c) => ({ label: c.label, met: c.met }));

  const waiting: PendingItem[] = [
    ...creatorWaiting.map((a): PendingItem => {
      const detail = (a.payload as { detail?: unknown } | null)?.detail;
      return {
        kind: "creator",
        id: a.id,
        userId: a.userId,
        program: a.type,
        programLabel: PROGRAMS[a.type]?.label ?? a.type,
        user: a.user,
        createdAt: a.createdAt.toISOString(),
        message: a.message,
        detail: typeof detail === "string" ? detail : null,
        links: a.links,
        answers: answersFromPayload(a.payload),
        checks: checksFor(a.type, a.userId),
        canDecide: true,
        isBadge: a.type === "BLUE_BADGE",
        canGrantBadge,
        reviewHref: `/admin/creators?status=PENDING&type=${a.type}`,
      };
    }),
    ...tutorWaiting.map((a): PendingItem => {
      const outline = splitAnswersText(a.sampleOutline);
      return {
        kind: "tutor",
        id: a.id,
        userId: a.userId,
        program: "TUTOR",
        programLabel: PROGRAMS.TUTOR.label,
        user: a.user,
        createdAt: a.createdAt.toISOString(),
        message: a.bio,
        detail: a.expertise.length ? `Expertise: ${a.expertise.join(", ")}` : null,
        links: a.portfolioUrl ? [a.portfolioUrl] : [],
        answers: outline.answers,
        checks: checksFor("TUTOR", a.userId),
        canDecide: canTutor,
        isBadge: false,
        canGrantBadge: false,
        reviewHref: "/admin/tutors/applications?status=PENDING",
      };
    }),
    ...ambWaiting.map((a): PendingItem => {
      const msg = splitAnswersText(a.message);
      return {
        kind: "ambassador",
        id: a.userId,
        userId: a.userId,
        program: "AMBASSADOR",
        programLabel: PROGRAMS.AMBASSADOR.label,
        user: ambUserById.get(a.userId) ?? null,
        createdAt: a.createdAt.toISOString(),
        message: msg.body,
        detail: null,
        links: [],
        answers: msg.answers,
        checks: checksFor("AMBASSADOR", a.userId),
        canDecide: canAmbassador,
        isBadge: false,
        canGrantBadge: false,
        reviewHref: "/admin/ambassadors",
      };
    }),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const pending: Partial<Record<ProgramKey, number>> = {};
  for (const g of creatorPending) pending[g.type] = g._count;
  pending.TUTOR = tutorPending;
  pending.AMBASSADOR = ambassadorPending;

  const rows: Row[] = [
    ...creatorRecent.map((a) => ({
      id: a.id,
      program: a.type,
      status: a.status,
      createdAt: a.createdAt,
      user: a.user,
      href: `/admin/creators?status=${a.status}&type=${a.type}`,
    })),
    ...tutorRecent.map((a) => ({
      id: a.id,
      program: "TUTOR" as const,
      status: a.status,
      createdAt: a.createdAt,
      user: a.user,
      href: "/admin/tutors/applications",
    })),
    ...ambassadorRecent.map((a) => ({
      id: a.id,
      program: "AMBASSADOR" as const,
      status: a.status,
      createdAt: a.createdAt,
      user: ambUserById.get(a.userId) ?? null,
      href: "/admin/ambassadors",
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 40);

  const reviewable = PROGRAM_KEYS.filter((k) => PROGRAMS[k].adminHref);
  const totalPending = Object.values(pending).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white">Applications</h1>
        <p className="text-sm text-slate-400">
          Every program members apply to — what is waiting, the latest applications, and the requirements an
          applicant must meet. {totalPending > 0 ? `${totalPending} waiting for review.` : "Nothing waiting."}
        </p>
      </div>

      {/* Pending per program */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {reviewable.map((k) => {
          const n = pending[k] ?? 0;
          const href =
            PROGRAMS[k].adminHref!.includes("/admin/creators") ? `${PROGRAMS[k].adminHref}&status=PENDING` : PROGRAMS[k].adminHref!;
          return (
            <Link
              key={k}
              href={href}
              className="rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-600 transition-colors"
            >
              <p className="text-xs text-slate-400 truncate">{PROGRAMS[k].label}</p>
              <p className={`mt-1 text-2xl font-bold ${n > 0 ? "text-amber-400" : "text-slate-500"}`}>{n}</p>
              <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                Review <ArrowRight className="w-3 h-3" />
              </p>
            </Link>
          );
        })}
        <Link
          href="/admin/users/kyc"
          className="rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-600 transition-colors"
        >
          <p className="text-xs text-slate-400 truncate">KYC (identity)</p>
          <p className={`mt-1 text-2xl font-bold ${kycPending > 0 ? "text-amber-400" : "text-slate-500"}`}>{kycPending}</p>
          <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
            Review <ArrowRight className="w-3 h-3" />
          </p>
        </Link>
      </div>

      <PendingReview items={waiting} />

      {/* Recent across programs */}
      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <h2 className="px-4 pt-4 text-sm font-bold text-white">Recent applications</h2>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 inline-flex w-full justify-center items-center gap-2">
            <Inbox className="w-4 h-4" /> No applications yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2 font-medium">Applicant</th>
                  <th className="px-4 py-2 font-medium">Program</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Applied</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.program}-${r.id}`} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2">
                      <p className="text-white truncate max-w-56">{r.user?.name ?? r.user?.email ?? "Unknown"}</p>
                      {r.user?.name && <p className="text-xs text-slate-500 truncate max-w-56">{r.user.email}</p>}
                    </td>
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{PROGRAMS[r.program].label}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.REMOVED}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{r.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={r.href} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 whitespace-nowrap">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RequirementsEditor
        initial={config}
        canEdit={canEdit}
        ambassador={{ enabled: ambCfg.enabled, minLevel: ambCfg.minLevelToApply, kyc: ambCfg.requireKyc }}
      />
    </div>
  );
}
