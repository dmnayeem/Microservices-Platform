import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateListingView } from "@/components/user/marketplace/create-listing-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { getLicenseTiersEnabled, SUGGESTED_TIERS } from "@/lib/marketplace-selling";

export default async function CreateListingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("sellMarketplace"))
    return <FeatureLock title="Sell on Marketplace" applyHref="/profile/become-creator" />;

  return (
    <CreateListingView
      licenseTiersEnabled={await getLicenseTiersEnabled()}
      suggestedTiers={SUGGESTED_TIERS}
    />
  );
}
