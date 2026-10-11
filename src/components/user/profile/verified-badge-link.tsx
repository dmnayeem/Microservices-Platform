"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Makes the verified tick open the badge shop. A span, not an <a>: the tick
 * usually sits inside the author link of a card, and an anchor inside an
 * anchor is invalid HTML — so the click is handled here and stopped from
 * reaching the card's own link.
 */
export function VerifiedBadgeLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const go = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={label}
      className={className}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") go(e);
      }}
    >
      {children}
    </span>
  );
}
