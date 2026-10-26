import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { taskRunHref } from "@/lib/task-routes";
import { auth } from "@/lib/auth";
import { memberCanSeeTask } from "@/lib/task-privacy";

// Universal task dispatcher: any /tasks/<id> link (earn hub, search, old
// bookmarks) resolves the task's type and forwards to its correct run page.
export default async function TaskDispatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [task, session] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      select: { id: true, type: true, hidden: true, allowedUserIds: true, superAdminOnly: true },
    }),
    auth(),
  ]);
  // A hidden or private task must not even be confirmed to exist by a redirect.
  if (!task || task.hidden || !memberCanSeeTask(task, { id: session?.user?.id, role: session?.user?.role })) notFound();

  redirect(taskRunHref(task.type, task.id));
}
