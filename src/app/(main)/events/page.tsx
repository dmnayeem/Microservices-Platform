import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EventsView } from "@/components/user/events/events-view";

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <EventsView />;
}
