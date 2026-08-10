"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Nav/footer link that resolves homepage-section anchors correctly from any page.
 *
 * A bare `#features` only targets the current document, so on a subpage
 * (e.g. /features/marketplace) it does nothing. This points such anchors at the
 * homepage (`/#features`) when the visitor isn't already on `/`, and keeps a
 * native `<a>` on the homepage for smooth same-page scrolling. Route links
 * (`/features/*`, `/about`, external URLs) render as a normal client-nav Link.
 */
export function MarketingNavLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (href.startsWith("#")) {
    if (pathname === "/") {
      return (
        <a href={href} className={className} onClick={onClick}>
          {children}
        </a>
      );
    }
    return (
      <Link href={`/${href}`} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
