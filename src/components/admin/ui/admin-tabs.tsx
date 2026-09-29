import Link from "next/link";
import { cn } from "@/lib/utils";

export interface AdminTab {
  id: string;
  label: string;
}

/**
 * Server-rendered tab strip driven by `?tab=`. Links, not client state, so a
 * tab can be bookmarked and an old URL (e.g. /admin/referrals/settings) can
 * redirect straight to the right one.
 */
export function AdminTabs({
  tabs,
  active,
  basePath,
}: {
  tabs: AdminTab[];
  active: string;
  basePath: string;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-800">
      {tabs.map((t, i) => (
        <Link
          key={t.id}
          href={i === 0 ? basePath : `${basePath}?tab=${t.id}`}
          className={cn(
            "whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
            active === t.id
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** The requested tab if it is one of `tabs`, else the first. */
export function pickTab(tabs: AdminTab[], requested: string | undefined): string {
  return tabs.some((t) => t.id === requested) ? (requested as string) : tabs[0].id;
}
