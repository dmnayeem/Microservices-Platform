/**
 * Google OAuth credentials, whichever name the server's .env uses.
 *
 * This code has always read GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, but
 * Auth.js v5's own convention is AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET — a .env
 * written with those names silently turned Google sign-in off. Edge-safe: no
 * imports, read by both the middleware config and the Node auth instance.
 */
function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

export const GOOGLE_CLIENT_ID = pick("GOOGLE_CLIENT_ID", "AUTH_GOOGLE_ID", "GOOGLE_ID");
export const GOOGLE_CLIENT_SECRET = pick(
  "GOOGLE_CLIENT_SECRET",
  "AUTH_GOOGLE_SECRET",
  "GOOGLE_SECRET"
);
