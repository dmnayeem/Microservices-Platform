import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/system-settings";
import { TaskCategoriesForm } from "@/components/admin/tasks/task-categories-form";

export default async function TaskCategoriesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "tasks.view"))) redirect("/admin");

  const initial = await getSetting<Record<string, boolean>>(
    "tasks.category_visibility",
    {}
  );

  return (
    <TaskCategoriesForm
      initial={initial}
      canManage={await can(session.user.id, "tasks.edit")}
    />
  );
}
