import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminAmbassadorsView } from "@/components/admin/ambassadors/admin-ambassadors-view";

export default async function AdminAmbassadorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "community.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "community.manage");
  return <AdminAmbassadorsView canManage={canManage} />;
}
