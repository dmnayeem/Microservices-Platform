import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Gift } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBonusOverview, getWelcomeBonusPoints, type BonusStatus } from "@/lib/bonus-center";
import { WelcomeBonusPanel } from "@/components/admin/bonuses/welcome-bonus-panel";

/**
 * Bonus Center — every automatic bonus in one place (lib/bonus-center.ts).
 * Each card shows if it is on, what it pays, what it paid in the last 30 days
 * and links to the one screen that edits it.
 */

const STATUS: Record<BonusStatus, { label: string; cls: string }> = {
  on: { label: "On", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  partial: { label: "Partly on", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  off: { label: "Off", cls: "bg-gray-700/40 text-gray-400 border-gray-700" },
};

const fmtPts = (n: number) => `${Math.round(n).toLocaleString()} pts`;
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function BonusCenterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const [groups, welcome, canEdit] = await Promise.all([
    getBonusOverview(),
    getWelcomeBonusPoints(),
    can(session.user.id, "settings.edit"),
  ]);

  const all = groups.flatMap((g) => g.items);
  const onCount = all.filter((i) => i.status !== "off").length;
  const totalPts = all.filter((i) => i.currency === "points").reduce((s, i) => s + i.paid30.points, 0);
  const totalCash = all.filter((i) => i.currency === "cash").reduce((s, i) => s + i.paid30.cash, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
          <Gift className="h-6 w-6 text-pink-400" /> Bonus Center
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Every automatic bonus the platform pays, in one place. Tasks, daily missions, boards, quizzes, games, lottery,
          leaderboards and offerwalls have their own pages and are not listed here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Bonuses switched on</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {onCount} <span className="text-base font-normal text-gray-500">of {all.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Points paid as bonuses · last 30 days</p>
          <p className="mt-1 text-2xl font-bold text-white">{fmtPts(totalPts)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Cash paid (affiliate) · last 30 days</p>
          <p className="mt-1 text-2xl font-bold text-white">{fmtUsd(totalCash)}</p>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.id} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{g.label}</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {g.items.map((i) => (
              <div key={i.id} className="flex flex-col rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-white">{i.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{i.trigger}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS[i.status].cls}`}>
                    {STATUS[i.status].label}
                  </span>
                </div>

                <p className="mt-3 text-sm text-gray-200">
                  <span className="text-gray-500">Pays: </span>
                  {i.pays}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Last 30 days: {i.paid30.count.toLocaleString()} payout(s) ·{" "}
                  {i.currency === "cash" ? fmtUsd(i.paid30.cash) : fmtPts(i.paid30.points)}
                </p>

                {i.id === "welcome" ? (
                  <WelcomeBonusPanel initial={{ "bonus.welcome_points": welcome }} canEdit={canEdit} />
                ) : (
                  i.editHref && (
                    <Link
                      href={i.editHref}
                      className="mt-3 inline-flex items-center gap-1 self-start rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                    >
                      Edit in {i.editWhere} <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
