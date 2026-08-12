import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";
import { AdminLayoutShell } from "@/components/admin/layout-shell";
import { isAdmin, type UserRole } from "@/lib/rbac";
import {
  getEffectivePermissions,
  getEffectiveModules,
  pathAllowed,
} from "@/lib/permissions";
import { getPendingCounts, badgesByModule } from "@/lib/admin/pending-counts";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Server-side redirect if not authenticated
  if (!session?.user) {
    redirect("/login");
  }

  // Server-side redirect if not admin (any admin role)
  const userRole = session.user.role as UserRole | undefined;
  if (!isAdmin(userRole)) {
    redirect("/dashboard");
  }

  // Effective permissions (code defaults ← runtime config ← per-user overrides).
  const perms = await getEffectivePermissions(session.user.id);

  // Central route guard: a direct hit on a module the user can't access is
  // blocked here — even for pages that forgot their own guard. Nav-hidden AND
  // link-blocked. The /admin/no-access page itself is always reachable.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !pathname.startsWith("/admin/no-access")) {
    if (!pathAllowed(pathname, perms)) {
      redirect("/admin/no-access");
    }
  }

  const modules = await getEffectiveModules(session.user.id);

  // Live "pending work" counts → per-nav badges (permission-scoped, fail-safe).
  const pendingCounts = await getPendingCounts(perms);
  const badges = badgesByModule(pendingCounts, perms);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Admin Sidebar (client component, manages its own collapse state) */}
      <AdminSidebar user={session.user} modules={modules} badges={badges} />

      {/* Client-side shell adjusts padding based on collapse state */}
      <AdminLayoutShell header={<AdminHeader user={session.user} />}>
        {children}
      </AdminLayoutShell>
    </div>
  );
}
