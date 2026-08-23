import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FeedWidgetsForm } from "@/components/admin/settings/feed-widgets-form";
import { normalizeWidgetConfig } from "@/lib/feed-widgets";
import { normalizeQuickEarn } from "@/lib/feed-quick-earn";
import { normalizeCustomWidgets } from "@/lib/feed-custom-widgets";

export default async function FeedWidgetsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "settings.edit");

  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: ["feed.sidebar_widgets", "feed.quick_earn_tiles", "feed.custom_widgets"],
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
  };

  return <FeedWidgetsForm initial={initial} canEdit={canEdit} />;
}
