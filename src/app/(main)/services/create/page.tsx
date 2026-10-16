import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateListingView } from "@/components/user/marketplace/create-listing-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function CreateServicePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "selling");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="offering services" />;

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("sellServices"))
    return <FeatureLock title="Offer Services" applyHref="/apply?type=SERVICE_PROVIDER" />;

  return <CreateListingView mode="services" />;
}
