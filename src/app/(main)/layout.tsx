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

  // Effective feature set (package + per-user overrides) → hide disabled nav.
  const { enabled } = await getEffectiveFeatures(session.user.id);
  const features = Array.from(enabled);

  // Super-admin page-visibility (feature #3): paths hidden for this user's
  // package / role / per-user override. Drives both nav hiding + a route guard.
  const hiddenPaths = await getHiddenPaths(session.user.id);

  // The session doesn't carry the avatar, so fetch it here (cheap indexed read)
  // and pass it to the shells so the header/sidebar show the real picture. Kept
  // fresh (short cache) so a new upload appears after PhotoModal's router.refresh.
  const dbUser = await prisma.user
    .findUnique({
      where: { id: session.user.id },
      select: { avatar: true },
      cacheStrategy: { ttl: 10, swr: 30 },
    })
    .catch(() => null);
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
        <main className="py-6 px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8">
          <AppRefreshShell>{children}</AppRefreshShell>
        </main>
      </div>

      {/* App-style bottom nav (mobile only) */}
      <BottomTabBar features={features} hiddenPaths={hiddenPaths} />
    </div>
  );
}
