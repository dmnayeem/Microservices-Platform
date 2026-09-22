import { prisma } from "@/lib/prisma";
import { calculateLevel } from "@/lib/level";
import { ensureLevelCurve } from "@/lib/level-curve-server";

/**
 * Bring a user's stored `level` back in line with their `xp`.
 *
 * WHY THIS EXISTS
 * ---------------
 * XP is awarded from twelve places: task submission, admin approval,
 * achievements, the daily reward, the daily mission, quizzes (two routes),
 * solo rewards, board claims, events (twice) and social earning. Five of them
 * recomputed the level afterwards. Seven did not.
 *
 * The result was a user who earns from a daily mission or a quiz and watches
 * their progress bar sit at 100% — permanently, until they happen to submit an
 * ordinary task, which is the one path that did the recompute. One real account
 * was found in that state: 322 XP, stored level 2, curve says 3.
 *
 * So the recompute lives here, once. A new XP-awarding route now has one
 * obvious thing to call, and `scripts/verify-phase2b-behaviour.ts` fails if any
 * stored level disagrees with the curve — which is how the next omission gets
 * caught before a user notices it.
 *
 * DESIGN
 * ------
 * Level only ever goes UP. A curve change or a manual XP correction must not
 * silently demote somebody who has already been told they are level 9 — that
 * is a support ticket and a broken promise, not a fix. If a level genuinely
 * has to come down, an admin does it deliberately.
 *
 * Read-then-write rather than a raw expression, because the curve is a
 * threshold table and not something SQL can evaluate. The read is by primary
 * key and the write only happens when the level actually changed, so the
 * common case is one indexed read and nothing else.
 */
export async function syncUserLevel(
  userId: string
): Promise<{ level: number; changed: boolean }> {
  // The admin's curve, before anything is judged against it. Without this a
  // cold instance would write a level from the shipped curve while the browser
  // drew a bar from the admin's — the exact disagreement this module exists to
  // prevent.
  await ensureLevelCurve();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, level: true },
  });
  if (!user) return { level: 0, changed: false };

  const shouldBe = calculateLevel(user.xp);
  if (shouldBe <= user.level) return { level: user.level, changed: false };

  await prisma.user.update({
    where: { id: userId },
    data: { level: shouldBe },
  });
  return { level: shouldBe, changed: true };
}

/**
 * The same, but never throwing.
 *
 * Every caller has already credited the reward by the time it gets here. A
 * failed level bump must not roll back a payment or turn a successful claim
 * into an error the user sees — the next award, or the backfill, will correct
 * it. Losing the level for a few minutes is recoverable; losing the reward is
 * not.
 */
export async function syncUserLevelQuietly(userId: string): Promise<void> {
  try {
    await syncUserLevel(userId);
  } catch {
    /* deliberate: see above */
  }
}
