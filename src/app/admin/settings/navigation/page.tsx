import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import { normalizeQuickEarn } from "@/lib/feed-quick-earn";
import {
  NAV_KEYS,
  normalizeBottomTabs,
  normalizeHeader,
  normalizeSidebar,
} from "@/lib/nav-config";
import { QuickEarnEditor } from "@/components/admin/navigation/quick-earn-editor";
import { TabBarEditor } from "@/components/admin/navigation/tab-bar-editor";
import { HeaderEditor } from "@/components/admin/navigation/header-editor";
import { SidebarEditor } from "@/components/admin/navigation/sidebar-editor";

/**
 * Every navigation surface of the user app in one place: which pages they
 * link to, labels, icons and order. Each tab saves one key through
 * /api/admin/settings/navigation. Page visibility and feature gates still
 * decide, per user, which of these links are actually shown.
 */
const TABS = [
  { id: "quick-earn", label: "Quick Earn" },
  { id: "tab-bar", label: "Tab bar" },
  { id: "header", label: "Header" },
  { id: "sidebar", label: "Sidebar" },
  { id: "feed-rail", label: "Feed rail" },
];

export default async function NavigationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "settings.edit");
  const tab = pickTab(TABS, (await searchParams).tab);

  // Read straight from the table, not through getSetting's cache: the editor
  // must show what was just saved.
  const key =
    tab === "quick-earn"
      ? NAV_KEYS.quickEarn
      : tab === "tab-bar"
        ? NAV_KEYS.bottomTabs
        : tab === "header"
          ? NAV_KEYS.header
          : tab === "sidebar"
            ? NAV_KEYS.sidebar
            : null;
  const row = key
    ? await prisma.systemSetting.findUnique({ where: { key } }).catch(() => null)
    : null;
  const raw = row?.value ?? null;

  let body: React.ReactNode;
  if (tab === "quick-earn") {
    body = <QuickEarnEditor initial={normalizeQuickEarn(raw)} canEdit={canEdit} />;
  } else if (tab === "tab-bar") {
    body = <TabBarEditor initial={normalizeBottomTabs(raw)} canEdit={canEdit} />;
  } else if (tab === "header") {
    body = <HeaderEditor initial={normalizeHeader(raw)} canEdit={canEdit} />;
  } else if (tab === "sidebar") {
    body = <SidebarEditor initial={normalizeSidebar(raw)} canEdit={canEdit} />;
  } else {
    body = (
      <div className="max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-bold text-white">Feed right rail</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          The widgets beside the feed (balance, daily mission, Quick Earn, referral,
          top earners, custom promo cards…) — their order, which ones show, and your
          own custom widgets — are edited on the Feed settings page. The Quick Earn
          tiles inside that rail are edited on the Quick Earn tab here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/settings/feed?tab=widgets"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600"
          >
            Open feed widgets <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/settings/navigation"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            Quick Earn tiles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Navigation</h1>
        <p className="mt-1 text-sm text-slate-400">
          What the user app&apos;s menus link to — labels, icons and order. Changes
          apply to everyone within about a minute. Hidden pages and missing
          features still remove links per user.
        </p>
      </div>
      <AdminTabs tabs={TABS} active={tab} basePath="/admin/settings/navigation" />
      {body}
    </div>
  );
}
