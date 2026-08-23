import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isGeminiConfigured } from "@/lib/gemini";
import { Sparkles, Settings, Activity, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { AiContentGenerator } from "@/components/admin/ai/ai-content-generator";

export default async function AIContentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ai.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "ai.manage");
  const configured = isGeminiConfigured();

  // Pull last 30 days of AI calls from AuditLog (entity = "AI")
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [recent, callsLast30, callsToday] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entity: "AI", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.auditLog.count({
      where: { entity: "AI", createdAt: { gte: since } },
    }),
    prisma.auditLog.count({
      where: {
        entity: "AI",
        createdAt: { gte: todayStart },
      },
    }),
  ]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-400" />
          AI Content Management
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Powered by Google Gemini · {configured ? "configured" : "not configured"}
        </p>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <KeyRound className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                API Status
              </p>
              <p
                className={`text-base font-semibold ${
                  configured ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {configured ? "Connected" : "Not configured"}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Provider: <span className="text-slate-300">Google Gemini</span> ·
            Model:{" "}
            <span className="text-slate-300 font-mono">
              {process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"}
            </span>
          </p>
          <Link
            href="/admin/settings?tab=integrations"
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700"
          >
            <Settings className="w-3 h-3" />
            Manage API Key
          </Link>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                Calls Last 30 Days
              </p>
              <p className="text-2xl font-bold text-white tabular-nums">
                {callsLast30}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{callsToday} today</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                Features Enabled
              </p>
              <p className="text-base font-semibold text-white">All on</p>
            </div>
          </div>
          <ul className="text-xs text-slate-400 space-y-0.5">
            <li>✓ Quiz generation</li>
            <li>✓ Social posts · task descriptions</li>
            <li>✓ Course outlines · marketing copy</li>
          </ul>
        </div>
      </div>

      {/* Generator */}
      {canManage && (
        <AiContentGenerator configured={configured} />
      )}

      {/* History */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Generation History (last 30 days)
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No AI calls yet
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {recent.map((log) => {
              const data = log.newData as {
                type?: string;
                topic?: string;
                success?: boolean;
              } | null;
              return (
                <li key={log.id} className="py-3 flex items-center gap-3">
                  {data?.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      <span className="text-slate-500 font-mono">
                        {data?.type ?? "?"}
                      </span>{" "}
                      · {data?.topic ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {format(log.createdAt, "MMM d, HH:mm")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
