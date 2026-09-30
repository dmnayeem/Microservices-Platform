import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { abuseAccess } from "@/lib/abuse/access";
import { getAbuseSettings } from "@/lib/abuse/settings";
import { CASE_STATUSES, SEVERITIES } from "@/lib/abuse/policy";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import {
  CaseDrawerHost,
  LogComplaintButton,
  ProviderResponse,
  AbuseSettingsForm,
} from "@/components/admin/abuse/abuse-center";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Abuse Center — "abuse → detect fast → suspend → remove → preserve logs →
 * respond to the provider fast", in one place. Cases come from
 * `raiseAbuseSignal()` (uploads, links, fraud, reports, chargebacks, the
 * public /abuse form) and from complaints logged here by hand.
 */
const TABS = [
  { id: "cases", label: "Cases" },
  { id: "provider", label: "Provider response" },
  { id: "settings", label: "Settings" },
];

const KINDS = [
  "UPLOAD_BLOCKED",
  "UPLOAD_SUSPICIOUS",
  "LINK_UNSAFE",
  "OUTBOUND_LIMIT",
  "FRAUD_PATTERN",
  "USER_REPORT",
  "PROVIDER_COMPLAINT",
];

const SEV_TONE: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-300 border-red-500/40",
  HIGH: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LOW: "bg-slate-700/40 text-slate-300 border-slate-700",
};
const STATUS_TONE: Record<string, string> = {
  OPEN: "text-red-300",
  ACTIONED: "text-amber-300",
  RESOLVED: "text-emerald-300",
  DISMISSED: "text-slate-400",
};

type SP = { tab?: string; status?: string; severity?: string; kind?: string; user?: string; case?: string };

export default async function AbuseCenterPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await abuseAccess();
  if (!access.userId) redirect("/login");
  if (!access.view) redirect("/admin");
  const sp = await searchParams;
  const tab = pickTab(TABS, sp.tab);

  const header = (
    <div>
      <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
        <ShieldAlert className="h-6 w-6 text-red-400" />
        Abuse Center
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Every abuse signal becomes a case. Keep the evidence, act in one click, and answer the host or network.
      </p>
    </div>
  );
  const tabs = <AdminTabs tabs={TABS} active={tab} basePath="/admin/abuse" />;

  if (tab === "settings") {
    return (
      <div className="space-y-6">
        {header}
        {tabs}
        <AbuseSettingsForm initial={await getAbuseSettings()} canEdit={access.manage} />
      </div>
    );
  }

  if (tab === "provider") {
    const recent = await prisma.abuseCase.findMany({
      orderBy: [{ lastSeenAt: "desc" }],
      take: 100,
      select: { id: true, kind: true, severity: true, status: true, summary: true, providerRef: true, lastSeenAt: true },
    });
    return (
      <div className="space-y-6">
        {header}
        {tabs}
        <ProviderResponse
          cases={recent.map((c) => ({ ...c, lastSeenAt: c.lastSeenAt.toISOString() }))}
          initialCaseId={sp.case ?? null}
          canEdit={access.manage}
        />
      </div>
    );
  }

  // ── Cases ──
  const where: Prisma.AbuseCaseWhereInput = {};
  const status = sp.status ?? "OPEN";
  if (status !== "ALL" && (CASE_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (sp.severity && (SEVERITIES as string[]).includes(sp.severity)) where.severity = sp.severity;
  if (sp.kind && KINDS.includes(sp.kind)) where.kind = sp.kind;
  const userQ = sp.user?.trim();
  if (userQ) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ id: userQ }, { email: userQ.toLowerCase() }, { username: userQ }] },
      select: { id: true },
    });
    where.userId = u?.id ?? userQ;
  }

  const cases = await prisma.abuseCase.findMany({ where, orderBy: [{ lastSeenAt: "desc" }], take: 200 });
  const counts = (await prisma.abuseCase.groupBy({
    by: ["severity"],
    where: { status: "OPEN" },
    _count: { _all: true },
  })) as unknown as Array<{ severity: string; _count: { _all: number } }>;
  const userIds = [...new Set(cases.map((c) => c.userId).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, status: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const openBySev = Object.fromEntries(counts.map((c) => [c.severity, c._count._all]));

  const sel = "rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white";

  return (
    <div className="space-y-6">
      {header}
      {tabs}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/abuse?status=OPEN&severity=${s}`}
            className={`rounded-xl border p-4 ${SEV_TONE[s]}`}
          >
            <p className="text-2xl font-bold">{openBySev[s] ?? 0}</p>
            <p className="text-xs uppercase tracking-wide">Open · {s.toLowerCase()}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" action="/admin/abuse" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="cases" />
          <label className="text-xs text-slate-400">
            Status
            <select name="status" defaultValue={status} className={`mt-1 block ${sel}`}>
              <option value="ALL">All</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Severity
            <select name="severity" defaultValue={sp.severity ?? ""} className={`mt-1 block ${sel}`}>
              <option value="">Any</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Kind
            <select name="kind" defaultValue={sp.kind ?? ""} className={`mt-1 block ${sel}`}>
              <option value="">Any</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>{k.replace(/_/g, " ").toLowerCase()}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            User (id, email or username)
            <input name="user" defaultValue={userQ ?? ""} className={`mt-1 block w-56 max-w-full ${sel}`} />
          </label>
          <button className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600">Filter</button>
        </form>
        {access.manage && <LogComplaintButton />}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-800 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Case</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Signals</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No cases match. Signals open cases automatically as they arrive.
                </td>
              </tr>
            )}
            {cases.map((c) => {
              const u = c.userId ? userMap.get(c.userId) : null;
              const qs = new URLSearchParams({ ...(sp as Record<string, string>), case: c.id }).toString();
              return (
                <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${SEV_TONE[c.severity] ?? SEV_TONE.LOW}`}>
                      {c.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/abuse?${qs}`} scroll={false} className="font-medium text-blue-300 hover:underline">
                      {c.summary.length > 110 ? c.summary.slice(0, 110) + "…" : c.summary}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {c.kind.replace(/_/g, " ").toLowerCase()}
                      {c.entityType ? ` · ${c.entityType}` : ""}
                      {c.providerRef ? ` · ref ${c.providerRef}` : ""}
                      {c.withdrawalsHeld ? " · withdrawals held" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u ? (
                      <Link href={`/admin/users/${u.id}`} className="text-slate-200 hover:underline">
                        {u.name ?? u.email}
                        <span className="block text-slate-500">{u.status.toLowerCase()}</span>
                      </Link>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{c.signalCount}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{format(c.lastSeenAt, "MMM d, HH:mm")}</td>
                  <td className={`px-3 py-2 text-xs font-semibold ${STATUS_TONE[c.status] ?? ""}`}>{c.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CaseDrawerHost openCaseId={sp.case ?? null} />
    </div>
  );
}
