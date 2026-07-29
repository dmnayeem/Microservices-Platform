/**
 * Per-user verification codes for auto-verified SOCIAL tasks (anti-fake proof).
 *
 * When an admin marks a content-producing social action (comment / post /
 * review / reply) as "auto-verify by code", each user gets a UNIQUE short code
 * they must include in the text they publish. On submit the server fetches the
 * user's public proof URL and confirms the code is present — a screenshot can't
 * fake it, and copying another user's code fails because the code is derived
 * from (taskId, itemIndex, userId).
 *
 * The code is DERIVED (HMAC), not stored: deterministic ⇒ recomputable at verify
 * time with zero DB rows. Same env secret chain as the article-task token.
 */

import { createHmac } from "crypto";

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

// Confusion-free alphabet (no I/O/0/1), matching the article-key style.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Deterministic per-user code, formatted `XXXX-XXXX` (8 chars). Unique per
 * (task, item, user). Compare case-insensitively against fetched content.
 */
export function verifyCodeFor(
  taskId: string,
  itemIndex: number,
  userId: string
): string {
  const digest = createHmac("sha256", getSecret())
    .update(`${taskId}:${itemIndex}:${userId}`)
    .digest();
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[digest[i] % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** True if `content` contains the code (case-insensitive, hyphen-tolerant). */
export function contentHasCode(content: string, code: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(content).includes(norm(code));
}
