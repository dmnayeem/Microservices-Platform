"use client";

import { useRouter } from "next/navigation";
import { PullToRefresh } from "@/components/user/primitives/pull-to-refresh";
import { triggerAppRefresh } from "@/hooks/use-app-refresh";

/**
 * App-wide pull-to-refresh. Wraps the main content so *every* mobile page can be
 * pulled down to refresh (installed PWAs have no browser reload). On refresh it
 * (1) revalidates server components via `router.refresh()`, (2) fires the global
 * `app:refresh` signal so client surfaces re-pull their own data, and (3) lets a
 * pending service-worker update apply (the SW register listens for the signal).
 * The touch-only PullToRefresh no-ops on desktop.
 */
export function AppRefreshShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const onRefresh = async () => {
    router.refresh();
    triggerAppRefresh();
    // Keep the spinner visible briefly while client surfaces refetch.
    await new Promise((r) => setTimeout(r, 650));
  };

  return <PullToRefresh onRefresh={onRefresh}>{children}</PullToRefresh>;
}
