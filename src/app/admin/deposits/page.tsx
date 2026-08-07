import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { AdminDepositsView } from "@/components/admin/deposits/admin-deposits-view";

export default async function AdminDepositsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "withdrawals.view")) redirect("/admin");

  return <AdminDepositsView canProcess={hasPermission(role, "withdrawals.process")} />;
}
