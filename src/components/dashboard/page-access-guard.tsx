"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Client-side route guard for super-admin page-visibility (feature #3). The nav
 * already hides disabled pages, but a user could still open a hidden URL
 * directly — this redirects them to /no-access. Mounted once in the (main)
 * layout with the server-resolved hidden path list.
 *
 * Note: this is a UX guard. Data access itself is enforced server-side in the
 * relevant APIs (tasks/features/etc.); this stops direct navigation to a page
 * an admin chose to hide.
 */
export function PageAccessGuard({ hiddenPaths }: { hiddenPaths: string[] }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || hiddenPaths.length === 0) return;
    const blocked = hiddenPaths.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (blocked) router.replace("/no-access");
  }, [pathname, hiddenPaths, router]);

  return null;
}
