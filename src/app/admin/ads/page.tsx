import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AdManagerView } from "@/components/admin/ads/ad-manager-view";

export default async function AdsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.view"))) redirect("/admin");

  return <AdManagerView canManage={await can(session.user.id, "ads.manage")} />;
}
