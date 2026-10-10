import { z } from "zod";

/** Admin campaign write contract (create + edit). */
export const campaignSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().optional(),
  type: z.enum([
    "XP_MULTIPLIER",
    "BONUS_POINTS",
    "FREE_TICKETS",
    "DISCOUNT",
    "REFERRAL_BOOST",
    "SEASONAL",
  ]),
  value: z.number().min(0).default(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  targetType: z.enum(["ALL", "TIER", "NEW_USERS", "COUNTRY"]).default("ALL"),
  targetValue: z.string().optional().nullable(),
  budget: z.number().min(0).optional().nullable(),
  bannerImage: z.string().url().optional().nullable().or(z.literal("")),
  termsAndConditions: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "ACTIVE", "PAUSED", "ENDED"]).default("SCHEDULED"),
});
