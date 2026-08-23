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
        <main className="py-6 px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8 scroll-mt-[calc(4rem+env(safe-area-inset-top))]">
          <AppRefreshShell>{children}</AppRefreshShell>
        </main>
      </div>

      {/* App-style bottom nav (mobile only) */}
      <BottomTabBar features={features} hiddenPaths={hiddenPaths} />
    </div>
  );
}
