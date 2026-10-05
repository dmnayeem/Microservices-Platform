import { prisma } from "@/lib/prisma";
import { privacyLevelFor } from "@/lib/profile-privacy";
import {
  isPubliclyVisible,
  parseAudienceEpoch,
  PUBLIC_AUDIENCE_EPOCH_KEY,
} from "@/lib/public-post-gate";
import { getSetting } from "@/lib/system-settings";
import { mediaSrc } from "@/lib/media-url";

// The gate itself lives in `public-post-gate.ts` — no imports, so the
// verification script can exercise the real rule rather than a copy of it.
export {
  isPubliclyVisible,
  authorChosePublic,
  postAudience,
  PUBLIC_AUDIENCE_EPOCH_KEY,
} from "@/lib/public-post-gate";
export type { PublicPostGateRow, PostAudience } from "@/lib/public-post-gate";

/**
 * The instant the audience picker went live, in ms — or null if it never did.
 *
 * Null is the fail-closed answer: `authorChosePublic` refuses every post when
 * there is no epoch, so a missing or corrupt setting publishes nothing rather
 * than publishing everything.
 */
export async function publicAudienceEpochMs(): Promise<number | null> {
  return parseAudienceEpoch(
    await getSetting<string | null>(PUBLIC_AUDIENCE_EPOCH_KEY, null)
  );
}

export interface PublicPost {
  id: string;
  content: string;
  images: string[];
  backgroundStyle: string | null;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  linkPreview: {
    url?: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  } | null;
  author: {
    name: string;
    username: string | null;
    /** null when the author's "Profile photo" privacy is not Everyone. */
    avatar: string | null;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
  };
}

/**
 * Load a post for the logged-out page, or null.
 *
 * Returns null — never a partial post — for anything the gate refuses, so a
 * caller cannot accidentally render "some" of a private post. The author block
 * carries name/username/verified only; bio, location, level, earnings and stats
 * are not selected at all, so there is nothing for a future edit to leak by
 * spreading the object into JSX.
 *
 * The avatar is the one author field with its own privacy switch (Everyone /
 * Followers / Only me). An anonymous viewer is nobody's follower, so anything
 * but PUBLIC resolves to no avatar.
 */
/**
 * Is logged-out post sharing switched on at all?
 *
 * OFF until the owner turns it on, and that is not caution for its own sake.
 * `Post.isPublic` DEFAULTS to true and the old composer hardcoded
 * `isPublic: true`, so nobody who posted before the audience picker shipped
 * chose to be readable by the whole internet. Every one of those posts would
 * have become crawlable the moment this route went live, retroactively, on
 * behalf of people who were never asked.
 *
 * That is now handled by `feed.public_audience_epoch` (see public-post-gate.ts):
 * a post counts as public only if it was created at or after the picker went
 * live. This switch is the second lock — the whole logged-out surface (page,
 * metadata, OG image, sitemap) is inert while it is off.
 */
export async function publicSharingEnabled(): Promise<boolean> {
  return getSetting<boolean>("feed.public_post_sharing", false);
}

export async function getPublicPost(id: string): Promise<PublicPost | null> {
  if (!id || typeof id !== "string") return null;
  // Checked HERE rather than in the page, because this is the one read every
  // surface goes through — page, metadata, OG image and sitemap. A switch on the
  // page would leave the unfurler and the sitemap still answering.
  if (!(await publicSharingEnabled())) return null;
  const epochMs = await publicAudienceEpochMs();
  if (epochMs === null) return null;

  const row = await prisma.post
    .findUnique({
      where: { id },
      select: {
        id: true,
        content: true,
        images: true,
        backgroundStyle: true,
        createdAt: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        linkPreview: true,
        isPublic: true,
        isHidden: true,
        groupId: true,
        user: {
          select: {
            name: true,
            username: true,
            avatar: true,
            isBlueVerified: true,
            verifiedBadgeStyle: true,
            status: true,
            privacyAvatar: true,
            privacyFields: true,
          },
        },
      },
    })
    .catch(() => null);

  if (!isPubliclyVisible(row, epochMs)) return null;
  // `isPubliclyVisible` already proved both of these; the checks are here so
  // TypeScript narrows without a cast.
  if (!row || !row.user) return null;

  const avatarPublic = privacyLevelFor(row.user, "avatar") === "PUBLIC";

  const preview =
    row.linkPreview && typeof row.linkPreview === "object" && !Array.isArray(row.linkPreview)
      ? (row.linkPreview as PublicPost["linkPreview"])
      : null;

  return {
    id: row.id,
    content: row.content,
    images: row.images ?? [],
    backgroundStyle: row.backgroundStyle,
    createdAt: row.createdAt,
    likesCount: row.likesCount,
    commentsCount: row.commentsCount,
    sharesCount: row.sharesCount,
    linkPreview: preview,
    author: {
      name: row.user.name || "RevType member",
      username: row.user.username,
      avatar: avatarPublic ? row.user.avatar : null,
      isBlueVerified: row.user.isBlueVerified,
      verifiedBadgeStyle: row.user.verifiedBadgeStyle,
    },
  };
}

/** The site origin, for canonical + absolute og: URLs. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com"
).replace(/\/+$/, "");

/** The canonical, shareable address of a post. */
export function publicPostUrl(id: string): string {
  return `${SITE_URL}/post/${id}`;
}

/**
 * A one-line summary for `og:description` / `twitter:description`.
 *
 * Collapses newlines (a multi-line description renders as one run-on line in
 * every unfurler anyway) and strips the trailing partial word so the ellipsis
 * does not land mid-syllable.
 */
export function postSummary(content: string, max = 180): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** An absolute URL for a stored image path (og: tags must be absolute). */
export function absoluteMediaUrl(raw: string): string {
  // Our private-bucket URLs 403 when fetched directly → the same-origin proxy.
  const src = mediaSrc(raw);
  if (/^https?:\/\//i.test(src)) return src;
  return `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}
