/**
 * Client instrumentation (Next 16 convention — runs before the app is
 * interactive). Loads the browser Sentry config.
 *
 * Gated on the PUBLIC DSN at build time: without one the import is dead code
 * and Sentry is never shipped to the browser, so this file is free until
 * `NEXT_PUBLIC_SENTRY_DSN` is set.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("../sentry.client.config").catch(() => {
    // Monitoring must never break the app.
  });
}
