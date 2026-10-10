import type { BannerLocation } from "@/generated/prisma/client";
import { bannersFor } from "@/lib/banners-server";
import { BannerSlider, type BannerSlide } from "@/components/user/primitives/banner-slider";

/**
 * The banner slider for one place (Admin → Banners → Location). Renders
 * nothing when no banner matches this person.
 */
export async function LocationBanners({
  userId,
  location,
  className,
}: {
  userId: string;
  location: BannerLocation;
  className?: string;
}) {
  const rows = await bannersFor(userId, location).catch(() => []);
  if (rows.length === 0) return null;
  const slides: BannerSlide[] = rows.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle ?? undefined,
    imageUrl: b.imageUrl ?? undefined,
    videoUrl: b.videoUrl ?? undefined,
    ctaLabel: b.linkUrl ? "Open" : undefined,
    ctaHref: b.linkUrl ?? undefined,
    bgGradient: b.bgGradient ?? undefined,
  }));
  return <BannerSlider slides={slides} className={className ?? "mb-4"} />;
}
