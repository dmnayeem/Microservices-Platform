import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Resolve what a report is actually about.
 *
 * `SocialReport.contentId` is a loose string, not a foreign key, so nothing
 * joins for you — which is why the admin queue rendered a bare cuid and asked a
 * moderator to press "Ban user" against it. The agency console already resolved
 * POST and COMMENT this way; this lifts that out, adds USER and LISTING, and
 * returns the author so account-level actions have someone to act on.
 *
 * Everything is batched by type: one query per content type per page of
 * reports, not one per report.
 */

export interface ReportAuthor {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}

export interface ReportPreview {
  /** Present when the content still exists. Null = already deleted. */
  found: boolean;
  /** Main body text, whatever the model calls it. */
  text: string | null;
  images: string[];
  /** Post/Comment `isHidden`, or a listing that is no longer ACTIVE. */
  hidden: boolean;
  author: ReportAuthor | null;
  /** Where a moderator can go to see it in context. */
  href: string | null;
  /** Extra line for types that need one (listing price, user status…). */
  meta: string | null;
}

const MISSING: ReportPreview = {
  found: false,
  text: null,
  images: [],
  hidden: false,
  author: null,
  href: null,
  meta: null,
};

interface ReportLike {
  contentType: string;
  contentId: string;
}

function authorOf(u: {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
}): ReportAuthor {
  return {
    id: u.id,
    name: u.name ?? u.username ?? "Unknown user",
    username: u.username,
    avatar: u.avatar,
  };
}

/**
 * Build a `contentId -> preview` map for a page of reports.
 *
 * Reports whose content has since been deleted map to a "missing" preview
 * rather than being dropped — a moderator still needs to dismiss them, and the
 * page must not throw on them.
 */
export async function resolveReportPreviews(
  reports: ReportLike[]
): Promise<Map<string, ReportPreview>> {
  const byType = new Map<string, string[]>();
  for (const r of reports) {
    const list = byType.get(r.contentType) ?? [];
    list.push(r.contentId);
    byType.set(r.contentType, list);
  }
  const ids = (t: string) => [...new Set(byType.get(t) ?? [])];

  const postIds = ids("POST");
  const commentIds = ids("COMMENT");
  const userIds = ids("USER");
  const listingIds = ids("LISTING");

  const [posts, comments, users, listings] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            content: true,
            images: true,
            isHidden: true,
            user: { select: { id: true, name: true, username: true, avatar: true } },
          },
        })
      : [],
    commentIds.length
      ? prisma.comment.findMany({
          where: { id: { in: commentIds } },
          select: {
            id: true,
            content: true,
            isHidden: true,
            postId: true,
            user: { select: { id: true, name: true, username: true, avatar: true } },
          },
        })
      : [],
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            email: true,
            status: true,
            createdAt: true,
          },
        })
      : [],
    listingIds.length
      ? prisma.marketplaceListing.findMany({
          where: { id: { in: listingIds } },
          select: {
            id: true,
            title: true,
            description: true,
            images: true,
            status: true,
            seller: { select: { id: true, name: true, username: true, avatar: true } },
          },
        })
      : [],
  ]);

  const out = new Map<string, ReportPreview>();

  for (const p of posts) {
    out.set(p.id, {
      found: true,
      text: p.content,
      images: p.images ?? [],
      hidden: p.isHidden,
      author: p.user ? authorOf(p.user) : null,
      href: `/social/post/${p.id}`,
      meta: null,
    });
  }

  for (const c of comments) {
    out.set(c.id, {
      found: true,
      text: c.content,
      images: [],
      hidden: c.isHidden,
      author: c.user ? authorOf(c.user) : null,
      // Comments have no page of their own — link to the post they're on.
      href: `/social/post/${c.postId}`,
      meta: "Comment on a post",
    });
  }

  for (const u of users) {
    out.set(u.id, {
      found: true,
      // The reported thing IS the account, so the "body" is who they are.
      text: u.username ? `@${u.username}` : u.email,
      images: [],
      // A user isn't "hidden"; already-actioned accounts are shown via meta.
      hidden: u.status !== "ACTIVE",
      author: authorOf(u),
      href: `/admin/users/${u.id}`,
      meta: `${u.status} · joined ${u.createdAt.toISOString().slice(0, 10)}`,
    });
  }

  for (const l of listings) {
    out.set(l.id, {
      found: true,
      text: [l.title, l.description].filter(Boolean).join(" — "),
      images: l.images ?? [],
      // A listing has no isHidden; anything not ACTIVE is off the marketplace.
      hidden: l.status !== "ACTIVE",
      author: l.seller ? authorOf(l.seller) : null,
      href: `/marketplace/${l.id}`,
      meta: `Listing · ${l.status}`,
    });
  }

  // Anything unresolved (deleted content, or a GROUP report, which has no
  // moderation surface) still gets an entry so callers never hit undefined.
  for (const r of reports) {
    if (!out.has(r.contentId)) out.set(r.contentId, { ...MISSING });
  }

  return out;
}

/**
 * The account an account-level action (warn / suspend / ban) applies to.
 *
 * `SocialReport` records no author — only what was reported — so this has to be
 * looked up from the content itself. Without it, `WARNED` had nobody to notify,
 * which is why it did nothing at all.
 */
export async function resolveContentOwner(
  contentType: string,
  contentId: string
): Promise<string | null> {
  switch (contentType) {
    case "POST": {
      const p = await prisma.post.findUnique({
        where: { id: contentId },
        select: { userId: true },
      });
      return p?.userId ?? null;
    }
    case "COMMENT": {
      const c = await prisma.comment.findUnique({
        where: { id: contentId },
        select: { userId: true },
      });
      return c?.userId ?? null;
    }
    case "LISTING": {
      const l = await prisma.marketplaceListing.findUnique({
        where: { id: contentId },
        select: { sellerId: true },
      });
      return l?.sellerId ?? null;
    }
    case "USER":
      return contentId;
    default:
      return null;
  }
}
