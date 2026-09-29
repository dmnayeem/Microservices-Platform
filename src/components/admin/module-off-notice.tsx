"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";

/**
 * The admin layout sends an admin who opens a page the super admin switched
 * off to `/admin?notice=page-off`. This says why, once, then drops the query
 * so a reload does not repeat it.
 */
export function ModuleOffNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const notice = params.get("notice");

  useEffect(() => {
    if (notice !== "page-off") return;
    toast.warning("That admin page is switched off for your account", {
      description: "Ask a super admin if you need it.",
    });
    const next = new URLSearchParams(params.toString());
    next.delete("notice");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [notice, params, pathname, router]);

  return null;
}
