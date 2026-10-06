import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { INCENTIVISED_PREFIXES } from "@/lib/ad-placements";
import { AdNetworksView } from "@/components/admin/ads/ad-networks-view";

export const dynamic = "force-dynamic";

export default async function AdNetworksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "ads.manage");

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/admin/ads"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to ads
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">Ad networks</h1>
        <p className="text-sm text-slate-400">
          Turn networks on, enter your publisher ids (they go into ads.txt), and decide which
          networks may run on pages that pay users. Then create an HTML ad in the Ads Manager and
          pick the network.
        </p>
      </div>
      <AdNetworksView canManage={canManage} paidPrefixes={[...INCENTIVISED_PREFIXES]} />
    </div>
  );
}
