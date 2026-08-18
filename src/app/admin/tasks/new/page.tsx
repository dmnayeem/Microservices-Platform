import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import { TASK_TYPES, taskCreatePermFor } from "@/lib/rbac";
import { TaskForm } from "../_components/TaskForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function CreateTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ boardId?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Effective per-type create permissions (config + per-user override aware).
  const perms = await getEffectivePermissions(session.user.id);
  const allowedTypes = TASK_TYPES.filter(
    (t) => perms.has("tasks.create") || perms.has(taskCreatePermFor(t))
  );
  if (allowedTypes.length === 0) {
    redirect("/admin/tasks");
  }

  // Optionally pre-attach the new task to a board (from /admin/boards/[id]).
  const { boardId } = await searchParams;
  const board = boardId
    ? await prisma.taskBoard.findUnique({
        where: { id: boardId },
        select: { id: true, title: true },
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={board ? `/admin/boards/${board.id}` : "/admin/tasks"}
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {board ? `New Task for “${board.title}”` : "Create New Task"}
          </h1>
          <p className="text-gray-400">
            {board
              ? "This task will be added to the board. Set its audience targeting below."
              : "Define a new earning task for users"}
          </p>
        </div>
      </div>

      {/* Form */}
      <TaskForm
        allowedTypes={allowedTypes as unknown as string[]}
        defaultBoardId={board?.id}
      />
    </div>
  );
}
