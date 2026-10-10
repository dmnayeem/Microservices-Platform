import Link from "next/link";
import { ExternalLink, Heart, MessageCircle, Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSocialEarningConfig } from "@/lib/social-earning";
import { SOCIAL_ACTIONS, type SocialAction } from "@/lib/social-actions";

/**
 * Admin → Monetization → "Creator earnings": users earning points from the
 * likes, comments, shares, views and votes their posts get (and, if switched
 * on, for engaging). The system already existed — lib/social-earning.ts, rates
 * on Feed settings → Social earning, per-plan switch + multiplier on each
 * package — but nothing on the Monetization page pointed to it. This panel
 * shows how it is set up right now and what it has paid, and links to the two
 * places it is edited.
 */

const ACTION_LABEL: Record<SocialAction, string> = {
  POST_CREATE: "Writing a post",
  VIEW_RECEIVED: "Views on a post",
  LIKE_RECEIVED: "Likes on a post",
  VOTE_RECEIVED: "Poll votes",
  COMMENT_RECEIVED: "Comments on a post",
  SHARE_RECEIVED: "Shares of a post",
  DONATION_RECEIVED: "Donations received",
  MENTION_RECEIVED: "Being mentioned",
};

function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        on ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/60 text-slate-400"
      }`}
    >
      {children}: {on ? "On" : "Off"}
    </span>
  );
}

const rule = (r: { enabled: boolean; points: number; xp: number; perCount: number; window: string }, modeOn: boolean) =>
  !modeOn || !r.enabled || (r.points <= 0 && r.xp <= 0)
    ? "—"
    : `${r.points} pts${r.xp ? ` + ${r.xp} XP` : ""}${r.perCount > 1 ? ` per ${r.perCount}` : ""}${
        r.perCount > 1 ? ` (${r.window})` : ""
      }`;

export async function CreatorEarningsPanel() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [cfg, totals, top, plans] = await Promise.all([
    getSocialEarningConfig(),
    prisma.$queryRaw<{ pts: number; people: number; payouts: number }[]>`
      SELECT COALESCE(SUM(ABS(points)), 0)::float8 AS pts, COUNT(DISTINCT "userId")::int AS people, COUNT(*)::int AS payouts
      FROM "Transaction" WHERE reference LIKE 'social\\_%' AND "createdAt" >= ${since}`,
    prisma.$queryRaw<{ userId: string; name: string | null; email: string; pts: number }[]>`
      SELECT t."userId", u.name, u.email, SUM(ABS(t.points))::float8 AS pts
      FROM "Transaction" t JOIN "User" u ON u.id = t."userId"
      WHERE t.reference LIKE 'social\\_%' AND t."createdAt" >= ${since}
      GROUP BY 1, 2, 3 ORDER BY pts DESC LIMIT 10`,
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: { accessLevel: "asc" },
      select: { id: true, name: true, isDefault: true, socialEarningEnabled: true, socialEarningMultiplier: true },
    }),
  ]);
  const t = totals[0] ?? { pts: 0, people: 0, payouts: 0 };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-pink-500/15 text-pink-300">
            <Heart className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white">Creator earnings — likes &amp; comments</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Users earn points when their posts get likes, comments, shares, views and votes. Optionally, people also
              earn for engaging. Rates and caps are set once for everyone; each plan can switch it off or scale it.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill on={cfg.enabled}>Master switch</Pill>
          <Pill on={cfg.posterModeEnabled}>Post owner earns</Pill>
          <Pill on={cfg.engagerModeEnabled}>Person who likes / comments earns</Pill>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/settings/feed?tab=social-earning"
            className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pink-500"
          >
            <Settings2 className="h-3.5 w-3.5" /> Edit rates, modes &amp; caps
          </Link>
          <Link
            href="/admin/packages"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            Per-plan on/off &amp; multiplier <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/admin/visibility?tab=user"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            Switch it off for one person <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Points paid · last 30 days", Math.round(t.pts).toLocaleString()],
          ["People who earned", t.people.toLocaleString()],
          ["Payouts", t.payouts.toLocaleString()],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="mt-1 text-2xl font-bold text-white">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-white">
            <MessageCircle className="h-4 w-4 text-sky-400" /> What each action pays now
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1.5 text-left font-semibold">Action</th>
                <th className="py-1.5 text-right font-semibold">Post owner gets</th>
                <th className="py-1.5 text-right font-semibold">Engager gets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {SOCIAL_ACTIONS.map((a) => {
                const r = cfg.perActivity[a];
                if (!r) return null;
                return (
                  <tr key={a}>
                    <td className="py-1.5 text-slate-200">{ACTION_LABEL[a] ?? a}</td>
                    <td className="py-1.5 text-right text-slate-300">{rule(r.recipient, cfg.enabled && cfg.posterModeEnabled)}</td>
                    <td className="py-1.5 text-right text-slate-300">{rule(r.actor, cfg.enabled && cfg.engagerModeEnabled)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-500">
            Limits: {cfg.dailyCapPerUser.toLocaleString()} pts per person per day · post owner{" "}
            {cfg.posterDailyCapPerUser.toLocaleString()} · engager {cfg.engagerDailyCapPerUser.toLocaleString()} · from
            one other person {cfg.pairDailyCapPerUser.toLocaleString()} · per post {cfg.capPerPost.toLocaleString()} ·
            account at least {cfg.minAccountAgeHours}h old
            {cfg.minLevelToEarn > 0 ? ` · level ${cfg.minLevelToEarn}+` : ""}.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-3 text-sm font-bold text-white">Plans</p>
            <ul className="divide-y divide-slate-800/70">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link href={`/admin/packages/${p.id}/edit`} className="flex-1 text-slate-200 hover:underline">
                    {p.name}
                    {p.isDefault && <span className="ml-1.5 text-[10px] text-slate-500">(default)</span>}
                  </Link>
                  <span className={p.socialEarningEnabled ? "text-emerald-300" : "text-slate-500"}>
                    {p.socialEarningEnabled ? `earns · ${p.socialEarningMultiplier}×` : "off"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-3 text-sm font-bold text-white">Top earners · last 30 days</p>
            {top.length === 0 ? (
              <p className="text-xs text-slate-500">Nobody has earned from posts in the last 30 days.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {top.map((r, i) => (
                  <li key={r.userId} className="flex items-center gap-2">
                    <span className="w-5 text-right text-xs text-slate-500">{i + 1}.</span>
                    <Link href={`/admin/users/${r.userId}`} className="min-w-0 flex-1 truncate text-slate-200 hover:underline">
                      {r.name || r.email}
                    </Link>
                    <span className="font-semibold text-white">{Math.round(r.pts).toLocaleString()} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
