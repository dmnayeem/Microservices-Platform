import { normalizeSocialConfig } from "@/lib/social-tasks";
import { fetchLinkPreview } from "@/lib/link-preview";

/**
 * Best-effort task thumbnail: when a task has no thumbnail but has a content
 * link, derive one from the link (YouTube/Vimeo poster or the page's og:image)
 * via the same SSRF-guarded preview used by the feed. Returns the existing
 * thumbnail unchanged, or null on any failure — never blocks the task save.
 *
 * Server-only (fetchLinkPreview performs network + DNS checks).
 */
export async function resolveTaskThumbnail(args: {
  thumbnailUrl?: string | null;
  contentUrl?: string | null;
  socialConfig?: unknown;
  socialUrl?: string | null;
}): Promise<string | null> {
  const existing = (args.thumbnailUrl ?? "").trim();
  if (existing) return existing;

  let link = (args.contentUrl ?? "").trim();
  if (!link) {
    try {
      const items = normalizeSocialConfig(args.socialConfig).items;
      link = (
        items.find((i) => i.fields?.targetUrl?.trim())?.fields?.targetUrl ?? ""
      ).trim();
    } catch {
      /* ignore malformed social config */
    }
  }
  if (!link) link = (args.socialUrl ?? "").trim();
  if (!/^https?:\/\//i.test(link)) return null;

  try {
    const preview = await fetchLinkPreview(link);
    return preview?.image?.trim() || null;
  } catch {
    return null;
  }
}
