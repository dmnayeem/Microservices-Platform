import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AgencyConsoleView } from "@/components/user/agency/agency-console-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";

export default async function AgencyPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("agencyMode"))
    return <FeatureLock title="Agency Console" applyHref="/profile/become-creator" />;

  return <AgencyConsoleView />;
}
