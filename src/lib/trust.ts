import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Anti-fraud reputation adjuster. `trustScore` is clamped to 0–100 in SQL so
 * concurrent bumps stay correct without a read-modify-write. Pass a transaction
 * client (`tx`) when the bump must be atomic with an approval; otherwise the
 * shared `prisma` client is used.
 *
 * Convention: approve → +1, fraud reject → −10 with a strike.
 */
type Db = Pick<typeof prisma, "$executeRaw">;

export async function bumpTrust(
  userId: string,
  delta: number,
  opts: { strike?: boolean; db?: Db } = {}
): Promise<void> {
  const db = opts.db ?? prisma;
  const strike = opts.strike ? 1 : 0;
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "User"
      SET "trustScore" = LEAST(100, GREATEST(0, "trustScore" + ${delta})),
          "fraudStrikes" = "fraudStrikes" + ${strike}
      WHERE "id" = ${userId}
    `
  );
}

/** Standard deltas so call sites stay consistent. */
export const TRUST_APPROVE = 1;
export const TRUST_REJECT = -10;
