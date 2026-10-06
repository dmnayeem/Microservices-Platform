import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { EventsAdminView } from "@/components/admin/events/events-admin-view";
import { EventProofsReview } from "@/components/admin/events/event-proofs-review";

export default async function EventsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "events.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "events.manage");
  return (
    <div className="space-y-5">
      <EventsAdminView canManage={canManage} />
      <EventProofsReview canManage={canManage} />
    </div>
  );
}
