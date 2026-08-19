// One zod schema for the FULL AdTargeting shape, shared by the advertiser and
// admin ad routes. Before this existed each route carried its own narrow schema
// and zod's strip mode silently discarded 10 of the 14 dimensions the audience
// builder collects — an advertiser could set interests/age/geo and none of it
// was ever stored.
import { z } from "zod";
import type { AdTargeting } from "@/lib/ad-targeting";

const strList = z.array(z.string().trim().min(1)).optional();

export const adTargetingSchema = z
  .object({
    countries: strList,
    regions: strList,
    divisions: strList,
    districts: strList,
    subDistricts: strList,
    postalCodes: strList,
    cities: strList,
    genders: strList,
    packages: strList,
    kycStatuses: strList,
    tags: strList,
    languages: strList,
    minAge: z.number().int().min(0).max(120).optional(),
    maxAge: z.number().int().min(0).max(120).optional(),
    minLevel: z.number().int().min(0).optional(),
    maxLevel: z.number().int().min(0).optional(),
    minAccountAgeDays: z.number().int().min(0).optional(),
    activeWithinDays: z.number().int().min(0).optional(),
    verifiedOnly: z.boolean().optional(),
  })
  .optional();

export type AdTargetingInput = z.infer<typeof adTargetingSchema>;

/** Compile-time guard: the schema must stay a superset of the stored type. */
export type _TargetingCovers = AdTargetingInput extends AdTargeting | undefined
  ? true
  : never;
