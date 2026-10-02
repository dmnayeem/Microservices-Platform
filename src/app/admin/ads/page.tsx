import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { AdManagerView } from "@/components/admin/ads/ad-manager-view";

export default async function AdsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.view"))) redirect("/admin");

  return (
    <div className="space-y-4">
      {/* Advertising our OWN stock lives here too — it is the same Ad table and
          the same slots, so hiding it on a separate menu item nobody clicks was
          how it stayed unused. */}
      <Link
        href="/admin/ads/promote"
        className="flex items-center gap-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 hover:border-indigo-400"
      >
        <Megaphone className="h-5 w-5 shrink-0 text-indigo-300" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            Promote your own products
          </span>
          <span className="block text-xs text-slate-400">
            Put a marketplace listing or a course into these ad slots. Never billed.
          </span>
        </span>
      </Link>

      <AdManagerView
        canManage={await can(session.user.id, "ads.manage")}
        seesMoney={await can(session.user.id, "finance.view")}
      />
    </div>
  );
}
