"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPathHidden } from "@/lib/page-visibility";

/**
 * Client-side route guard for super-admin page-visibility (feature #3). The nav
 * already hides disabled pages, but a user could still open a hidden URL
 * directly — this redirects them to /no-access. Mounted once in the (main)
 * layout with the server-resolved hidden path list.
 *
 * The (main) layout also redirects on a hard load (when middleware supplied
 * `x-pathname`), and the feature APIs refuse via `assertPageVisible`. This
 * guard covers client-side navigation, which does not re-run the layout.
 */
export function PageAccessGuard({
  hiddenPaths,
  vpnLockedPaths = [],
}: {
  hiddenPaths: string[];
  /** Pages the admin locked against VPNs (Fraud Control → VPN). */
  vpnLockedPaths?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || hiddenPaths.length === 0) return;
    // Same segment-prefix rule (and always-visible safe list) as the server
    // redirect in the (main) layout and the API guard.
    if (isPathHidden(pathname, hiddenPaths)) router.replace("/no-access");
  }, [pathname, hiddenPaths, router]);

  // A VPN-locked page: the server decides (it sees the real IP). Soft
  // navigation doesn't re-run the layout's check, so this asks.
  useEffect(() => {
    if (!pathname || pathname === "/vpn-blocked" || vpnLockedPaths.length === 0) return;
    const locked = vpnLockedPaths.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
    if (!locked) return;
    let live = true;
    fetch("/api/vpn/check", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d?.vpn) router.replace(`/vpn-blocked?from=${encodeURIComponent(pathname)}`);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname, vpnLockedPaths, router]);

  return null;
}
