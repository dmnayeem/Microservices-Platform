/**
 * `{name}` in a notification / push / email becomes each member's own first
 * name — "Rafi, শুধুমাত্র আপনার জন্য". Client-safe: the admin preview uses it.
 */

export const NAME_TOKEN = "{name}";

const TOKEN_RE = /\{\s*name\s*\}/gi;

export function hasNameToken(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && /\{\s*name\s*\}/i.test(t));
}

/** First word of the display name, else the username, else a friendly fallback. */
export function firstNameOf(u: { name?: string | null; username?: string | null } | null | undefined): string {
  const n = (u?.name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const un = (u?.username ?? "").trim();
  return un || "Friend";
}

export function personalize(text: string, name: string): string;
export function personalize(text: string | null | undefined, name: string): string | null | undefined;
export function personalize(text: string | null | undefined, name: string) {
  return text ? text.replace(TOKEN_RE, name) : text;
}
