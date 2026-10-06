import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { serveAd } from "@/lib/ad-serve";
import { resolveAdSize } from "@/lib/ad-sizes";
import { placementSizeKey, placementSpec } from "@/lib/ad-placements";
import { cn } from "@/lib/utils";
import {
  AdRenderer,
  type AdPlacement,
  type AdResponse,
} from "@/components/user/primitives/ad-renderer";

/**
 * An above-the-fold ad slot whose FIRST ad is decided on the server.
 *
 * A client `<AdRenderer>` paints a skeleton, hydrates, fetches, and only then
 * shows an ad — on a slow phone that is seconds of an empty box at the top of
 * the page, and the ad lands after the user has started scrolling. Here the
 * serve runs during the server render, inside its OWN Suspense boundary, so
 * the rest of the page streams immediately and the ad arrives in the same
 * response a moment later. The markup is in the document, which an ad blocker
 * cannot hide by cancelling a request.
 *
 * The impression is counted server-side by `serveAd`, exactly as the client
 * path counts it, and `AdRenderer` skips its own first fetch when it is given
 * `initialAd` — so there is no double count. Rotation then continues
 * client-side as normal.
 *
 * Nothing eligible (or an ad-free viewer) → renders nothing; the client would
 * only have asked the same question again.
 */
export function ServerAdSlot({
  placement,
  className,
  dismissible,
}: {
  placement: AdPlacement;
  className?: string;
  dismissible?: boolean;
}) {
  return (
    <Suspense fallback={<AdSlotSkeleton placement={placement} className={className} />}>
      <ServerAdSlotInner placement={placement} className={className} dismissible={dismissible} />
    </Suspense>
  );
}

async function ServerAdSlotInner({
  placement,
  className,
  dismissible,
}: {
  placement: AdPlacement;
  className?: string;
  dismissible?: boolean;
}) {
  let result: Awaited<ReturnType<typeof serveAd>> | null = null;
  try {
    const session = await auth();
    result = await serveAd({ placement, userId: session?.user?.id ?? null });
  } catch {
    result = null;
  }
  // A failed SSR serve falls back to the ordinary client slot rather than a gap.
  if (!result) return <AdRenderer placement={placement} className={className} dismissible={dismissible} />;
  if (!result.ad) return null;
  return (
    <AdRenderer
      placement={placement}
      className={className}
      dismissible={dismissible}
      initialAd={result.ad as AdResponse}
      initialRotateMs={result.poolSize > 1 ? result.rotateMs : 0}
    />
  );
}

/** The same reserved box AdRenderer draws while loading — server-rendered. */
function AdSlotSkeleton({
  placement,
  className,
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const reserved = resolveAdSize(placementSizeKey(placement));
  const spec = placementSpec(placement);
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-2xl border border-(--app-line) bg-(--app-surface)/40 animate-pulse mx-auto",
        className
      )}
      style={{
        aspectRatio: reserved ? `${reserved.w} / ${reserved.h}` : undefined,
        maxWidth: spec.fillsColumn ? undefined : reserved?.w,
        maxHeight: spec.maxHeightPx,
        minHeight: reserved ? undefined : Math.min(90, spec.maxHeightPx),
      }}
    />
  );
}
