import { redirect, notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { PushPermissionPrompt } from "@/components/user/primitives/push-permission-prompt";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { BalanceSync } from "@/components/providers/balance-sync";
import { FirstTouchReport } from "@/components/providers/first-touch";
import { TaskRequirementsGate } from "@/components/user/tasks/task-requirements-gate";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { BottomTabBar } from "@/components/dashboard/bottom-tab-bar";
import { AppRefreshShell } from "@/components/pwa/app-refresh-shell";
import { getEffectiveFeatures } from "@/lib/packages";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { isPathHidden } from "@/lib/page-visibility";
import { PageAccessGuard } from "@/components/dashboard/page-access-guard";
import { AnchorAdBar } from "@/components/user/primitives/anchor-ad-bar";
import { CelebrationHost } from "@/components/user/primitives/celebration-host";
import { DeviceBeacon } from "@/components/providers/device-beacon";
import { PwaSeenBeacon } from "@/components/pwa/pwa-seen-beacon";
import { PwaLaunchHome } from "@/components/pwa/pwa-launch-home";
import { getPwaRewardConfig } from "@/lib/pwa-install";
import { isStaffRole } from "@/lib/staff";
import { maintenanceFor } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/dashboard/maintenance-screen";
import { getAppNavConfig, DEFAULT_APP_NAV } from "@/lib/nav-config-server";
import { isPublicCatalogPath } from "@/lib/public-catalog";
import { GuestShell } from "@/components/public/guest-shell";
import { guestCatalogStatus } from "@/lib/public-catalog-data";
import { utcDay } from "@/lib/active-days";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Server-side redirect if not authenticated
  // This prevents any flash - user never sees the page
  if (!session?.user) {
    // Except the public catalog (marketplace / course browse + detail pages),
    // which a logged-out visitor and a search engine get in a small guest
    // frame. `x-pathname` is set from the real URL by middleware.ts, which
    // also only lets a guest through to these exact paths
    // (lib/public-catalog.ts) — every other page still redirects here.
    const guestPath = (await headers()).get("x-pathname") ?? "";
    if (guestPath && isPublicCatalogPath(guestPath)) {
      const maintenance = await maintenanceFor(null).catch(() => ({ active: false, message: "" }));
      if (maintenance.active) return <MaintenanceScreen message={maintenance.message} />;
      // Decided here, above loading.tsx's Suspense boundary, so a missing or
      // unpublished item is a real 404 (not a streamed 200) for crawlers.
      // A DB failure here must not throw from the layout (that takes the guest
      // frame down with it). Let the page render and decide — its own read
      // either 404s or lands on the (main) error boundary with a Retry.
      const status = await guestCatalogStatus(guestPath).catch((e) => {
        console.error("[main/layout] guestCatalogStatus failed:", e);
        return { ok: true } as const;
      });
      if ("redirect" in status) permanentRedirect(status.redirect);
      if (!status.ok) notFound();
      return <GuestShell>{children}</GuestShell>;
    }
    redirect("/login");
  }

  // These three are independent of one another, so they run together.
  //
  // They used to be three sequential `await`s after the session — a four-deep
  // waterfall on EVERY page in the authenticated app, adding two full database
  // round-trips before any page could begin rendering. That is the tax that
  // made everything feel slow, and it was paid on every navigation.
  //
  //  - getEffectiveFeatures: package + per-user overrides → hides disabled nav
  //  - getHiddenPaths: super-admin page visibility → nav hiding + route guard
  //  - the avatar: the session doesn't carry it, and the header/sidebar need it.
  //    Short cache so a new upload appears after PhotoModal's router.refresh.
  //  - maintenanceFor: the admin's Maintenance Mode switch. It joins this
  //    Promise.all rather than sitting in front of it so a platform that is UP
  //    — every request but the rare one — pays nothing extra for the check.
  //  - getAppNavConfig: the admin-edited tab bar / header / sidebar menus
  //    (Settings -> Navigation). Cached setting reads, in the same batch.
  const [{ enabled }, hiddenPaths, dbUser, maintenance, ui, hdrs, nav, pwaReward] = await Promise.all([
    getEffectiveFeatures(session.user.id),
    getHiddenPaths(session.user.id),
    prisma.user
      .findUnique({
        where: { id: session.user.id },
        select: {
          avatar: true,
          pwaRewardedAt: true,
          pwaFirstSeenAt: true,
          pwaLastSeenAt: true,
          pwaUninstalledAt: true,
          pwaPlatform: true,
        },
        cacheStrategy: { ttl: 10, swr: 30 },
      })
      .catch(() => null),
    maintenanceFor(session.user.id).catch(() => ({
      // Never close the platform because the settings read failed — an
      // unreachable database must not look like a deliberate shutdown.
      active: false,
      message: "",
    })),
    getUiToggles().catch(() => null),
    headers(),
    getAppNavConfig().catch(() => DEFAULT_APP_NAV),
    // App-install reward (cached settings) — only for the install prompt's line.
    getPwaRewardConfig().catch(() => null),
  ]);

  // Server-side page-visibility guard: a hidden page never renders on a hard
  // load. `x-pathname` comes from middleware, which does not run in `next dev`
  // on Next 16 — without it this is skipped and PageAccessGuard (client, and
  // the only guard on soft navigation, since this layout does not re-render
  // between its pages) still redirects.
  const pathname = hdrs.get("x-pathname") ?? "";
  if (pathname && isPathHidden(pathname, hiddenPaths)) {
    redirect("/no-access");
  }

  // Closed for everyone but staff, who need to be able to see the fix land.
  if (maintenance.active) {
    return <MaintenanceScreen message={maintenance.message} />;
  }
  const features = Array.from(enabled);
  const avatar = dbUser?.avatar ?? null;
  const installRewardPoints =
    pwaReward?.enabled && !dbUser?.pwaRewardedAt && !isStaffRole(session.user.role) ? pwaReward.points : 0;
  // The platform this user has the app installed on — so a browser visit on
  // that same kind of device is not asked to install it again. Not counted as
  // installed once it was removed (a browser offered install again) or hasn't
  // been opened in 30 days (iPhone never reports a removal): then the prompt
  // comes back.
  const appSince = utcDay(29);
  const installedPlatform =
    dbUser?.pwaFirstSeenAt &&
    !dbUser.pwaUninstalledAt &&
    (dbUser.pwaLastSeenAt ?? dbUser.pwaFirstSeenAt) >= appSince
      ? dbUser.pwaPlatform ?? null
      : null;

  return (
    <div className="min-h-screen bg-(--app-page)">
      {/* Redirect away from pages an admin has hidden for this user. */}
      <PageAccessGuard hiddenPaths={hiddenPaths} />

      {/* Sidebar */}
      <Sidebar
        user={session.user}
        features={features}
        avatar={avatar}
        hiddenPaths={hiddenPaths}
        menu={nav.sidebar}
      />

      {/* Main Content */}
      {/* Rail width at each tier: 0 (phone) → 256px (md) → 288px (lg). */}
      <div className="md:pl-[280px]">
        {/* Header */}
        <Header
          user={session.user}
          avatar={avatar}
          hiddenPaths={hiddenPaths}
          config={nav.header}
          tabPaths={nav.bottomTabs.map((t) => t.href)}
        />

        {/* Page Content */}
        {/* scroll-mt keeps in-page anchor jumps clear of the sticky header. */}
        {/* The bottom padding reserves room for the mobile nav AND for the
            anchor ad bar, which is fixed and so cannot push anything itself.
            `--anchor-ad-h` is published by AnchorAdBar and is 0px whenever the
            bar is dismissed or has no ad — so no page loses a strip for a slot
            that is not there. */}
        {/* `mx-auto max-w-7xl` is what stops every card spanning the display.
            There was no width cap here at all, so on a 1920px screen the content
            region was 1568px (1920 − 288 of sidebar − 64 of padding) and all 79
            pages under this layout stretched to fill it — only four of them set
            a width of their own. `TutorShell` has capped at max-w-7xl all along;
            this shell was the odd one out.

            The cap goes on <main> itself rather than an inner wrapper because
            several components deliberately bleed past the page padding with
            negative margins (the sticky profile nav, the edge-to-edge filter
            strips, the chat window). On <main> they keep meeting exactly the
            edge they meet today; inside a wrapper they would hang 16px outside
            it.

            Nothing below ~1400px moves: at 1280px the region is already 928px,
            well under the cap, so the feed's right rail and every mobile and
            tablet layout are untouched. */}
        {/* Page gutter. `px-4` on a phone put a card's content 16px from the
            screen edge and its own padding immediately inside that — the
            crowding that reads as cheap. `--app-gap` is the same fluid step the
            cards space themselves by, so the gutter and the rhythm inside the
            page are one measurement rather than two guesses. */}
        {/* The bottom padding reserves the phone nav's REAL height.
          *
          * It was a flat 6rem, which is a guess that ignores the device safe
          * area and the primary tab that floats above the bar — so the last
          * thing on a page sat under the nav. The bar publishes what it
          * actually occupies as `--bottom-nav-h`; 6rem stays only as the value
          * used for the frame before its observer first runs. */}
        <main className="mx-auto w-full max-w-7xl py-(--app-pad) px-(--app-pad) sm:px-6 lg:px-8 pb-[calc(var(--bottom-nav-h,6rem)+1rem+var(--anchor-ad-h,0px))] md:pb-[calc(2rem+var(--anchor-ad-h,0px))] scroll-mt-[calc(4rem+env(safe-area-inset-top))]">
          <AppRefreshShell>{children}</AppRefreshShell>
        </main>
      </div>

      {/* App-style bottom nav (mobile only) */}
      <BottomTabBar features={features} hiddenPaths={hiddenPaths} tabs={nav.bottomTabs} />

      {/* Sticky anchor ad — one mount covers every route tree in the app. Sits
          UNDER the nav (z-30 vs z-40) and suppresses itself on incentivised
          pages; see anchor-ad-bar.tsx. */}
      <AnchorAdBar />

      {/* Lottery wins, leaderboard prizes, big achievements, payments — shown
          once as a popup the next time the user opens the app. */}
      <CelebrationHost />
      {/* Balances update after a claim/reward without a manual refresh. */}
      <BalanceSync />
      {/* Sends a new account's saved sign-up source once. */}
      <FirstTouchReport />
      {/* "App only" / "notifications on" tasks — opens only when a start is refused. */}
      <TaskRequirementsGate />
      {/* "Allow notifications" and "Install the app" — signed-in users only
          (a visitor on the landing page has nothing to be notified about),
          and asked again at the moment it matters: starting a task. */}
      <PushPermissionPrompt enabled={ui?.notificationPopup ?? true} />
      <PwaInstallPrompt
        enabled={ui?.pwaInstallPrompt ?? true}
        rewardPoints={installRewardPoints}
        installedPlatform={installedPlatform}
      />
      {/* Reports opening the INSTALLED app (once a day) for install tracking
          and the install reward — src/lib/pwa-install.ts. */}
      <PwaSeenBeacon />
      {/* Installed app: reopening after it was closed lands on Home, not on
          the page the OS restored. */}
      <PwaLaunchHome />

      {/* Device id + fingerprint for the multi-account rules; reports this
          device (IP, country, browser) once per session. */}
      <DeviceBeacon report />
    </div>
  );
}
