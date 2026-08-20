/**
 * Next.js instrumentation hook — loads the right Sentry config per runtime.
 *
 * All three configs are no-ops without a DSN, so this is free until
 * `SENTRY_DSN` is set. See sentry.server.config.ts for why it exists.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
