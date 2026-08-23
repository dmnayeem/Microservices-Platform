import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LocationsManagerView } from "@/components/admin/locations/locations-manager-view";

export default async function AdminLocationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "settings.edit");

  return <LocationsManagerView canEdit={canEdit} />;
}
