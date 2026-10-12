import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { PlatformIncomeView } from "@/components/admin/finance/platform-income-view";

export const dynamic = "force-dynamic";

/**
 * Finance → Platform income: what outside companies (Google AdSense, Adsterra,
 * Monetag, Amazon…) paid, typed in daily, with the month-end actual payout and
 * a report of the platform's own income beside it.
 */
export default async function PlatformIncomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const perms = await getEffectivePermissions(session.user.id);
  if (!perms.has("finance.view")) redirect("/admin");

  return (
    <div className="space-y-5 max-w-6xl">
      <Link href="/admin/finance" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ChevronLeft className="w-4 h-4" />
        Finance hub
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">Platform income</h1>
        <p className="text-sm text-slate-400">
          Income from outside companies — Google AdSense, Adsterra, Monetag, Amazon Affiliates — that only
          their own dashboards know. Enter it day by day in US dollars; it is added to every finance report.
          The platform&apos;s own income (ads, marketplace, courses, subscriptions, badges, boosts…) is counted
          automatically and is never entered here.
        </p>
      </div>
      <PlatformIncomeView />
    </div>
  );
}
