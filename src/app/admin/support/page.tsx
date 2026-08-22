import { requirePermission } from "@/lib/permissions";
import { SupportInboxView } from "@/components/admin/support/support-inbox-view";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  // `requirePermission` resolves EFFECTIVE permissions (role config + custom
  // roles + per-user overrides), unlike the older `hasPermission(role, …)`
  // pattern which only reads the role defaults and so disagrees with the
  // layout's own guard.
  await requirePermission("support.view");
  return <SupportInboxView />;
}
