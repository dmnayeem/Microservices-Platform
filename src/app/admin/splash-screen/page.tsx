import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SplashAdminView } from "@/components/admin/splash/splash-admin-view";

export default async function SplashAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "banners.view"))) redirect("/admin");
  return <SplashAdminView />;
}
