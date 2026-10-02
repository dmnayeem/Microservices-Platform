import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SystemSettingsForm } from "@/components/admin/settings/system-settings-form";
import { SOCIAL_PLATFORMS } from "@/lib/social-tasks";
import { SETTINGS_ELSEWHERE } from "@/lib/admin-settings-catalog";
import Link from "next/link";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "settings.edit");

  // Load all current settings — the form uses key-based merge with defaults
  const rows = await prisma.systemSetting.findMany();
  const initial: Record<string, unknown> = {};
  for (const r of rows) {
    initial[r.key] =
      r.value && typeof r.value === "object" && "v" in (r.value as object)
        ? (r.value as { v: unknown }).v
        : r.value;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Platform-wide settings, grouped by what you are trying to do. Search
          finds any setting — including the ones kept on their feature&rsquo;s
          own page.
          {!canEdit && (
            <span className="ml-2 text-amber-400">
              View-only — your role cannot edit settings.
            </span>
          )}
        </p>
      </div>

      <SystemSettingsForm
        platformList={SOCIAL_PLATFORMS.map((p) => ({
          key: p.key,
          label: p.label,
          emoji: p.emoji,
        }))} initial={initial} canEdit={canEdit} />

      {/*
        Settings that are real but live on another screen.

        Listed rather than left to be discovered: an admin who cannot find
        "referral commission" here concludes it does not exist, and the last
        time that happened the answer was found by reading the source. The
        search box above indexes these too.
      */}
      <details className="group bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-6">
        <summary className="cursor-pointer list-none text-sm font-semibold text-white">
          Every setting kept on another page ({SETTINGS_ELSEWHERE.length})
          <span className="ml-2 text-xs font-normal text-slate-500 group-open:hidden">
            show
          </span>
        </summary>
        <p className="mt-1 text-xs text-slate-500">
          These are configured where the thing they configure lives. The search
          box above finds them too, and each tab links to the ones that belong
          with it.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SETTINGS_ELSEWHERE.map((s) => (
            <li key={`${s.href}:${s.label}`}>
              <Link
                href={s.href}
                className="block rounded-lg border border-slate-800 bg-slate-950/40 p-3 hover:border-slate-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">
                    {s.label}
                  </span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                    {s.where}
                  </span>
                  {s.status === "not-active" && (
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      Not active yet
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {s.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </details>

      {/* System Info */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-white mb-4">
          System Information
        </h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Version
            </p>
            <p className="text-white font-mono">1.0.0</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Environment
            </p>
            <p className="text-white font-mono">
              {process.env.NODE_ENV || "development"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Database
            </p>
            <p className="text-white font-mono">PostgreSQL · Prisma</p>
          </div>
        </div>
      </div>
    </div>
  );
}
