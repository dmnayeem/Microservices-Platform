import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { AdminSellersView } from "@/components/admin/sellers/admin-sellers-view";

export default async function AdminSellersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "users.edit")) redirect("/admin");

  return <AdminSellersView canManage={hasPermission(role, "users.edit")} />;
}
