import * as Sentry from "@sentry/nextjs";

// Edge runtime (middleware). Inert without a DSN — see sentry.server.config.ts.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  enabled: !!process.env.SENTRY_DSN,
});
