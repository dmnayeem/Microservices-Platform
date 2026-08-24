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
 *
 * The same buffer now also carries per-placement SERVE outcomes (fill rate). Same
 * reasoning, more so: a serve request happens on every slot on every page, so
 * writing one row per request would be far heavier than the impression path it
 * sits beside — and a fill rate is a diagnostic, where losing a handful changes
 * nothing anyone would act on.
 */

/** Pending impression deltas, keyed by ad id. */
const buffer = new Map<string, number>();
/** Pending serve outcomes, keyed by placement id: [requests, fills]. */
const serveBuffer = new Map<string, [number, number]>();
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
  if (flushing || (buffer.size === 0 && serveBuffer.size === 0)) return;
  flushing = true;
  const batch = [...buffer.entries()];
  const serveBatch = [...serveBuffer.entries()];
  buffer.clear();
  serveBuffer.clear();
  oldestAt = 0;
  try {
    const date = todayUtc();
    // One transaction, one round-trip: N ad updates + N daily-stat upserts,
    // instead of 2 round-trips per impression.
    await prisma.$transaction([
      ...batch.flatMap(([adId, count]) => [
        prisma.ad.update({
          where: { id: adId },
          data: { impressions: { increment: count } },
        }),
        prisma.adDailyStat.upsert({
          where: { adId_date: { adId, date } },
          create: { adId, date, impressions: count, clicks: 0, spendUsd: 0 },
          update: { impressions: { increment: count } },
        }),
      ]),
      ...serveBatch.map(([placementId, [requests, fills]]) =>
        prisma.adServeDailyStat.upsert({
          where: { placementId_date: { placementId, date } },
          create: { placementId, date, requests, fills },
          update: {
            requests: { increment: requests },
            fills: { increment: fills },
          },
        })
      ),
    ]);
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
  maybeFlush();
}

/**
 * Record one serve ATTEMPT and whether it produced an ad.
 *
 * `requests - fills` is the no-fill count, and it is the only thing that tells a
 * space with no demand apart from a space that is never filled. Nothing recorded
 * this before: `serveAd` had eight paths that returned nothing and wrote nothing,
 * so an empty space and an unvisited space looked identical in every report.
 *
 * Called once per serve, at the boundary — never inside a branch — so the
 * denominator cannot drift away from the numerator.
 */
export function bufferServeOutcome(placementId: string, filled: boolean): void {
  const cur = serveBuffer.get(placementId) ?? [0, 0];
  cur[0] += 1;
  if (filled) cur[1] += 1;
  serveBuffer.set(placementId, cur);
  maybeFlush();
}

function maybeFlush(): void {
  if (oldestAt === 0) oldestAt = Date.now();
  const stale = Date.now() - oldestAt >= FLUSH_AFTER_MS;
  if (buffer.size + serveBuffer.size >= FLUSH_AT_SIZE || stale) {
    void flushAdCounters();
  }
}
