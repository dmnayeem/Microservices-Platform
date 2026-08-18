import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TasksHubView } from "@/components/user/tasks/tasks-hub-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const gate = await getProfileGateState(session.user.id);
  if (gate.locked) {
    return <ProfileGate progress={gate.progress} surface="Tasks" />;
  }

  // The Rank/Leaderboard tabs need the viewer's level/xp; the stats row shows
  // the package label. Same user shape /earn uses.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      avatar: true,
      level: true,
      xp: true,
      pointsBalance: true,
      package: { select: { slug: true, name: true } },
    },
  });
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
    />
  );
}
