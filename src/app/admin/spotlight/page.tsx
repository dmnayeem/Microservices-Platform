import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminSpotlightView } from "@/components/admin/spotlight/admin-spotlight-view";

export default async function AdminSpotlightPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "events.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "events.manage");
  return <AdminSpotlightView canManage={canManage} />;
}
