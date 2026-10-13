import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/system-settings";
import { TaskCategoriesForm } from "@/components/admin/tasks/task-categories-form";
import { DEFAULT_TASK_INSTRUCTIONS_COLOR, TASK_INSTRUCTIONS_COLOR_KEY } from "@/lib/task-instructions-color";

export default async function TaskCategoriesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "tasks.view"))) redirect("/admin");

  const [initial, initialColor] = await Promise.all([
    getSetting<Record<string, boolean>>("tasks.category_visibility", {}),
    getSetting<string>(TASK_INSTRUCTIONS_COLOR_KEY, DEFAULT_TASK_INSTRUCTIONS_COLOR),
  ]);

  return (
    <TaskCategoriesForm
      initial={initial}
      initialColor={initialColor}
      canManage={await can(session.user.id, "tasks.edit")}
    />
  );
}
