import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { EventsAdminView } from "@/components/admin/events/events-admin-view";

export default async function EventsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "events.view"))) redirect("/admin");

  return <EventsAdminView canManage={await can(session.user.id, "events.manage")} />;
}
