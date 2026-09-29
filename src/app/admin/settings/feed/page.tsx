import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import { SocialEarningForm } from "@/components/admin/settings/social-earning-form";
import { FeedWidgetsForm } from "@/components/admin/settings/feed-widgets-form";
import { FeedGeneralPanel } from "@/components/admin/settings/feed-general-panel";
import { readSocialEarningAdminConfig } from "@/lib/social-earning-admin";
import { normalizeWidgetConfig } from "@/lib/feed-widgets";
import { normalizeQuickEarn } from "@/lib/feed-quick-earn";
import { normalizeCustomWidgets } from "@/lib/feed-custom-widgets";
import { loadSettingValues } from "@/lib/admin-setting-values";
import { FEED_HOME, keysHomedAt } from "@/lib/admin-settings-catalog";

/**
 * Every feed setting in one place. Social earning and the sidebar widgets used
 * to be two separate pages (/admin/settings/social-earning and
 * /admin/settings/feed-widgets — both now redirect here), and the General
 * switches were scattered over System Settings and the Ad Manager. Each tab
 * saves through the route it always used; no key changed.
 */
const TABS = [
  { id: "social-earning", label: "Social earning" },
  { id: "widgets", label: "Widgets" },
  { id: "general", label: "General" },
];

export default async function FeedSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // `can()`, not the synchronous role check: the APIs behind these forms use
  // `can()`, which honours custom roles and per-user grants. Same gate both
  // old pages used.
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "settings.edit");
  const tab = pickTab(TABS, (await searchParams).tab);

  let body: React.ReactNode;
  if (tab === "widgets") {
    const rows = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            "feed.sidebar_widgets",
            "feed.quick_earn_tiles",
            "feed.custom_widgets",
            "feed.public_post_sharing",
          ],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const customWidgets = normalizeCustomWidgets(map.get("feed.custom_widgets"));
    const initial = {
      // Reconcile with the catalog + custom ids so everything appears.
      widgets: normalizeWidgetConfig(
        map.get("feed.sidebar_widgets"),
        customWidgets.map((c) => c.id)
      ),
      quickEarn: normalizeQuickEarn(map.get("feed.quick_earn_tiles")),
      customWidgets,
      publicSharing: map.get("feed.public_post_sharing") === true,
    };
    body = <FeedWidgetsForm initial={initial} canEdit={canEdit} />;
  } else if (tab === "general") {
    const initial = await loadSettingValues([
      ...keysHomedAt(FEED_HOME.href),
      "feed.boost_max_per_user",
    ]);
    body = <FeedGeneralPanel initial={initial} canEdit={canEdit} />;
  } else {
    // Shared with the API's GET so the two can't drift.
    const initial = await readSocialEarningAdminConfig();
    body = <SocialEarningForm initial={initial} canEdit={canEdit} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Feed settings
        </h1>
      </div>
      <AdminTabs tabs={TABS} active={tab} basePath="/admin/settings/feed" />
      {body}
    </div>
  );
}
