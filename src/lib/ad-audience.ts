import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTargeting } from "@/lib/ad-targeting";
import { audienceWhere, type AudienceCriteria } from "@/lib/audience";

/**
 * Ad targeting → Prisma `User.where`, for counting how many real users an
 * audience reaches.
 *
 * This used to be a second, hand-rolled implementation of `audienceWhere()` with
 * subtly different age math and no sub-country geo, so an ad's estimated reach
 * and a push segment's reach disagreed on identical criteria. `AdTargeting` is a
 * subset of `AudienceCriteria`, so the ad path now just delegates — one matcher,
 * one set of semantics.
 *
 * Still an approximation in one place: `packages` filters the raw `package.slug`
 * relation, while serving uses the *effective* package (which can differ after
 * expiry). Close enough for an estimate.
 */
export function targetingToUserWhere(raw: unknown): Prisma.UserWhereInput {
  return audienceWhere(parseTargeting(raw) as AudienceCriteria);
}

/** Reach estimate for a targeting object: matching users out of the active base. */
export async function estimateAudience(
  raw: unknown
): Promise<{ count: number; total: number }> {
  const [count, total] = await Promise.all([
    prisma.user.count({ where: targetingToUserWhere(raw) }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
  ]);
  return { count, total };
}
