import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EarningHub } from "@/components/user/earn/earning-hub";
import { listTasksForUser } from "@/lib/task-list";
import { getHiddenPaths } from "@/lib/page-visibility-server";

export default async function EarnPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // The default Tasks tab's first page (same code as GET /api/tasks), started
  // now and NOT awaited: it streams to the client, so the shell is not held
  // for it and the tab no longer opens its own fetch after hydration. Null on
  // failure — the tab then fetches the route as before.
  const initialTasks = listTasksForUser(userId)
    .then((r) => r?.tasks ?? null)
    .catch((error) => {
      console.error("earn: initial tasks failed:", error);
      return null;
    });

  // getHiddenPaths is request-cached: the (main) layout already resolved it.
  const [user, hiddenPaths] = await Promise.all([
    prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      avatar: true,
      level: true,
      xp: true,
      pointsBalance: true,
      package: { select: { slug: true, name: true } },
    },
    }),
    getHiddenPaths(userId),
  ]);

  if (!user) redirect("/login");

  return (
    <EarningHub
      user={{
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        level: user.level,
        xp: user.xp,
        pointsBalance: user.pointsBalance,
        packageTier: user.package?.slug ?? "default",
      }}
      initialTasks={initialTasks}
      hiddenPaths={hiddenPaths}
    />
  );
}
