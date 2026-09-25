import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Megaphone } from "lucide-react";
import { promotableItems } from "@/lib/house-promos";
import { AD_PLACEMENTS } from "@/lib/ad-placements";
import { PromoClient } from "./_components/PromoClient";

export const dynamic = "force-dynamic";

export default async function PromotePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "ads.manage");
  const items = await promotableItems();

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
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-indigo-400" />
          Promote your own products
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Put a marketplace listing or a course into the ad slots that already run
          across the app. Each promo becomes a house ad — it uses the item&apos;s own
          picture, title and price, it is never billed, and it loses any slot an
          advertiser has paid for.
        </p>
      </div>

      <PromoClient
        items={items}
        placements={AD_PLACEMENTS.map((p) => ({
          name: p.name,
          label: p.label,
          where: p.where,
        }))}
        canManage={canManage}
      />
    </div>
  );
}
