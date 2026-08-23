import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Trophy, Settings as SettingsIcon, BarChart3 } from "lucide-react";
import { LeaderboardSettingsForm } from "@/components/admin/leaderboard/leaderboard-settings-form";
import { LeaderboardStandings } from "@/components/admin/leaderboard/leaderboard-standings";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function LeaderboardManagementPage({
  searchParams,
}: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "leaderboards.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "leaderboards.manage");
  const { tab = "standings" } = await searchParams;

  const [rows, packages] = await Promise.all([
    prisma.systemSetting.findMany({ where: { category: "leaderboard" } }),
    // Show every package (including inactive ones) so admin can configure
    // eligibility regardless of current isActive state.
    prisma.package.findMany({
      orderBy: [{ order: "asc" }, { accessLevel: "asc" }],
      select: { id: true, slug: true, name: true },
    }),
  ]);
  const initial: Record<string, unknown> = {};
  for (const r of rows) initial[r.key.replace("lb_", "")] = r.value;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-400" />
            Leaderboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Live rankings, prize distribution and previous winners — plus
            controls for the prize pool and reset cadence.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-slate-800">
        <TabLink
          href="?tab=standings"
          active={tab !== "settings"}
          icon={<BarChart3 className="w-4 h-4" />}
          label="Standings"
        />
        <TabLink
          href="?tab=settings"
          active={tab === "settings"}
          icon={<SettingsIcon className="w-4 h-4" />}
          label="Settings"
        />
      </nav>

      {tab === "settings" ? (
        <div className="max-w-4xl">
          <LeaderboardSettingsForm
            initial={initial}
            canEdit={canManage}
            packages={packages}
          />
        </div>
      ) : (
        <LeaderboardStandings settings={initial} />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
        active
          ? "border-amber-500 text-white"
          : "border-transparent text-slate-400 hover:text-white"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
