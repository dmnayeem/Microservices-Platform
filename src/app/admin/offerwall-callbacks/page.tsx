import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FileText, Clock, CheckCircle, XCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { AdminTable } from "@/components/admin/ui/admin-table";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function OfferwallCallbacksPage({
  searchParams,
}: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "offerwalls.view"))) redirect("/admin");

  const params = await searchParams;
  const status = params.status || "";
  const where = status ? { status } : {};

  const [
    callbacks,
    pendingCount,
    approvedCount,
    rejectedCount,
    fraudCount,
  ] = await Promise.all([
    prisma.offerwallCallback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.offerwallCallback.count({ where: { status: "PENDING" } }),
    prisma.offerwallCallback.count({ where: { status: "APPROVED" } }),
    prisma.offerwallCallback.count({ where: { status: "REJECTED" } }),
    prisma.offerwallCallback.count({ where: { status: "FRAUD" } }),
  ]);

  // Resolve users
  const userIds = Array.from(new Set(callbacks.map((c) => c.userId)));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <FileText className="w-6 h-6 text-cyan-400" />
          Offerwall Callback Logs
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Postback callbacks from offerwall providers — review, approve, reject.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Clock className="w-5 h-5" />}
          tone="amber"
          value={pendingCount}
          label="Pending"
        />
        <Stat
          icon={<CheckCircle className="w-5 h-5" />}
          tone="emerald"
          value={approvedCount}
          label="Approved"
        />
        <Stat
          icon={<XCircle className="w-5 h-5" />}
          tone="red"
          value={rejectedCount}
          label="Rejected"
        />
        <Stat
          icon={<ShieldAlert className="w-5 h-5" />}
          tone="purple"
          value={fraudCount}
          label="Fraud"
        />
      </div>

      <div className="border-b border-slate-800 flex gap-1">
        <Link
          href="/admin/offerwall-callbacks"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            !status
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          All
        </Link>
        {["PENDING", "APPROVED", "REJECTED", "FRAUD"].map((s) => (
          <Link
            key={s}
            href={`/admin/offerwall-callbacks?status=${s}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize ${
              status === s
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {s.toLowerCase()}
          </Link>
        ))}
      </div>

      {callbacks.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No callbacks yet</h3>
          <p className="text-sm text-slate-400">
            Postback callbacks will appear here when offerwall providers send them.
          </p>
        </div>
      ) : (
        <AdminTable
          rows={callbacks}
          getRowKey={(c) => c.id}
          columns={[
            {
              key: "user",
              header: "User",
              primary: true,
              cell: (c) => {
                const u = userMap.get(c.userId);
                return (
                  <span className="text-sm text-white">
                    {u?.name ?? u?.email ?? "—"}
                  </span>
                );
              },
            },
            {
              key: "transaction",
              header: "Transaction",
              mobileHidden: true,
              cell: (c) => (
                <span className="font-mono text-xs text-slate-300">
                  {c.transactionId.slice(0, 12)}…
                </span>
              ),
            },
            {
              key: "payout",
              header: "Payout",
              cell: (c) => (
                <span className="text-sm">
                  <span className="text-amber-400 tabular-nums">{c.userPayout}</span>{" "}
                  <span className="text-slate-500">pts</span>
                </span>
              ),
            },
            {
              key: "fraud",
              header: "Fraud Score",
              cell: (c) => {
                const fraudCls =
                  c.fraudScore >= 70
                    ? "bg-red-500/15 text-red-400"
                    : c.fraudScore >= 40
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-emerald-500/15 text-emerald-400";
                return (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${fraudCls}`}>
                    {c.fraudScore}%
                  </span>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              cell: (c) => (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.status === "APPROVED"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : c.status === "PENDING"
                      ? "bg-amber-500/15 text-amber-400"
                      : c.status === "REJECTED"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-purple-500/15 text-purple-400"
                  }`}
                >
                  {c.status}
                </span>
              ),
            },
            {
              key: "when",
              header: "When",
              mobileHidden: true,
              cell: (c) => (
                <span className="text-xs text-slate-400">
                  {format(c.createdAt, "MMM d, HH:mm")}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function Stat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "amber" | "emerald" | "red" | "purple";
  value: number;
  label: string;
}) {
  const cls = {
    amber: "bg-amber-500/10 text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    red: "bg-red-500/10 text-red-400",
    purple: "bg-purple-500/10 text-purple-400",
  }[tone];
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${cls}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
