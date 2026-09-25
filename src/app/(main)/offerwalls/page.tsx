import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OfferwallCatalogView } from "@/components/user/offerwalls/offerwall-catalog-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

// No `force-dynamic`: the body is a client component with no server data, and
// `auth()` already makes this page dynamic. Declaring it again bought nothing
// and opted the route out of every optimisation Next can apply.

export default async function OfferwallsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const gate = await getProfileGateState(session.user.id, "offerwalls");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="offerwalls" />;
  return <OfferwallCatalogView />;
}
