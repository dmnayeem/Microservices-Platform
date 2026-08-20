import { prisma } from "@/lib/prisma";

/**
 * Flip ACTIVE tasks whose `expiresAt` has passed to EXPIRED so they drop out of
 * the earn feeds. Idempotent — only touches still-ACTIVE past-deadline rows.
 */
export async function expireDueTasks(): Promise<{ expired: number; drained: boolean }> {
  const now = new Date();
  // Batched rather than one unbounded updateMany. Steady state is a handful of
  // rows, but a backlog (or a bulk-expiry event) would otherwise take a long
  // write lock on Task — the table every earn surface reads constantly.
  const BATCH = 1_000;
  const MAX_BATCHES = 50;
  let expired = 0;
  let drained = false;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const due = await prisma.task.findMany({
      where: { status: "ACTIVE", expiresAt: { not: null, lte: now } },
      select: { id: true },
      take: BATCH,
    });
    if (due.length === 0) {
      drained = true;
      break;
    }
    const { count } = await prisma.task.updateMany({
      where: { id: { in: due.map((t) => t.id) }, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    expired += count;
    if (due.length < BATCH) {
      drained = true;
      break;
    }
  }
  return { expired, drained };
}
