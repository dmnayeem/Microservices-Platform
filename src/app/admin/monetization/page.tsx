import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MonetizationView } from "@/components/admin/monetization/monetization-view";

export default async function MonetizationAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.view"))) redirect("/admin");

  return <MonetizationView canManage={await can(session.user.id, "ads.manage")} />;
}
