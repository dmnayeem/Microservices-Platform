import { inngest, EVENTS } from "./client";
import { prisma } from "@/lib/prisma";
import { expireDueTasks } from "@/lib/task-expiry";
import { runSubscriptionExpiry } from "@/lib/subscription-expiry";
import { runCourseReminders, runLiveClassTransitions } from "@/lib/course-cron";
import { closeAuctionById, closeDueAuctions } from "@/lib/marketplace-auctions";
import { drawLottery } from "@/lib/lottery";
import { pruneOldLogs } from "@/lib/log-retention";

// ── Periodic sweeps (Inngest cron — replaces Vercel Cron) ────────────────────

export const taskExpiry = inngest.createFunction(
  { id: "task-expiry", triggers: [{ cron: "0 * * * *" }] }, // hourly
  async () => expireDueTasks()
);

export const subscriptionExpiry = inngest.createFunction(
  { id: "subscription-expiry", triggers: [{ cron: "0 0 * * *" }] }, // daily
  async () => runSubscriptionExpiry()
);

export const courseReminders = inngest.createFunction(
  { id: "course-reminders", triggers: [{ cron: "0 9 * * *" }] }, // daily 09:00 UTC
  async () => runCourseReminders()
);

export const courseLiveClasses = inngest.createFunction(
  { id: "course-live-classes", triggers: [{ cron: "*/15 * * * *" }] }, // 15 min
  async () => runLiveClassTransitions()
);

export const logRetention = inngest.createFunction(
  { id: "log-retention", triggers: [{ cron: "30 3 * * *" }] }, // daily 03:30 UTC
  async () => pruneOldLogs()
);

// ── Event-driven exact timing (+ backstop sweeps) ────────────────────────────

/** Fires at the listing's exact end time and settles that one auction. */
export const auctionCloseScheduled = inngest.createFunction(
  { id: "auction-close-scheduled", triggers: [{ event: EVENTS.AUCTION_CREATED }] },
  async ({ event, step }) => {
    const { listingId, auctionEndsAt } = event.data as {
      listingId: string;
      auctionEndsAt: string;
    };
    await step.sleepUntil("until-auction-end", new Date(auctionEndsAt));
    return step.run("close-auction", () => closeAuctionById(listingId));
  }
);

/** Backstop: catch auctions created before Inngest, or any missed event. */
export const auctionSweep = inngest.createFunction(
  { id: "auction-sweep", triggers: [{ cron: "*/15 * * * *" }] },
  async () => closeDueAuctions()
);

/** Fires at the lottery's exact draw time and draws it. */
export const lotteryDrawScheduled = inngest.createFunction(
  { id: "lottery-draw-scheduled", triggers: [{ event: EVENTS.LOTTERY_ACTIVATED }] },
  async ({ event, step }) => {
    const { lotteryId, drawDate } = event.data as {
      lotteryId: string;
      drawDate: string;
    };
    await step.sleepUntil("until-draw", new Date(drawDate));
    return step.run("draw-lottery", () => drawLottery(lotteryId));
  }
);

/** Backstop: draw any ACTIVE lottery whose drawDate has passed. */
export const lotterySweep = inngest.createFunction(
  { id: "lottery-sweep", triggers: [{ cron: "0 * * * *" }] }, // hourly
  async ({ step }) => {
    const now = new Date();
    const due = await prisma.lottery.findMany({
      where: { status: "ACTIVE", drawDate: { lte: now } },
      select: { id: true },
      take: 25,
    });
    let drawn = 0;
    for (const { id } of due) {
      const r = await step.run(`draw-${id}`, () => drawLottery(id));
      if (r.ok) drawn++;
    }
    return { candidates: due.length, drawn };
  }
);

export const functions = [
  taskExpiry,
  subscriptionExpiry,
  courseReminders,
  courseLiveClasses,
  logRetention,
  auctionCloseScheduled,
  auctionSweep,
  lotteryDrawScheduled,
  lotterySweep,
];
