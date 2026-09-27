"use client";

import { createContext, useContext } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The logo uploaded at /admin/seo, for every place the brand shows — navbar,
 * footer, sidebar, header, sign-in pages, splash. Those were a hard-coded
 * icon, so an uploaded logo showed up nowhere on the site. Provided once by
 * the root layout, which already reads the SEO settings.
 *
 * `wide` = the upload is a wordmark (much wider than tall). A wordmark cannot
 * sit in the small square mark — it was cropped to "RevT" — so it replaces the
 * whole square-plus-name lockup instead (BrandLockup).
 */
const BrandContext = createContext<{ logoUrl: string | null; wide: boolean; name: string }>({
  logoUrl: null,
  wide: false,
  name: "RevType",
});

export function BrandProvider({
  logoUrl,
  wide,
  name,
  children,
}: {
  logoUrl: string | null;
  wide: boolean;
  name: string;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={{ logoUrl, wide, name }}>{children}</BrandContext.Provider>;
}

/** Inside the square mark: a square uploaded logo, else the stock sparkle. */
export function BrandMark({ iconClassName }: { iconClassName?: string }) {
  const { logoUrl, wide } = useContext(BrandContext);
  if (logoUrl && !wide) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className="h-full w-full rounded-[inherit] object-contain" />;
  }
  return <Sparkles className={iconClassName} />;
}

/**
 * The whole brand lockup. With a wordmark uploaded, the wordmark itself (at
 * the given height); otherwise `children` — the square mark and the name.
 */
export function BrandLockup({ children, className }: { children: React.ReactNode; className?: string }) {
  const { logoUrl, wide, name } = useContext(BrandContext);
  if (logoUrl && wide) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={cn("w-auto max-w-[200px] object-contain", className)} />;
  }
  return <>{children}</>;
}
