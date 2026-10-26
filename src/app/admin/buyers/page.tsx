import { redirect } from "next/navigation";
import { freshRole } from "@/lib/task-privacy-server";
import { adminSubmissionScope } from "@/lib/task-privacy";
import Link from "next/link";
import { Users, Sparkles, ListChecks, AlertTriangle, Flag } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pts, usd, cn } from "@/lib/utils";
import { getPointsPerUsd } from "@/lib/economy";
import { readBuyerReport } from "@/lib/buyer-reports";
import { BuyerReportActions } from "./_components/report-actions";

/**
 * Who is buying tasks, and how it is going for them.
 *
 * With buyers arriving there was no answer to "which of them is spending",
 * "whose tasks keep getting rejected" or "who has run out of credit and
 * stalled" — the information existed only as rows scattered across the task
 * list and the ledger, one buyer at a time.
 *
 * The column that matters most is the last one. A buyer whose tasks have
 * stopped for want of credit is a customer about to leave, and they are
 * invisible on every other screen: their tasks simply stop appearing.
 */
export default async function AdminBuyersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "tasks.view"))) redirect("/admin");

  const pointsPerUsd = await getPointsPerUsd();

  // Everyone who has ever funded a task, plus anyone holding credit — a buyer
  // who bought credit and has not published yet is still a buyer.
  // Accelerate infers `{}` for groupBy results, so the row shape is restated
  // and cast — the same pattern the Buyer Hub uses.
  const funded = (await prisma.task.groupBy({
    by: ["fundedByUserId"],
    where: { fundedByUserId: { not: null } },
    _count: { _all: true },
  })) as unknown as { fundedByUserId: string | null }[];
  const fundedIds = funded
    .map((f) => f.fundedByUserId)
    .filter((v): v is string => !!v);

  const holders = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: fundedIds } },
        { taskCreditPoints: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      taskCreditPoints: true,
    },
    take: 300,
  });

  const ids = holders.map((h) => h.id);

  const [tasks, spend] = await Promise.all([
    ids.length
      ? prisma.task.findMany({
          where: { fundedByUserId: { in: ids } },
          select: {
            fundedByUserId: true,
            status: true,
            pointsReward: true,
          },
        })
      : [],
    ids.length
      ? prisma.transaction.findMany({
          where: {
            userId: { in: ids },
            OR: [
              { reference: { startsWith: "taskspend_" } },
              { reference: { startsWith: "task_fee_" } },
            ],
          },
          select: { userId: true, points: true },
        })
      : [],
  ]);

  type Row = {
    id: string;
    name: string;
    email: string;
    credit: number;
    live: number;
    awaiting: number;
    rejected: number;
    spent: number;
    /** Cheapest reward among their live tasks — what "one more" costs. */
    cheapest: number;
  };

  const byId = new Map<string, Row>(
    holders.map((h) => [
      h.id,
      {
        id: h.id,
        name: h.name ?? h.email,
        email: h.email,
        credit: h.taskCreditPoints,
        live: 0,
        awaiting: 0,
        rejected: 0,
        spent: 0,
        cheapest: 0,
      },
    ])
  );

  for (const t of tasks) {
    const row = t.fundedByUserId ? byId.get(t.fundedByUserId) : null;
    if (!row) continue;
    if (t.status === "ACTIVE") {
      row.live++;
      row.cheapest =
        row.cheapest === 0
          ? t.pointsReward
          : Math.min(row.cheapest, t.pointsReward);
    } else if (t.status === "PENDING_REVIEW") row.awaiting++;
    else if (t.status === "REJECTED") row.rejected++;
  }
  for (const s of spend) {
    const row = byId.get(s.userId);
    if (row) row.spent += Math.abs(s.points ?? 0);
  }

  // Completions a buyer has flagged and nobody has answered yet.
  //
  // A buyer cannot reject work — that rule is not negotiable — so their only
  // honest complaint used to be "contact support", which is not a queue anyone
  // can measure. These are bounded per task (see `buyer-reports.ts`), so this
  // list stays short by construction; if it does not, the bound is doing its
  // job and the buyer generating them is the story.
  const reported = (await prisma.taskSubmission.findMany({
    where: {
      ...adminSubmissionScope(session?.user?.id ? await freshRole(session.user.id) : null),
      metadata: { path: ["buyerReport", "status"], equals: "OPEN" },
    },
    orderBy: { reviewedAt: "desc" },
    take: 50,
    select: {
      id: true,
      proof: true,
      proofImages: true,
      metadata: true,
      reviewedAt: true,
      pointsEarned: true,
      user: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  })) as unknown as {
    id: string;
    proof: string | null;
    proofImages: string[];
    metadata: unknown;
    reviewedAt: Date | null;
    pointsEarned: number | null;
    user: { id: string; name: string | null };
    task: { id: string; title: string } | null;
  }[];
  const reports = reported
    .map((r) => ({ row: r, report: readBuyerReport(r.metadata) }))
    .filter((r): r is { row: (typeof reported)[number]; report: NonNullable<ReturnType<typeof readBuyerReport>> } => r.report !== null);

  const rows = [...byId.values()].sort((a, b) => b.spent - a.spent);
  const stalled = rows.filter((r) => r.live > 0 && r.credit < r.cheapest);

  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
          <Users className="h-6 w-6 text-violet-400" />
          Buyers
        </h1>
        <p className="mt-0.5 text-sm text-gray-400">
          Everyone funding tasks, what they have spent, and who has stalled.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Buyers" value={String(rows.length)} sub="ever funded a task" />
        <Stat
          label="Credit spent"
          value={pts(totalSpent)}
          sub={usd(totalSpent / Math.max(1, pointsPerUsd))}
        />
        <Stat
          label="Credit held"
          value={pts(totalCredit)}
          sub="bought, not yet spent"
        />
        <Stat
          label="Stalled"
          value={String(stalled.length)}
          sub="live tasks, no credit"
          tone={stalled.length > 0 ? "text-amber-400" : undefined}
        />
      </div>

      {stalled.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-200/80">
            <span className="font-semibold">
              {stalled.length} buyer{stalled.length === 1 ? " has" : "s have"}{" "}
              live tasks they can no longer pay for.
            </span>{" "}
            Their tasks stop being shown the moment credit runs out, so nothing
            else on the platform makes this visible. They have been notified,
            but a nudge from you is what turns it back into revenue.
          </p>
        </div>
      )}

      {reports.length > 0 && (
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-white">
            <Flag className="h-4 w-4 text-amber-400" />
            Completions a buyer has flagged ({reports.length})
          </h2>
          <p className="text-[11px] leading-relaxed text-gray-500">
            Buyers cannot reject work, and nothing here has taken anyone&rsquo;s
            payment away. They are asking for a second opinion on one specific
            completion. Marking one bad records it against that worker&rsquo;s
            account — it does not reverse the payout, so act on the account if a
            pattern shows up.
          </p>
          <div className="space-y-2">
            {reports.map(({ row, report }) => (
              <div
                key={row.id}
                className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/tasks/${row.task?.id ?? ""}`}
                    className="text-sm font-semibold text-white hover:text-indigo-300"
                  >
                    {row.task?.title ?? "Task"}
                  </Link>
                  <span className="text-[11px] text-gray-500">
                    {new Date(report.at).toLocaleString()} ·{" "}
                    <Link
                      href={`/admin/users/${row.user.id}`}
                      className="hover:text-indigo-300"
                    >
                      {row.user.name ?? "worker"}
                    </Link>{" "}
                    was paid {pts(row.pointsEarned ?? 0)} pts
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
                  &ldquo;{report.reason}&rdquo;
                </p>
                {row.proof && (
                  <p className="mt-1 wrap-break-word text-[11px] text-gray-400">
                    Proof: {row.proof}
                  </p>
                )}
                {row.proofImages.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    {row.proofImages.map((src) => (
                      <a
                        key={src}
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Screenshot
                      </a>
                    ))}
                  </p>
                )}
                <BuyerReportActions submissionId={row.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
          <p className="text-sm font-semibold text-gray-300">No buyers yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-gray-500">
            Grant someone “Create Tasks” under Users → Feature Access, or
            approve a Task Buyer application, and they will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 font-bold">Buyer</th>
                <th className="px-3 py-2 text-right font-bold">Credit</th>
                <th className="px-3 py-2 text-right font-bold">Spent</th>
                <th className="px-3 py-2 text-right font-bold">Live</th>
                <th className="px-3 py-2 text-right font-bold">Awaiting</th>
                <th className="px-3 py-2 text-right font-bold">Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r) => {
                const isStalled = r.live > 0 && r.credit < r.cheapest;
                return (
                  <tr key={r.id} className="hover:bg-gray-900/40">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${r.id}/edit`}
                        className="font-medium text-white hover:text-indigo-300"
                      >
                        {r.name}
                      </Link>
                      <p className="text-[11px] text-gray-500">{r.email}</p>
                      {isStalled && (
                        <span className="mt-0.5 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          out of credit
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        isStalled ? "text-amber-400" : "text-violet-300"
                      )}
                    >
                      {pts(r.credit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                      {pts(r.spent)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                      {r.live}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.awaiting > 0 ? (
                        <Link
                          href="/admin/tasks?status=PENDING_REVIEW"
                          className="font-semibold text-amber-300 hover:text-amber-200"
                        >
                          {r.awaiting}
                        </Link>
                      ) : (
                        <span className="text-gray-600">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {r.rejected}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
      <div className="flex items-center gap-2">
        {label === "Credit held" || label === "Credit spent" ? (
          <Sparkles className="h-4 w-4 text-violet-400" />
        ) : (
          <ListChecks className="h-4 w-4 text-indigo-400" />
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "mt-1.5 text-lg font-bold tabular-nums text-white",
          tone
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-gray-500">{sub}</p>
    </div>
  );
}
