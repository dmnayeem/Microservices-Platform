"use client";

import { useSidebarCollapsed } from "@/lib/stores/admin-ui-store";
import { cn } from "@/lib/utils";

interface AdminLayoutShellProps {
  header: React.ReactNode;
  children: React.ReactNode;
  /** Read from the cookie by the server layout so SSR and the first client
   *  render agree — see admin-ui-store.ts. */
  initialCollapsed: boolean;
}

/**
 * Client-side wrapper that adjusts main content padding based on sidebar collapse state.
 * Server-rendered AdminLayout passes header and children as slots.
 */
export function AdminLayoutShell({
  header,
  children,
  initialCollapsed,
}: AdminLayoutShellProps) {
  const collapsed = useSidebarCollapsed(initialCollapsed);

  return (
    <div
      className={cn(
        "transition-[padding] duration-200",
        collapsed ? "lg:pl-20" : "lg:pl-72"
      )}
    >
      {header}
      <main className="py-6 px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
