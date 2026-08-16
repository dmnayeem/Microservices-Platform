import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { MonetizationView } from "@/components/admin/monetization/monetization-view";

export default async function MonetizationAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "ads.view")) redirect("/admin");

  return <MonetizationView canManage={hasPermission(adminRole, "ads.manage")} />;
}
