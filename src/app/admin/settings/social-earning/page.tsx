import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { readSocialEarningAdminConfig } from "@/lib/social-earning-admin";
import { SocialEarningForm } from "@/components/admin/settings/social-earning-form";

export default async function SocialEarningSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "settings.view")) redirect("/admin");

  const canEdit = hasPermission(adminRole, "settings.edit");

  // Shared with the API's GET so the two can't drift — this page used to build
  // the same shape by hand with its own fallbacks.
  const initial = await readSocialEarningAdminConfig();

  return <SocialEarningForm initial={initial} canEdit={canEdit} />;
}
