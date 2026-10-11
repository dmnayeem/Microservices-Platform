import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminFeedbackView } from "@/components/admin/feedback/admin-feedback-view";

export default async function AdminFeedbackPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "community.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "community.manage");
  return <AdminFeedbackView canManage={canManage} />;
}
