/**
 * The caption a member pastes when a task asks them to share or publish.
 *
 * The admin writes the caption and hashtags once; the member gets a Copy
 * button. With "add the member's username" on, each member's copy ends with
 * their OWN hashtag (#rafi_123), and a `usertag` verification rule
 * (lib/link-verify) can then check that it was really this member who posted.
 *
 * Client-safe: used by the admin builder, the task API and the submit route.
 */

/**
 * The member's own hashtag, without the "#". Hashtags on Facebook, Instagram,
 * X and TikTok stop at anything that is not a letter, digit or underscore, so
 * a username like "rafi.ahmed-12" becomes "rafi_ahmed_12" — the same tag the
 * platform would actually link. Null when there is nothing usable.
 */
export function userHashtag(username: string | null | undefined): string | null {
  const tag = (username ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return tag.length >= 2 ? tag : null;
}

/**
 * Does this action publish something a caption belongs on? Shares, posts,
 * stories, reels, pins, tweets, reposts — not likes, follows, saves, comments
 * (a comment has its own template) or "keep it live".
 */
export function actionTakesCaption(actionKey: string | null | undefined): boolean {
  const k = (actionKey ?? "").toUpperCase();
  if (!k) return false;
  if (/^(LIKE|SAVE|FOLLOW|SUBSCRIBE|JOIN|WATCH|VIEW|REACT|VOTE|KEEP|COMMENT|REPLY|RATE|INSTALL|SIGN)/.test(k)) return false;
  return /SHARE|POST|STORY|REEL|PIN|TWEET|REPOST|RETWEET|QUOTE|CROSS|UPLOAD|THREAD|STATUS|SHORT|VIDEO|PUBLISH|ARTICLE|REVIEW|CAPTION/.test(k);
}

/** "summer, #Sale  deal" → ["#summer", "#Sale", "#deal"]. */
export function parseHashtags(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[\s,]+/)) {
    const t = part.replace(/^#+/, "").trim();
    if (t && !out.some((x) => x.toLowerCase() === `#${t}`.toLowerCase())) out.push(`#${t}`);
  }
  return out;
}

/**
 * The text the member copies: the caption, then one line of hashtags with the
 * member's own tag last. Null when the admin set nothing.
 */
export function composeCaption(opts: {
  caption?: string | null;
  hashtags?: string | null;
  userTag?: string | null;
}): string | null {
  const body = (opts.caption ?? "").trim();
  const tags = parseHashtags(opts.hashtags);
  if (opts.userTag) tags.push(`#${opts.userTag}`);
  const tagLine = tags.join(" ");
  const text = [body, tagLine].filter(Boolean).join(body && tagLine ? "\n\n" : "");
  return text || null;
}
