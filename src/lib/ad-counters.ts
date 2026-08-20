import "server-only";
import { prisma } from "@/lib/prisma";
import { todayUtc } from "@/lib/ad-stats";

/**
 * Buffered ad impression counters.
 *
 * Every served ad used to issue `UPDATE "Ad" SET impressions = impressions + 1`
 * plus an `AdDailyStat` upsert, synchronously, per request. Those land on a
 * handful of rows — the ads currently in rotation — so at any real traffic level
 * every request in the system queues behind the same row lock. That is a lock
 * convoy: throughput on the hot row is capped at 1 / (lock hold time), and the
 * lock is held across a network round-trip through Accelerate. It shows up as
 * the whole site hanging, not as "analytics is slow".
 *
 * Instead we accumulate counts in memory and flush them as one batched write.
 * The flush is piggybacked on traffic rather than a timer, because a serverless
 * instance is frozen between invocations and `setInterval` cannot be relied on.
 *
 * Trade-off, stated plainly: if an instance is recycled with a non-empty buffer,
 * those impressions are lost — at most `FLUSH_AFTER_MS` worth, for that instance.
 * That is acceptable here because impressions are an analytics figure. **Clicks
 * and campaign budget are NOT buffered** — they are money, and they keep their
 * synchronous compare-and-swap in `ad-events.ts`.
 */

/** Pending impression deltas, keyed by ad id. */
const buffer = new Map<string, number>();
let oldestAt = 0;
let flushing = false;

/** Flush when the buffer holds this many distinct ads… */
const FLUSH_AT_SIZE = 50;
/** …or when the oldest pending count is this old. */
const FLUSH_AFTER_MS = 10_000;

/**
 * Write the buffered counts out. Safe to call concurrently — the buffer is
 * swapped out first, so a second caller sees an empty map rather than
 * double-counting. Never throws: analytics must not break ad serving.
 */
export async function flushAdCounters(): Promise<void> {
  if (flushing || buffer.size === 0) return;
  flushing = true;
  const batch = [...buffer.entries()];
  buffer.clear();
  oldestAt = 0;
  try {
    const date = todayUtc();
    // One transaction, one round-trip: N ad updates + N daily-stat upserts,
    // instead of 2 round-trips per impression.
    await prisma.$transaction(
      batch.flatMap(([adId, count]) => [
        prisma.ad.update({
          where: { id: adId },
          data: { impressions: { increment: count } },
        }),
        prisma.adDailyStat.upsert({
          where: { adId_date: { adId, date } },
          create: { adId, date, impressions: count, clicks: 0, spendUsd: 0 },
          update: { impressions: { increment: count } },
        }),
      ])
    );
  } catch {
    // An ad deleted mid-flush aborts the transaction. Dropping the batch is the
    // right call — retrying risks double-counting, and these are impressions.
  } finally {
    flushing = false;
  }
}

/**
 * Record one impression. Returns immediately; the write happens on a later call
 * once the buffer is full or stale.
 */
export function bufferImpression(adId: string): void {
  buffer.set(adId, (buffer.get(adId) ?? 0) + 1);
  if (oldestAt === 0) oldestAt = Date.now();

  const stale = Date.now() - oldestAt >= FLUSH_AFTER_MS;
  if (buffer.size >= FLUSH_AT_SIZE || stale) {
    void flushAdCounters();
  }
}
