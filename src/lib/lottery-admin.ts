import { z } from "zod";
import { tiersTotalPercent, parsePrizeTiers } from "@/lib/lottery-prizes";

/**
 * The lottery admin write contract, in one place.
 *
 * Create validated a handful of fields by hand ("Missing required fields") and
 * update did not exist at all — the form has always PUT to a route with no PUT
 * handler, so a lottery could never be corrected after creation. Both now share
 * this schema, and it enforces the rules that actually matter: a lottery whose
 * dates are impossible, or whose POOL percentages don't add to 100, is a
 * lottery that quietly pays the wrong amount.
 */

export const fixedPrizeSchema = z.object({
  position: z.number().int().min(1),
  amount: z.number().int().min(0),
  description: z.string().max(120).default(""),
});

export const prizeTierSchema = z.object({
  position: z.number().int().min(1),
  percent: z.number().min(0.01).max(100),
  description: z.string().max(120).default(""),
});

const base = {
  title: z.string().min(2).max(160),
  description: z.string().max(2000).nullable().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  drawDate: z.string().datetime(),
  ticketPrice: z.number().int().min(1).max(10_000_000),
  maxTickets: z.number().int().min(1).nullable().optional(),
  maxTicketsPerUser: z.number().int().min(1).max(10_000).default(10),

  prizeMode: z.enum(["FIXED", "POOL"]).default("FIXED"),
  prizes: z.array(fixedPrizeSchema).max(20).default([]),
  prizeTiers: z.array(prizeTierSchema).max(20).nullable().optional(),
  houseCutPercent: z.number().int().min(0).max(90).default(0),
  poolSeedPoints: z.number().int().min(0).default(0),
  poolCapPoints: z.number().int().min(0).nullable().optional(),

  minTickets: z.number().int().min(0).max(1_000_000).default(0),
  shortfallAction: z.enum(["DRAW", "REFUND", "ROLLOVER"]).default("DRAW"),
  rolloverTargetId: z.string().cuid().nullable().optional(),
};

export const lotteryCreateSchema = z.object(base);
export const lotteryUpdateSchema = z.object(base).partial();

export type LotteryInput = z.infer<typeof lotteryCreateSchema>;

/** Percentage sums are compared with a tolerance — 33.33×3 never hits 100. */
const PERCENT_EPSILON = 0.01;

/**
 * Cross-field rules a zod schema can't express. Returns a human message, or
 * null when the config is coherent.
 *
 * Each one exists because the alternative is a lottery that looks fine in the
 * admin list and then misbehaves at draw time, when money moves.
 */
export function lotteryConfigError(v: Partial<LotteryInput>): string | null {
  const start = v.startDate ? new Date(v.startDate) : null;
  const end = v.endDate ? new Date(v.endDate) : null;
  const draw = v.drawDate ? new Date(v.drawDate) : null;

  if (start && end && end <= start) {
    return "Sales must close after they open — the end date has to be later than the start date.";
  }
  if (end && draw && draw < end) {
    return "The draw can't happen before sales close. Set the draw date on or after the end date.";
  }

  if (v.prizeMode === "POOL") {
    const tiers = parsePrizeTiers(v.prizeTiers ?? []);
    if (tiers.length === 0) {
      return "Pool mode needs at least one prize tier.";
    }
    const total = tiersTotalPercent(tiers);
    if (Math.abs(total - 100) > PERCENT_EPSILON) {
      return `Prize tiers must add up to 100% — they currently total ${total.toFixed(2)}%.`;
    }
    if (v.poolCapPoints != null && v.poolCapPoints > 0) {
      const floor = (v.poolSeedPoints ?? 0);
      if (v.poolCapPoints < floor) {
        return "The pool cap is below the guaranteed seed, so the seed could never be paid out in full.";
      }
    }
  } else if (v.prizeMode === "FIXED") {
    if (!v.prizes || v.prizes.length === 0) {
      return "Fixed mode needs at least one prize.";
    }
    if (v.prizes.every((p) => p.amount <= 0)) {
      return "Every prize is worth 0 points — nobody would win anything.";
    }
  }

  if (v.shortfallAction === "ROLLOVER" && !v.rolloverTargetId) {
    return "Pick the lottery the pot should roll over into.";
  }
  if (v.shortfallAction !== "DRAW" && (v.minTickets ?? 0) <= 0) {
    return "Set a minimum ticket count — refund and rollover only apply when the minimum isn't reached.";
  }
  if (
    v.minTickets != null &&
    v.maxTickets != null &&
    v.maxTickets > 0 &&
    v.minTickets > v.maxTickets
  ) {
    return "The minimum ticket count is above the maximum, so the minimum can never be reached.";
  }

  return null;
}

/** Turn validated input into Prisma data (dates parsed, empty tiers → null). */
export function lotteryData(v: Partial<LotteryInput>) {
  const out: Record<string, unknown> = { ...v };
  if (v.startDate !== undefined) out.startDate = new Date(v.startDate);
  if (v.endDate !== undefined) out.endDate = new Date(v.endDate);
  if (v.drawDate !== undefined) out.drawDate = new Date(v.drawDate);
  if (v.prizes !== undefined) out.prizes = v.prizes;
  if (v.prizeTiers !== undefined) {
    out.prizeTiers = v.prizeTiers && v.prizeTiers.length > 0 ? v.prizeTiers : null;
  }
  if (v.maxTickets !== undefined) out.maxTickets = v.maxTickets ?? null;
  if (v.poolCapPoints !== undefined) out.poolCapPoints = v.poolCapPoints ?? null;
  if (v.rolloverTargetId !== undefined) {
    out.rolloverTargetId = v.rolloverTargetId ?? null;
  }
  return out;
}

/**
 * Which fields may still be edited once a lottery has sold tickets.
 *
 * Changing the price, the prize split or the minimum after people have paid
 * changes the deal they bought into. Presentation and a LATER draw date are
 * safe; everything else is frozen.
 */
export const EDITABLE_AFTER_SALES = [
  "title",
  "description",
  "drawDate",
] as const;

export function frozenFieldError(
  v: Partial<LotteryInput>,
  ticketsSold: number,
  currentDrawDate: Date
): string | null {
  if (ticketsSold === 0) return null;

  const touched = Object.keys(v).filter(
    (k) => !EDITABLE_AFTER_SALES.includes(k as (typeof EDITABLE_AFTER_SALES)[number])
  );
  if (touched.length > 0) {
    return `${ticketsSold} ticket${ticketsSold === 1 ? " has" : "s have"} already been sold, so only the title, description and draw date can still be changed. Remove: ${touched.join(", ")}.`;
  }
  if (v.drawDate && new Date(v.drawDate) < currentDrawDate) {
    return "The draw date can be pushed back but not brought forward — people bought tickets expecting the original date at the earliest.";
  }
  return null;
}
