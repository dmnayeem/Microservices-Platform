import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminTabs, pickTab, type AdminTab } from "@/components/admin/ui/admin-tabs";
import { CpaOffersTab } from "@/components/admin/cpa/cpa-offers-tab";
import { CpaReviewTab } from "@/components/admin/cpa/cpa-review-tab";
import { CpaReportsTab } from "@/components/admin/cpa/cpa-reports-tab";
import { CpaPostbackTab } from "@/components/admin/cpa/cpa-postback-tab";

// CPA offers — a module of its own (not Offerwall). Reuses the Offerwall
// permissions: offerwalls.view to read, offerwalls.manage to change.
export default async function CpaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; offerId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "offerwalls.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "offerwalls.manage");

  const tabs: AdminTab[] = [
    { id: "offers", label: "Offers" },
    { id: "review", label: "Review" },
    { id: "reports", label: "Reports" },
    // The postback secret is shown only to managers (the API requires manage).
    ...(canManage ? [{ id: "postback", label: "Postback & rules" }] : []),
  ];
  const sp = await searchParams;
  const tab = pickTab(tabs, sp.tab);
  const offerId = sp.offerId || undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Target className="w-6 h-6 text-emerald-400" />
          CPA Offers
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Network offers (CPAGrip, OGAds, CPALead…) users complete for points — tracked by click, confirmed by proof or postback.
        </p>
      </div>

      <AdminTabs tabs={tabs} active={tab} basePath="/admin/cpa" />

      {tab === "offers" && <CpaOffersTab canManage={canManage} />}
      {tab === "review" && <CpaReviewTab key={offerId ?? ""} canManage={canManage} initialOfferId={offerId} />}
      {tab === "reports" && <CpaReportsTab key={offerId ?? ""} initialOfferId={offerId} />}
      {tab === "postback" && <CpaPostbackTab />}
    </div>
  );
}
