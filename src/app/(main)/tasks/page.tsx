import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TasksHubView } from "@/components/user/tasks/tasks-hub-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import {
  GATE_USER_SELECT,
  getGateConfig,
  resolveProfileGate,
} from "@/lib/profile-gate-server";
import { computeTaskSummary } from "@/lib/tasks-summary";
import { getHiddenPaths } from "@/lib/page-visibility-server";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // ONE parallel round after auth. This used to be four in series (gate
  // config → gate user read → page user read → the client's summary fetch
  // after hydration), each an Accelerate round trip. The two user reads are
  // one select now, and the category-grid summary is computed here with the
  // same function /api/tasks/summary uses, so the client does not fetch it on
  // mount (it still refreshes through the route). Display only — the start and
  // submit routes keep their own uncached checks.
  const [cfg, user, summary, hiddenPaths] = await Promise.all([
    getGateConfig(),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...GATE_USER_SELECT,
        id: true,
        name: true,
        // The Rank/Leaderboard tabs need the viewer's level/xp; the stats row
        // shows the package label. Same user shape /earn uses.
        level: true,
        xp: true,
        pointsBalance: true,
        package: { select: { slug: true, name: true } },
      },
    }),
    // A failure here only costs the first paint its numbers: the client
    // falls back to fetching the route.
    computeTaskSummary(userId).catch((error) => {
      console.error("tasks summary (page) failed:", error);
      return null;
    }),
    // Request-cached: the (main) layout already resolved it.
    getHiddenPaths(userId),
  ]);

  const gate = resolveProfileGate(cfg, user, "tasks");
  if (gate.locked) {
    return <ProfileGate progress={gate.progress} surface="Tasks" />;
  }
  if (!user) redirect("/login");

  return (
    <TasksHubView
      user={{
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        level: user.level,
        xp: user.xp,
        pointsBalance: user.pointsBalance,
        packageTier: user.package?.slug ?? "default",
      }}
      packageName={user.package?.name ?? "Free"}
      initialSummary={summary}
      hiddenPaths={hiddenPaths}
    />
  );
}
