import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { EventsAdminView } from "@/components/admin/events/events-admin-view";

export default async function EventsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "events.view")) redirect("/admin");

  return <EventsAdminView canManage={hasPermission(role, "events.manage")} />;
}
