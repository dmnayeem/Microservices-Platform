import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { USER_HOME } from "@/lib/routes";
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
import { SIDEBAR_COOKIE } from "@/lib/stores/admin-ui-store";

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
    redirect(USER_HOME);
  }

  // Four independent reads, run together rather than as a four-deep waterfall
  // on every admin page. Same shape as the change in (main)/layout.tsx.
  //
  //  - perms: code defaults ← runtime config ← per-user overrides
  //  - modules: the nav the user actually gets
  //  - pathname: for the central route guard below
  //  - sidebarCollapsed: read as a cookie rather than from localStorage, so SSR
  //    and the first client render agree — no flash of an expanded sidebar.
  //
  // `getEffectiveModules` resolves permissions internally, but
  // `getEffectivePermissions` is request-cached, so this costs one query, not two.
  const [perms, modules, hdrs, cookieStore] = await Promise.all([
    getEffectivePermissions(session.user.id),
    getEffectiveModules(session.user.id),
    headers(),
    cookies(),
  ]);

  // Central route guard: a direct hit on a module the user can't access is
  // blocked here — even for pages that forgot their own guard. Nav-hidden AND
  // link-blocked. The /admin/no-access page itself is always reachable.
  const pathname = hdrs.get("x-pathname") ?? "";
  if (pathname && !pathname.startsWith("/admin/no-access")) {
    if (!pathAllowed(pathname, perms)) {
      redirect("/admin/no-access");
    }
  }

  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "1";

  // Live "pending work" counts → per-nav badges (permission-scoped, fail-safe).
  // Genuinely depends on `perms`, so it stays after the batch.
  const pendingCounts = await getPendingCounts(perms);
  const badges = badgesByModule(pendingCounts, perms);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Admin Sidebar (client component, manages its own collapse state) */}
      <AdminSidebar
        user={session.user}
        modules={modules}
        badges={badges}
        initialCollapsed={sidebarCollapsed}
      />

      {/* Client-side shell adjusts padding based on collapse state */}
      <AdminLayoutShell
        initialCollapsed={sidebarCollapsed}
        header={
          <AdminHeader
            user={session.user}
            // Total work waiting on this admin. Unlike a notification (which
            // vanishes once read) a count is durable, so it stays visible until
            // the queue is actually cleared.
            pendingTotal={Object.values(pendingCounts).reduce(
              (a, b) => a + b,
              0
            )}
            canViewNotifications={perms.has("notifications.view")}
          />
        }
      >
        {children}
      </AdminLayoutShell>
    </div>
  );
}
