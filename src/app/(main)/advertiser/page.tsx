import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdvertiserDashboard } from "@/components/user/advertiser/advertiser-dashboard";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";

export const metadata = { title: "Create Ad" };

export default async function AdvertiserPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("advertiser"))
    return <FeatureLock title="Create Ad" applyHref="/profile/become-creator" />;

  return <AdvertiserDashboard />;
}
