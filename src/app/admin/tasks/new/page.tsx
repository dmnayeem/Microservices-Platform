import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectivePermissions } from "@/lib/permissions";
import { TASK_TYPES, taskCreatePermFor } from "@/lib/rbac";
import { TaskForm } from "../_components/TaskForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function CreateTaskPage() {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/tasks"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Create New Task</h1>
          <p className="text-gray-400">Define a new earning task for users</p>
        </div>
      </div>

      {/* Form */}
      <TaskForm allowedTypes={allowedTypes as unknown as string[]} />
    </div>
  );
}
