import { auth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { TASK_CREATE_PERMISSIONS } from "@/lib/rbac";
import { InstructionTemplatesManager } from "@/components/admin/tasks/instruction-templates-manager";

export const metadata = { title: "Instruction Templates" };

/**
 * /admin/tasks/templates — reusable task instructions, by category.
 * No DB read here: the client loads the list (one request, two queries), so a
 * missing table (migration not applied) shows a notice instead of a 500.
 */
export default async function InstructionTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const perms = await getEffectivePermissions(session.user.id);
  if (!perms.has("tasks.view")) redirect("/admin");

  const canManage = perms.has("tasks.create") || perms.has("tasks.edit");
  const canCreate = canManage || TASK_CREATE_PERMISSIONS.some((p) => perms.has(p));

  return <InstructionTemplatesManager canCreate={canCreate} canManage={canManage} />;
}
