import { z } from "zod";
import { EVENT_ACTION_TYPES } from "@/lib/events-shared";

/**
 * The Mission admin write contract, in ONE place.
 *
 * The create and update routes previously each declared their own enum list and
 * field set — the copies had already drifted, and every new field is another
 * chance for one of them to be forgotten.
 */

export const missionActionTypes = EVENT_ACTION_TYPES as [string, ...string[]];

const tierSchema = z.object({
  threshold: z.number().int().min(1),
  rewardPoints: z.number().int().min(0).default(0),
  rewardXp: z.number().int().min(0).default(0),
});

export const missionFields = {
  title: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  iconEmoji: z.string().max(8).nullable().optional(),
  actionType: z.enum(missionActionTypes),
  targetValue: z.number().int().min(1),
  tiers: z.array(tierSchema).max(10).nullable().optional(),
  pointsReward: z.number().int().min(0).default(0),
  cashReward: z.number().min(0).default(0),
  xpReward: z.number().int().min(0).default(0),
  dailyCap: z.number().int().min(0).max(10_000).default(0),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  order: z.number().int().default(0),
  unlockMissionId: z.string().cuid().nullable().optional(),
  requiredLevel: z.number().int().min(1).max(999).default(1),
  requiredAccessLevel: z.number().int().min(0).max(99).default(0),
  isActive: z.boolean().default(true),
};

export const missionCreateSchema = z.object(missionFields);
export const missionUpdateSchema = z.object(missionFields).partial();

export type MissionCreateInput = z.infer<typeof missionCreateSchema>;

/**
 * Turn validated input into Prisma data. Kept separate from the schema because
 * three fields need shaping the validator can't do: date strings → Date, an
 * empty tier array → null (so `parseEventTiers` sees "single-target"), and the
 * legacy `type` column, which is written only so old rows stay readable.
 */
export function missionData(v: Partial<MissionCreateInput>) {
  const out: Record<string, unknown> = { ...v };
  if (v.startAt !== undefined) out.startAt = v.startAt ? new Date(v.startAt) : null;
  if (v.endAt !== undefined) out.endAt = v.endAt ? new Date(v.endAt) : null;
  if (v.tiers !== undefined) {
    out.tiers = v.tiers && v.tiers.length > 0 ? v.tiers : null;
  }
  return out;
}

/**
 * A mission whose window has already closed, or whose end precedes its start,
 * can never be completed — reject at write time rather than letting an admin
 * publish something that silently does nothing.
 */
export function missionWindowError(
  startAt?: string | null,
  endAt?: string | null
): string | null {
  if (!startAt || !endAt) return null;
  if (new Date(endAt) <= new Date(startAt)) {
    return "The end date must be after the start date.";
  }
  return null;
}
