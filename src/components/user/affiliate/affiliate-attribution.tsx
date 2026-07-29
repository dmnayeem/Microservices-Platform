"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * When a product/course page is opened via an affiliate link (`?aff=<code>`),
 * this fires once to record the click and drop the attribution cookie
 * (server-side, httpOnly). Renders nothing. Safe to mount on every detail page.
 */
export function AffiliateAttribution({
  targetType,
  targetId,
}: {
  targetType: "MARKETPLACE" | "COURSE";
  targetId: string;
}) {
  const params = useSearchParams();
  const firedRef = useRef(false);

  useEffect(() => {
    const code = params.get("aff");
    if (!code || firedRef.current) return;
    firedRef.current = true;
    void fetch("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, targetType, targetId }),
    }).catch(() => {});
  }, [params, targetType, targetId]);

  return null;
}
