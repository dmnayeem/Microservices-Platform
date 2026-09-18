/**
 * Signed session tokens for the cross-domain article-task embed flow.
 *
 * The user clicks "Start" on our site, we create a PENDING TaskSubmission and
 * sign a token { submissionId, taskId, userId, exp }. The token is appended
 * to the article-page URL so the embed script (running on a third-party
 * domain with no cookies) can authenticate every API call without a session.
 *
 * Implementation: HMAC-SHA256 over a JSON payload, both base64url-encoded.
 * Compact, URL-safe, dependency-free (uses Node's built-in `crypto`).
 */

import { createHmac, timingSafeEqual } from "crypto";

export interface ArticleTaskTokenPayload {
  /** Submission row id (PENDING). */
  s: string;
  /** Task id. */
  t: string;
  /** User id. */
  u: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 6; // 6 hours

function getSecret(): string {
  const s =
    process.env.ARTICLE_TASK_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      "Missing token secret (set ARTICLE_TASK_TOKEN_SECRET, NEXTAUTH_SECRET, or AUTH_SECRET)"
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  // Restore base64 padding then decode
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function signArticleTaskToken(
  payload: Omit<ArticleTaskTokenPayload, "iat" | "exp">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: ArticleTaskTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = b64urlEncode(JSON.stringify(full));
  const sig = b64urlEncode(
    createHmac("sha256", getSecret()).update(body).digest()
  );
  return `${body}.${sig}`;
}

export function verifyArticleTaskToken(
  token: string | null | undefined
): { ok: true; payload: ArticleTaskTokenPayload } | { ok: false; error: string } {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing token" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, error: "Malformed token" };
  }
  const [body, sig] = parts;

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", getSecret()).update(body).digest();
    provided = b64urlDecode(sig);
  } catch {
    return { ok: false, error: "Invalid token" };
  }

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, error: "Bad signature" };
  }

  let payload: ArticleTaskTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, error: "Invalid payload" };
  }

  if (
    typeof payload.s !== "string" ||
    typeof payload.t !== "string" ||
    typeof payload.u !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, error: "Invalid payload shape" };
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Token expired" };
  }

  return { ok: true, payload };
}

/**
 * Put the session token on an article page URL.
 *
 * Every page of the journey is reached by this, and the embed reads the token
 * with `searchParams.get('eg')` — so the token has to end up in the QUERY, on
 * whatever URL the admin actually typed. Two shapes broke the naive
 * `url + '?eg=' + token`:
 *
 *  - `https://site.com/a#part2` put the query inside the fragment, where
 *    `searchParams` cannot see it. The embed then found no token and returned
 *    silently, so the page simply showed no popups and said nothing.
 *  - Re-entering a page that already carried a token appended a second `eg=`,
 *    and the URL grew on every hop through the pool.
 *
 * This lives in one place because it was previously implemented twice — the
 * copy in the start route (the reader's FIRST link) still had both bugs after
 * the one in embed-config was fixed.
 */
export function appendArticleToken(url: string, token: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("eg", token);
    return u.toString();
  } catch {
    // A relative or otherwise unparseable URL, handled textually so an admin
    // who typed one still gets a working link.
    const [beforeHash, ...hashParts] = url.split("#");
    const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
    const stripped = beforeHash
      .replace(/([?&])eg=[^&]*/g, "$1")
      .replace(/[?&]$/, "");
    const sep = stripped.includes("?") ? "&" : "?";
    return `${stripped}${sep}eg=${encodeURIComponent(token)}${hash}`;
  }
}
