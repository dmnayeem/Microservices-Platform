import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Compass, Info } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sourceLabel } from "@/lib/signup-source";

/**
 * Sign-up sources — where new accounts came from (Google, Facebook, WhatsApp,
 * a tagged link…) and how good each source's people turn out to be: verified,
 * did a task, still active. Recorded per account since tracking started
 * (lib/signup-source.ts); older accounts show as "Joined before tracking".
 */
export const dynamic = "force-dynamic";

const RANGES = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "365", label: "1 year", days: 365 },
  { id: "all", label: "All time", days: null },
] as const;

type Row = { source: string; signups: number; verified: number; worked: number; active7: number };
type Detail = { medium: string; campaign: string; referrer: string; landing: string; n: number };

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export default async function SignupSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; source?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "analytics.view"))) redirect("/admin");

  const sp = await searchParams;
  const range = RANGES.find((r) => r.id === sp.range) ?? RANGES[1];
  const since = range.days ? new Date(Date.now() - range.days * 86_400_000) : new Date(0);
  const picked = typeof sp.source === "string" && /^[a-z0-9._-]{1,40}$/.test(sp.source) ? sp.source : null;

  const userScope = Prisma.sql`u.role IN ('USER','TUTOR','AGENCY') AND u.email NOT LIKE '%@deleted.local' AND u."createdAt" >= ${since}`;

  const [rows, details, recent] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT COALESCE(u."signupSource", 'unknown') AS source,
        COUNT(*)::int AS signups,
        COUNT(*) FILTER (WHERE u."emailVerified" IS NOT NULL)::int AS verified,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "TaskSubmission" t
          WHERE t."userId" = u.id AND t.status IN ('APPROVED', 'AUTO_APPROVED')
        ))::int AS worked,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "UserActiveDay" a
          WHERE a."userId" = u.id AND a.date >= CURRENT_DATE - 7
        ))::int AS active7
      FROM "User" u
      WHERE ${userScope}
      GROUP BY 1
      ORDER BY 2 DESC`,
    picked
      ? prisma.$queryRaw<Detail[]>`
          SELECT COALESCE(u."signupMedium", '—') AS medium,
            COALESCE(u."signupCampaign", '—') AS campaign,
            COALESCE(u."signupReferrer", '—') AS referrer,
            COALESCE(u."signupLanding", '—') AS landing,
            COUNT(*)::int AS n
          FROM "User" u
          WHERE ${userScope} AND COALESCE(u."signupSource", 'unknown') = ${picked}
          GROUP BY 1, 2, 3, 4
          ORDER BY n DESC
          LIMIT 40`
      : Promise.resolve([] as Detail[]),
    prisma.user.findMany({
      where: {
        role: { in: ["USER", "TUTOR", "AGENCY"] },
        createdAt: { gte: since },
        NOT: { email: { endsWith: "@deleted.local" } },
        ...(picked ? { signupSource: picked === "unknown" ? null : picked } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        signupSource: true,
        signupCampaign: true,
        signupReferrer: true,
      },
    }),
  ]);

  const total = rows.reduce((s, r) => s + r.signups, 0);
  const tracked = rows.filter((r) => r.source !== "unknown").reduce((s, r) => s + r.signups, 0);
  const max = Math.max(1, ...rows.map((r) => r.signups));
  const href = (q: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const r = q.range ?? range.id;
    if (r !== "30") p.set("range", r);
    const s = q.source === undefined ? picked : q.source;
    if (s) p.set("source", s);
    const str = p.toString();
    return `/admin/signup-sources${str ? `?${str}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
          <Compass className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white">Sign-up sources</h1>
          <p className="text-sm text-slate-400">Where new accounts came from, and how many of them went on to work.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={href({ range: r.id })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                r.id === range.id ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">New accounts · {range.label.toLowerCase()}</p>
          <p className="mt-1 text-2xl font-bold text-white">{total.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">With a known source</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {tracked.toLocaleString()} <span className="text-base font-normal text-slate-500">{pct(tracked, total)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Top source</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {rows.find((r) => r.source !== "unknown") ? sourceLabel(rows.find((r) => r.source !== "unknown")!.source) : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <p>
          Links opened from WhatsApp, Telegram, Messenger or imo usually arrive with no trace and count as{" "}
          <b className="text-slate-200">Direct</b>. Add a tag to every link you share —{" "}
          <code className="text-slate-200">revtype.com/?utm_source=whatsapp&amp;utm_campaign=group1</code> — and
          they show here by name and campaign. Accounts created before tracking started show as{" "}
          <b className="text-slate-200">Joined before tracking</b>.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Source</th>
              <th className="px-3 py-2.5 text-right font-semibold">Accounts</th>
              <th className="px-3 py-2.5 text-right font-semibold">Email verified</th>
              <th className="px-3 py-2.5 text-right font-semibold">Did a task</th>
              <th className="px-3 py-2.5 text-right font-semibold">Active last 7 days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No new accounts in this period.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.source} className={r.source === picked ? "bg-sky-500/10" : "hover:bg-slate-900/50"}>
                <td className="px-4 py-2.5">
                  <Link href={href({ source: r.source === picked ? null : r.source })} className="block">
                    <span className="font-semibold text-white hover:underline">{sourceLabel(r.source)}</span>
                    <span className="mt-1 block h-1.5 rounded-full bg-slate-800">
                      <span
                        className={`block h-1.5 rounded-full ${r.source === "unknown" ? "bg-slate-600" : "bg-sky-500"}`}
                        style={{ width: `${Math.max(2, (r.signups / max) * 100)}%` }}
                      />
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-white">
                  {r.signups.toLocaleString()} <span className="text-xs font-normal text-slate-500">{pct(r.signups, total)}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-slate-300">{pct(r.verified, r.signups)}</td>
                <td className="px-3 py-2.5 text-right text-slate-300">{pct(r.worked, r.signups)}</td>
                <td className="px-3 py-2.5 text-right text-slate-300">{pct(r.active7, r.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {picked && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="flex-1 text-sm font-bold text-white">{sourceLabel(picked)} — campaigns, sites and landing pages</p>
            <Link href={href({ source: null })} className="text-xs text-sky-400 hover:underline">
              Close
            </Link>
          </div>
          {details.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing more recorded for this source.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1.5 text-left font-semibold">Type</th>
                    <th className="py-1.5 text-left font-semibold">Campaign</th>
                    <th className="py-1.5 text-left font-semibold">Site / app</th>
                    <th className="py-1.5 text-left font-semibold">First page</th>
                    <th className="py-1.5 text-right font-semibold">Accounts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-300">
                  {details.map((d, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3">{d.medium}</td>
                      <td className="py-1.5 pr-3">{d.campaign}</td>
                      <td className="max-w-48 truncate py-1.5 pr-3">{d.referrer}</td>
                      <td className="max-w-48 truncate py-1.5 pr-3">{d.landing}</td>
                      <td className="py-1.5 text-right font-semibold text-white">{d.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="mb-3 text-sm font-bold text-white">
          Newest accounts{picked ? ` from ${sourceLabel(picked)}` : ""}
        </p>
        <ul className="divide-y divide-slate-800/70">
          {recent.length === 0 && <li className="py-2 text-xs text-slate-500">None.</li>}
          {recent.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
              <Link href={`/admin/users/${u.id}`} className="min-w-0 flex-1 truncate text-white hover:underline">
                {u.name || u.email}
              </Link>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
                {sourceLabel(u.signupSource)}
                {u.signupCampaign ? ` · ${u.signupCampaign}` : ""}
              </span>
              <span className="text-[11px] text-slate-500">{formatDistanceToNow(u.createdAt, { addSuffix: true })}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
