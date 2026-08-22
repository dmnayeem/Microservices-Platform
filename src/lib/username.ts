// Client-safe username helpers (format rules + slug builder). NO server imports
// here so this can be used from client components and server code alike. The
// server-only "make it unique" resolver lives in `src/lib/auth/services.ts`.

/** A URL-safe profile handle: 3-30 of letters, numbers, dot, underscore, hyphen. */
export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export function isValidUsername(s: string): boolean {
  return USERNAME_REGEX.test(s);
}

export const USERNAME_RULE_MESSAGE =
  "Username must be 3-30 characters: letters, numbers, dot, underscore or hyphen.";

/**
 * Turn an arbitrary name/email into a valid username *base* (lowercase, only
 * allowed chars, trimmed of leading/trailing punctuation, max 24 so a
 * uniqueness suffix still fits in 30). May be shorter than 3 — callers that
 * need a guaranteed-valid handle should append a suffix (see the server-side
 * unique generator).
 */
export function slugifyUsername(input: string): string {
  const s = (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
  return s.slice(0, 24);
}

/**
 * Handles nobody may claim. Two reasons: the app routes `/u/<username>`, so a
 * handle that collides with a real path is confusing at best; and impersonating
 * the platform ("admin", "support") is the oldest trick there is.
 *
 * Compared lowercase — see `isReservedUsername`.
 */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "superadmin", "sysadmin", "moderator", "mod",
  "support", "help", "helpdesk", "contact", "info", "team", "staff", "official",
  "earngpt", "system", "security", "billing", "payments", "payment", "finance",
  "api", "app", "www", "mail", "email", "login", "signin", "signup", "register",
  "logout", "auth", "oauth", "verify", "password", "reset", "settings", "profile",
  "dashboard", "wallet", "withdraw", "withdrawal", "deposit", "referral", "refer",
  "tasks", "task", "feed", "social", "search", "notifications", "me", "user",
  "users", "null", "undefined", "anonymous", "guest", "test", "demo",
]);

export function isReservedUsername(s: string): boolean {
  return RESERVED_USERNAMES.has((s || "").trim().toLowerCase());
}

/**
 * The one validator every caller should use: format + reserved words.
 * Returns null when the handle is fine, otherwise the reason code.
 */
export function checkUsername(s: string): "INVALID" | "RESERVED" | null {
  const v = (s || "").trim();
  if (!isValidUsername(v)) return "INVALID";
  if (isReservedUsername(v)) return "RESERVED";
  return null;
}
