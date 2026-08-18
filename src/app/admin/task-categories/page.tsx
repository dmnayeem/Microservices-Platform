import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { getSetting } from "@/lib/system-settings";
import { TaskCategoriesForm } from "@/components/admin/tasks/task-categories-form";

export default async function TaskCategoriesAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "tasks.view")) redirect("/admin");

  const initial = await getSetting<Record<string, boolean>>(
    "tasks.category_visibility",
    {}
  );

  return (
    <TaskCategoriesForm
      initial={initial}
      canManage={hasPermission(role, "tasks.edit")}
    />
  );
}
