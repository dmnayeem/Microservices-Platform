import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { USER_HOME } from "@/lib/routes";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";
import { AdminLayoutShell } from "@/components/admin/layout-shell";
import { isAdmin, moduleForPath, type UserRole } from "@/lib/rbac";
import {
  getEffectivePermissions,
  getEffectiveModules,
  getModuleDecisions,
  pathAllowed,
} from "@/lib/permissions";
import { ModuleOffNotice } from "@/components/admin/module-off-notice";
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
  const [access, hdrs, cookieStore] = await Promise.all([
    // A DB failure here must not throw the whole admin shell into the error
    // boundary — but it must not grant anything either. `loadAccessUser`
    // already serves a recent last-known-good row through a blip; with none,
    // we land on the "temporarily unavailable" card below (deny, not allow).
    Promise.all([
      getEffectivePermissions(session.user.id),
      getEffectiveModules(session.user.id),
    ]).catch((e) => {
      console.error("[admin/layout] access resolution failed:", e);
      return null;
    }),
    headers(),
    cookies(),
  ]);
  const pathname = hdrs.get("x-pathname") ?? "";
  if (!access) return <AdminAccessUnavailable retryHref={pathname || "/admin"} />;
  const [perms, modules] = access;

  // Central route guard: a direct hit on a module the user can't access is
  // blocked here — even for pages that forgot their own guard. Nav-hidden AND
  // link-blocked. The /admin/no-access page itself is always reachable.
  if (pathname && !pathname.startsWith("/admin/no-access")) {
    if (!pathAllowed(pathname, perms)) {
      redirect("/admin/no-access");
    }
    // Page rules (super admin: off for all / per role / per admin). A page
    // switched off goes back to the dashboard with a notice; a page reachable
    // only through a permission another page's grant brought in is refused
    // like any missing permission. The super admin is never refused.
    const mod = moduleForPath(pathname);
    if (mod && mod.href !== "/admin") {
      const decisions = await getModuleDecisions(session.user.id).catch((e) => {
        console.error("[admin/layout] module decisions failed:", e);
        return null;
      });
      // Can't tell whether this page is switched off → refuse, never allow.
      if (!decisions) return <AdminAccessUnavailable retryHref={pathname} />;
      const decision = decisions.get(mod.href);
      if (decision && !decision.visible) {
        redirect(
          decision.source === "no-permission" || decision.source === "locked"
            ? "/admin/no-access"
            : "/admin?notice=page-off"
        );
      }
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
        <Suspense fallback={null}>
          <ModuleOffNotice />
        </Suspense>
        {children}
      </AdminLayoutShell>
    </div>
  );
}

/** Access could not be resolved (DB unreachable, no recent memo). Deny, kindly. */
function AdminAccessUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-white">Admin is temporarily unavailable</h1>
        <p className="mt-2 text-gray-400 text-sm">
          We couldn&apos;t verify your access just now. This is usually a brief database
          hiccup — try again in a moment.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {/* A plain anchor: a full request re-runs this layout from scratch. */}
          <a
            href={retryHref}
            className="px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold"
          >
            Retry
          </a>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
