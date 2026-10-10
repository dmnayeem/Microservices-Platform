import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MonetizationView } from "@/components/admin/monetization/monetization-view";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import { CreatorEarningsPanel } from "@/components/admin/monetization/creator-earnings-panel";

/**
 * Browse & Earn gets its own tab: it pays users, so it is not something to
 * find halfway down the ad-network plumbing. Same settings, same save.
 */
const TABS = [
  { id: "networks", label: "Revenue & networks" },
  { id: "browse-earn", label: "Browse & Earn" },
  // Users earning from likes / comments on their posts (lib/social-earning.ts).
  { id: "creators", label: "Creator earnings" },
];

export default async function MonetizationAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.view"))) redirect("/admin");

  const tab = pickTab(TABS, (await searchParams).tab);

  return (
    <div className="space-y-6">
      <AdminTabs tabs={TABS} active={tab} basePath="/admin/monetization" />
      {tab === "creators" ? (
        <CreatorEarningsPanel />
      ) : (
        <MonetizationView
          // Every section saves through the settings route, which needs
          // settings.edit — showing Save to an ad manager without it only
          // produced "Couldn't save".
          canManage={(await can(session.user.id, "ads.manage")) && (await can(session.user.id, "settings.edit"))}
          view={tab === "browse-earn" ? "browse-earn" : "main"}
        />
      )}
    </div>
  );
}
