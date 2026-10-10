import { prisma } from "@/lib/prisma";
import { normalizeVisitConfig, VISIT_KIND_LABEL } from "@/lib/visit-tasks";

/**
 * What happened to a VISIT task's link (TaskVisit rows, written by /go/task,
 * /api/tasks/[id]/visit-return and /v/[taskId]). Server component.
 */
export async function VisitTaskStats({ taskId, visitConfig }: { taskId: string; visitConfig: unknown }) {
  const cfg = normalizeVisitConfig(visitConfig);
  const [byOutcome, byVerdict, people, passes] = await Promise.all([
    prisma.taskVisit.groupBy({ by: ["outcome"], where: { taskId }, _count: { _all: true } }),
    prisma.taskVisit.groupBy({ by: ["verdict"], where: { taskId, verdict: { not: null } }, _count: { _all: true } }),
    prisma.taskVisit.findMany({ where: { taskId }, distinct: ["userId"], select: { userId: true } }),
    cfg.kind === "SHORTENER"
      ? Promise.all([
          prisma.visitPass.count({ where: { taskId } }),
          prisma.visitPass.count({ where: { taskId, usedAt: { not: null } } }),
        ]).then(([made, used]) => ({ made, used }))
      : Promise.resolve(null),
  ]);
  const o = (k: string) =>
    (byOutcome as Array<{ outcome: string; _count: { _all: number } }>).find((r) => r.outcome === k)?._count._all ?? 0;
  const v = (k: string) =>
    (byVerdict as Array<{ verdict: string | null; _count: { _all: number } }>).find((r) => r.verdict === k)?._count._all ?? 0;
  const opens = (byOutcome as Array<{ _count: { _all: number } }>).reduce((n, r) => n + r._count._all, 0);

  const tiles: [string, number | string, string?][] =
    cfg.kind === "DIRECT"
      ? [
          ["Opens", opens],
          ["People", people.length],
          ["Stayed long enough", o("DONE"), "text-emerald-300"],
          ["Came back too early", o("EARLY"), "text-amber-300"],
          ["Still open / never came back", o("OPEN")],
        ]
      : [
          ["Opens", opens],
          ["People", people.length],
          ["Reached the end page", o("REACHED")],
          ["Through the shortener", v("OK"), "text-emerald-300"],
          ["Source hidden", v("UNKNOWN"), "text-amber-300"],
          ["From another site", v("MISMATCH"), "text-red-300"],
          ["Too fast (bypass)", v("TOO_FAST"), "text-red-300"],
          ...(passes ? ([["Signed-out codes made / used", `${passes.made} / ${passes.used}`]] as [string, string][]) : []),
        ];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Visit results</h2>
      <p className="text-xs text-gray-500 mb-4">
        {VISIT_KIND_LABEL[cfg.kind]} ·{" "}
        {cfg.kind === "DIRECT" ? `stay ${cfg.staySeconds}s` : `fastest real pass ${cfg.minSeconds}s`} · all time, measured on our server
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, n, tone]) => (
          <div key={label} className="rounded-lg bg-gray-800/60 p-3">
            <p className={`text-xl font-bold ${tone ?? "text-white"}`}>{n}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
