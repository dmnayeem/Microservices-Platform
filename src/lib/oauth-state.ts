// Signed OAuth `state` — binds the redirect to the initiating user and blocks
// CSRF. HMAC-SHA256 over `userId.issuedAt`, base64url, same secret chain as the
// article-task token.
import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 10 * 60 * 1000; // 10 min

function secret(): string {
  const s =
    process.env.ARTICLE_TASK_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing token secret for OAuth state");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function signOAuthState(userId: string): string {
  const body = b64url(Buffer.from(`${userId}.${Date.now()}`, "utf8"));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Returns the userId if valid + unexpired, else null. */
export function verifyOAuthState(state: string | null | undefined): string | null {
  if (!state || typeof state !== "string") return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", secret()).update(body).digest();
    provided = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
  const [userId, issued] = decoded.split(".");
  if (!userId || !issued) return null;
  if (Date.now() - parseInt(issued, 10) > TTL_MS) return null;
  return userId;
}
