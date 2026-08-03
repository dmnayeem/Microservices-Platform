import { Inngest } from "inngest";

/**
 * Inngest client — durable, event-driven scheduler replacing Vercel Cron.
 * Locally, run `npx inngest-cli@latest dev` (no keys). In production set
 * INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY (from the Inngest dashboard).
 */
export const inngest = new Inngest({
  id: "earngpt",
  // Dev mode locally (works without keys / with the Inngest Dev Server); cloud
  // mode in production, which uses INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY.
  isDev: process.env.NODE_ENV !== "production",
});

// Event names emitted from the app (kept as constants to avoid typos).
export const EVENTS = {
  AUCTION_CREATED: "marketplace/auction.created",
  LOTTERY_ACTIVATED: "lottery/activated",
  DEAL_FUNDED: "marketplace/deal.funded",
  DEAL_DELIVERED: "marketplace/deal.delivered",
} as const;
