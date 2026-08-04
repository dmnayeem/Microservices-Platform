/**
 * Record a click on a link inside a feed post. Fire-and-forget (mirrors the ad
 * `trackClick`); `keepalive` lets the request survive the new-tab navigation the
 * click triggers. No-ops without a postId.
 */
export function trackLinkClick(postId?: string) {
  if (!postId || typeof window === "undefined") return;
  try {
    fetch(`/api/feed/${postId}/link-click`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
