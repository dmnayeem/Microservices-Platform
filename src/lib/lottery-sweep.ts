import { prisma } from "@/lib/prisma";
import { drawLottery } from "@/lib/lottery";

/** Lotteries drawn per run, and the wall-clock budget for them. */
const BATCH = 10;
const BUDGET_MS = 45_000;

/**
 * Draw every ACTIVE lottery whose draw date has passed.
 *
 * The same sweep the Inngest `lottery-sweep` function does, bounded for a
 * serverless run: each draw is one transaction of up to 15s (Accelerate's
 * ceiling), so a handful per run under a time budget, oldest first; the rest
 * wait for the next run. Safe to repeat — `drawLottery` claims the draw with an
 * `ACTIVE` CAS under a row lock, and `requireDue` refuses anything not yet due.
 */
export async function drawDueLotteries(): Promise<{
  candidates: number;
  drawn: number;
  failed: number;
}> {
  const due = await prisma.lottery.findMany({
    where: { status: "ACTIVE", drawDate: { lte: new Date() } },
    select: { id: true },
    orderBy: { drawDate: "asc" },
    take: BATCH,
  });
  const deadline = Date.now() + BUDGET_MS;
  let drawn = 0;
  let failed = 0;
  for (const { id } of due) {
    if (Date.now() >= deadline) break;
    const r = await drawLottery(id, { requireDue: true });
    if (r.ok) drawn++;
    else if (r.reason === "failed" || r.reason === "no_prizes") failed++;
  }
  return { candidates: due.length, drawn, failed };
}
