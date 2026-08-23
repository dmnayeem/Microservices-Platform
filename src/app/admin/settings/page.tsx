import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SystemSettingsForm } from "@/components/admin/settings/system-settings-form";

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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure platform-wide settings across all categories.
          {!canEdit && (
            <span className="ml-2 text-amber-400">
              View-only — your role cannot edit settings.
            </span>
          )}
        </p>
      </div>

      <SystemSettingsForm initial={initial} canEdit={canEdit} />

      {/* System Info */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
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
