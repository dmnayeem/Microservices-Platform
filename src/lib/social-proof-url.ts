/**
 * What a submitted proof link is allowed to BE.
 *
 * Until now the only check on a proof URL was that the string was not empty,
 * so a Pinterest "Create Pin" task could be completed by pasting the admin's
 * own destination link — or any link at all — straight back into the proof
 * field, and it was approved. The user never had to make a pin.
 *
 * Two rules, and they are different questions:
 *
 *   1. SHAPE — is this the right kind of link at all? Deterministic, no
 *      network, and safe to enforce the moment the form is submitted. A
 *      profile URL is not a pin; a shop's own URL is not a pin.
 *   2. DESTINATION — does the pin actually point where the admin asked? That
 *      needs the page fetched, so it runs with the rest of the content
 *      verification and can come back "unverifiable" rather than "wrong".
 *
 * Only rules that can be justified are listed. An action with no entry keeps
 * today's behaviour exactly, because inventing a shape for a platform whose
 * URLs have not been checked would reject honest work.
 */

/** Pinterest serves the same site from many country domains. */
function isPinterestHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  // pinterest.com, pinterest.co.uk, in.pinterest.com, br.pinterest.com …
  if (/(^|\.)pinterest\.[a-z]{2,}(\.[a-z]{2,})?$/.test(h)) return true;
  // The official share shortener. It redirects to a pin, and a reader who
  // copies from the Pinterest app is given exactly this.
  return h === "pin.it";
}

function parse(url: string): URL | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

/** A link to one pin — `/pin/<id>` or `/pin/<slug>--<id>` — or a pin.it share. */
export function isPinterestPinUrl(url: string): boolean {
  const u = parse(url);
  if (!u || !isPinterestHost(u.hostname)) return false;
  if (u.hostname.toLowerCase().replace(/^www\./, "") === "pin.it") {
    // pin.it/<code>; the code is opaque, so require only that there is one.
    return /^\/[A-Za-z0-9]+\/?$/.test(u.pathname);
  }
  return /^\/pin\/[^/]+\/?$/i.test(u.pathname);
}

/** Any Pinterest page that is NOT a single pin — a board, a profile. */
export function isPinterestNonPinUrl(url: string): boolean {
  const u = parse(url);
  if (!u || !isPinterestHost(u.hostname)) return false;
  return !/^\/pin\//i.test(u.pathname);
}

export interface ProofUrlRule {
  /** True when the submitted URL is the right kind of link. */
  test: (url: string) => boolean;
  /** Shown to the user when it is not. Must say what to paste instead. */
  hint: string;
}

const RULES: Record<string, ProofUrlRule> = {
  "PINTEREST/CREATE_PIN": {
    test: isPinterestPinUrl,
    hint:
      "Paste the link to the pin you created — it looks like " +
      "https://www.pinterest.com/pin/1234567890/ (or a pin.it link). " +
      "A profile, board, or website link will not be accepted.",
  },
  "PINTEREST/CREATE_BOARD": {
    // Deliberately looser than the pin rule: board URLs are `/user/board/`,
    // but Pinterest also serves section and locale variants, so this asks
    // only that it is a Pinterest page and not a pin.
    test: isPinterestNonPinUrl,
    hint:
      "Paste the link to the board you created on Pinterest — not a pin, and " +
      "not a link to another site.",
  },
};

/**
 * The shape rule for one action, or null when we have no justified rule and
 * the submission should be accepted as before.
 */
export function proofUrlRule(
  platformKey: string | null | undefined,
  actionKey: string | null | undefined
): ProofUrlRule | null {
  if (!platformKey || !actionKey) return null;
  return RULES[`${platformKey}/${actionKey}`] ?? null;
}

/**
 * The admin field holding the link the proof page must POINT AT, for actions
 * where that is the whole point of the task.
 *
 * For a Pinterest pin this is the destination the pin opens — the reason the
 * advertiser paid for the pin at all. Matching it is what separates a real
 * pin for this campaign from any pin the user happens to own.
 */
export function destinationFieldFor(
  platformKey: string | null | undefined,
  actionKey: string | null | undefined
): string | null {
  if (platformKey === "PINTEREST" && actionKey === "CREATE_PIN") {
    return "destinationUrl";
  }
  return null;
}

/**
 * Where a proof link for each platform can live. Auto-verification fetches the
 * submitted page and looks for the user's code or the admin's keywords; with
 * no host check, a page the user wrote themselves (a paste, a gist, their own
 * site) carrying that text verified — and auto-approved — a post that was
 * never made. Platforms missing here (WEBSITE, MEDIUM, review sites with many
 * regional domains) are not restricted.
 */
const PROOF_HOSTS: Record<string, string[]> = {
  FACEBOOK: ["facebook.com", "fb.com", "fb.watch"],
  FB_GROUP: ["facebook.com", "fb.com"],
  FACEBOOK_REVIEWS: ["facebook.com", "fb.com"],
  TWITTER: ["x.com", "twitter.com"],
  YOUTUBE: ["youtube.com", "youtu.be"],
  INSTAGRAM: ["instagram.com"],
  TIKTOK: ["tiktok.com"],
  LINKEDIN: ["linkedin.com", "lnkd.in"],
  THREADS: ["threads.net", "threads.com"],
  REDDIT: ["reddit.com", "redd.it"],
  QUORA: ["quora.com"],
  BLUESKY: ["bsky.app"],
};

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** False only when the platform has a known home and the link is elsewhere. */
export function proofHostAllowed(
  platformKey: string | null | undefined,
  url: string
): boolean {
  if (!platformKey) return true;
  if (platformKey === "PINTEREST") {
    const u = parse(url);
    return !!u && isPinterestHost(u.hostname);
  }
  const hosts = PROOF_HOSTS[platformKey];
  if (!hosts) return true;
  const u = parse(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  return hosts.some((d) => hostMatches(host, d));
}
