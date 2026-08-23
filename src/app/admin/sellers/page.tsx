import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AdminSellersView } from "@/components/admin/sellers/admin-sellers-view";

export default async function AdminSellersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "users.edit"))) redirect("/admin");

  return <AdminSellersView canManage={await can(session.user.id, "users.edit")} />;
}
