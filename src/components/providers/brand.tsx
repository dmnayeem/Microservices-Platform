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
type Heights = { site: number; app: number };
const BrandContext = createContext<{ logoUrl: string | null; wide: boolean; name: string; heights: Heights }>({
  logoUrl: null,
  wide: false,
  name: "RevType",
  heights: { site: 44, app: 40 },
});

export function BrandProvider({
  logoUrl,
  wide,
  name,
  heights,
  children,
}: {
  logoUrl: string | null;
  wide: boolean;
  name: string;
  /** Logo height in px, set at /admin/seo. */
  heights: Heights;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={{ logoUrl, wide, name, heights }}>{children}</BrandContext.Provider>;
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
 * The whole brand lockup. With a wordmark uploaded, the wordmark itself at
 * the height set at /admin/seo for this `area` (the marketing site or the
 * app); otherwise `children` — the square mark and the name. `className`
 * sets a fixed height instead (the splash screen).
 */
export function BrandLockup({
  children,
  area = "site",
  className,
}: {
  children: React.ReactNode;
  area?: "site" | "app";
  className?: string;
}) {
  const { logoUrl, wide, name, heights } = useContext(BrandContext);
  if (logoUrl && wide) {
    const h = heights[area];
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={cn("w-auto object-contain", className)}
        style={className ? undefined : { height: h, maxWidth: h * 6 }}
      />
    );
  }
  return <>{children}</>;
}
