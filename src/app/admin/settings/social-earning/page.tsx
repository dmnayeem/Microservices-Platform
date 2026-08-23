import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { readSocialEarningAdminConfig } from "@/lib/social-earning-admin";
import { SocialEarningForm } from "@/components/admin/settings/social-earning-form";

export default async function SocialEarningSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // `can()`, not the synchronous `hasPermission(role, …)`: the API on the other
  // end of this form uses `can()`, which honours custom roles and per-user
  // grants. With the role-only check here, someone holding `settings.edit`
  // through a CustomRole was bounced off a page whose own API would have
  // accepted them.
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "settings.edit");

  // Shared with the API's GET so the two can't drift — this page used to build
  // the same shape by hand with its own fallbacks.
  const initial = await readSocialEarningAdminConfig();

  return <SocialEarningForm initial={initial} canEdit={canEdit} />;
}
