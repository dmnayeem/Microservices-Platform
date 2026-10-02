import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed one-click unsubscribe links for broadcast (marketing) email.
 *
 * The token names a user and is signed, so a link cannot be edited to switch
 * off somebody else's mail. It does not expire: an unsubscribe link in a
 * month-old email must still work — that is a legal requirement in most
 * places, and Gmail/Yahoo's bulk-sender rules require it to work in one click.
 *
 * What it switches off is `User.emailNotifications` — the same marketing
 * preference the user's own Settings toggle writes and the broadcast audience
 * already honours. Service notices (`important` broadcasts) and transactional
 * mail (verification, password reset, receipts) ignore it on purpose.
 */
function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing NEXTAUTH_SECRET / AUTH_SECRET");
  return s;
}

const sign = (payload: string) =>
  createHmac("sha256", secret()).update(`unsubscribe:${payload}`).digest("base64url").slice(0, 32);

export function signUnsubscribeToken(userId: string): string {
  const payload = Buffer.from(userId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  const t = String(token ?? "").trim();
  const dot = t.indexOf(".");
  if (dot <= 0 || t.length > 200) return null;
  const payload = t.slice(0, dot);
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(t.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const id = Buffer.from(payload, "base64url").toString("utf8");
  return /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null;
}

/** The https page a reader lands on (and Gmail's one-click POST target). */
export function unsubscribeUrls(siteUrl: string, userId: string): { page: string; oneClick: string } {
  const t = encodeURIComponent(signUnsubscribeToken(userId));
  const base = siteUrl.replace(/\/+$/, "");
  return { page: `${base}/unsubscribe?t=${t}`, oneClick: `${base}/api/email/unsubscribe?t=${t}` };
}
