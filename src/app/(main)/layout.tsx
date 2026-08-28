import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { BottomTabBar } from "@/components/dashboard/bottom-tab-bar";
import { AppRefreshShell } from "@/components/pwa/app-refresh-shell";
import { getEffectiveFeatures } from "@/lib/packages";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { PageAccessGuard } from "@/components/dashboard/page-access-guard";
import { AnchorAdBar } from "@/components/user/primitives/anchor-ad-bar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Server-side redirect if not authenticated
  // This prevents any flash - user never sees the page
  if (!session?.user) {
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
  const [{ enabled }, hiddenPaths, dbUser] = await Promise.all([
    getEffectiveFeatures(session.user.id),
    getHiddenPaths(session.user.id),
    prisma.user
      .findUnique({
        where: { id: session.user.id },
        select: { avatar: true },
        cacheStrategy: { ttl: 10, swr: 30 },
      })
      .catch(() => null),
  ]);
  const features = Array.from(enabled);
  const avatar = dbUser?.avatar ?? null;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Redirect away from pages an admin has hidden for this user. */}
      <PageAccessGuard hiddenPaths={hiddenPaths} />

      {/* Sidebar */}
      <Sidebar
        user={session.user}
        features={features}
        avatar={avatar}
        hiddenPaths={hiddenPaths}
      />

      {/* Main Content */}
      <div className="lg:pl-72">
        {/* Header */}
        <Header user={session.user} avatar={avatar} />

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
        <main className="mx-auto w-full max-w-7xl py-6 px-4 sm:px-6 lg:px-8 pb-[calc(6rem+var(--anchor-ad-h,0px))] lg:pb-[calc(2rem+var(--anchor-ad-h,0px))] scroll-mt-[calc(4rem+env(safe-area-inset-top))]">
          <AppRefreshShell>{children}</AppRefreshShell>
        </main>
      </div>

      {/* App-style bottom nav (mobile only) */}
      <BottomTabBar features={features} hiddenPaths={hiddenPaths} />

      {/* Sticky anchor ad — one mount covers every route tree in the app. Sits
          UNDER the nav (z-30 vs z-40) and suppresses itself on incentivised
          pages; see anchor-ad-bar.tsx. */}
      <AnchorAdBar />
    </div>
  );
}
