import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side Sentry. Inert without a PUBLIC DSN.
 *
 * Session replay is deliberately NOT enabled: this app shows balances, payout
 * details and KYC data on screen, and replay would record them.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
