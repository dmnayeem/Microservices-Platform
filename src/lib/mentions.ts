/**
 * @mention parsing utilities.
 * - extract @username tokens from raw post/comment content
 * - resolve them to userIds via Prisma
 * - render content with clickable @username links to /u/<id>
 */
import { prisma } from "@/lib/prisma";

/**
 * Matches the username charset (`USERNAME_REGEX` in lib/username.ts), which
 * allows dot and hyphen. It used to be `[a-zA-Z0-9_]` only, so `@john.doe`
 * captured just `john` and the mention silently failed — and `john.doe` is
 * exactly the handle `slugifyUsername` produces from a Google email address.
 *
 * Two deliberate details:
 *  - The lookbehind rejects an `@` preceded by a word character, so an email
 *    address in post text ("mail me at bob@x.com") can't produce a bogus
 *    `@x.com` mention. The old regex got this for free because it disallowed
 *    dots; once dots are allowed it has to be explicit.
 *  - Dots and hyphens are allowed inside, then trailing ones are trimmed by
 *    `trimHandle` — otherwise "thanks @john.doe." would capture `john.doe.`.
 */
const MENTION_RE = /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_][a-zA-Z0-9._-]{1,29})/g;
/** Punctuation that ends a sentence rather than belonging to the handle. */
const TRAILING_RE = /[._-]+$/;

/** The handle as actually written, minus sentence punctuation. */
function trimHandle(raw: string): string {
  return raw.replace(TRAILING_RE, "");
}

export function extractMentionUsernames(content: string): string[] {
  if (!content) return [];
  const matches = content.matchAll(MENTION_RE);
  const set = new Set<string>();
  for (const m of matches) {
    const handle = trimHandle(m[1]);
    // Handles are min 3 chars; a shorter capture can only be punctuation noise.
    if (handle.length >= 3) set.add(handle.toLowerCase());
  }
  return Array.from(set);
}

export async function resolveMentionedUsers(
  usernames: string[]
): Promise<Array<{ id: string; username: string }>> {
  if (usernames.length === 0) return [];
  // Case-insensitive lookup — usernames stored mixed-case
  const users = await prisma.user.findMany({
    where: {
      username: { in: usernames, mode: "insensitive" },
    },
    select: { id: true, username: true },
  });
  return users
    .filter((u) => typeof u.username === "string" && u.username.length > 0)
    .map((u) => ({ id: u.id, username: u.username as string }));
}

/**
 * Render-safe HTML-ish output is not done here (React handles it client-side).
 * Returns segments so the client can map them to <Link> or <span>.
 */
export interface MentionSegment {
  type: "text" | "mention";
  value: string;
  userId?: string;
}

export function splitContentByMentions(
  content: string,
  userMap: Map<string, string> // username (lowercased) -> userId
): MentionSegment[] {
  if (!content) return [];
  const out: MentionSegment[] = [];
  let lastIndex = 0;
  for (const m of content.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    // Trailing punctuation belongs to the sentence, not the handle — so it must
    // stay OUT of the link and be pushed back as text. That means advancing by
    // the trimmed length, not m[0].length.
    const username = trimHandle(m[1]);
    if (start > lastIndex) {
      out.push({ type: "text", value: content.slice(lastIndex, start) });
    }
    const userId = username.length >= 3 ? userMap.get(username.toLowerCase()) : undefined;
    if (userId) {
      out.push({ type: "mention", value: `@${username}`, userId });
    } else {
      // Unknown user — render plain text
      out.push({ type: "text", value: `@${username}` });
    }
    lastIndex = start + 1 + username.length;
  }
  if (lastIndex < content.length) {
    out.push({ type: "text", value: content.slice(lastIndex) });
  }
  return out;
}
