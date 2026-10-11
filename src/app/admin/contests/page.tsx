import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminContestsView } from "@/components/admin/contests/admin-contests-view";

export default async function AdminContestsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "community.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "community.manage");
  return <AdminContestsView canManage={canManage} />;
}
