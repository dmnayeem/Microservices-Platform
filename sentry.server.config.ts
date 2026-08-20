import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry.
 *
 * **Inert without a DSN.** `Sentry.init` with `dsn: undefined` is a no-op, so
 * this file costs nothing until `SENTRY_DSN` is set in the environment — which
 * means it can ship now and be switched on later by pasting a DSN into Vercel,
 * with no code change and no redeploy of anything else.
 *
 * Why it matters here: this app is built to degrade quietly (the Prisma retry
 * extension retries reads up to four times, `safeRead` swallows non-critical
 * failures), so problems surface to users before they surface anywhere else.
 * Sentry is what turns that into something visible.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Sample rather than trace everything — at launch traffic, 100% tracing is
  // both expensive and unnecessary to spot a trend.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Never ship request bodies: they contain balances, payout details and tokens.
  sendDefaultPii: false,
  enabled: !!process.env.SENTRY_DSN,
});
