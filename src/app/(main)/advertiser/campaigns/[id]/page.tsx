import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { CampaignDetailView } from "@/components/user/advertiser/campaign-detail-view";

export default async function AdvertiserCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  // Same title + apply path as /advertiser — a locked user landing on a campaign
  // deep link used to get a different heading and no way to request access.
  if (!enabled.has("advertiser"))
    return <FeatureLock title="Create Ad" applyHref="/profile/become-creator" />;

  const { id } = await params;
  return <CampaignDetailView campaignId={id} />;
}
