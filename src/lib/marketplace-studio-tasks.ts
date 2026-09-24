/**
 * Settles Magnific generations that were started but not waited for.
 *
 * A video clip takes minutes — far past a serverless function's ceiling — so
 * the studio starts the task, parks its id on a `PENDING_REVIEW` listing with
 * no deliverable yet, and returns. This sweep is what finishes the job: it asks
 * Magnific how each parked task is doing and, when one is ready, pulls the
 * bytes into our own S3 and completes the listing.
 *
 * Why polling rather than a webhook: it needs no public endpoint, no signing
 * secret, and nothing to configure at the provider. It rides the platform's own
 * traffic through `lib/scheduler`.
 *
 * THE DEADLINE IS THE WHOLE DESIGN. A finished task's download URL is signed
 * and expires roughly an hour after the task was created, and re-polling
 * returns the SAME expiring URL rather than minting a fresh one (verified: a
 * lapsed one answers 403). Miss the window and the asset is unrecoverable with
 * the credits already spent — so a task that passes its deadline is failed
 * loudly instead of being retried forever against a dead link.
 *
 * Running twice is harmless, which `lib/scheduler/jobs` requires: the listing
 * is only filled in when its `files[]` is still empty, and that condition is
 * part of the UPDATE rather than checked beforehand, so two overlapping ticks
 * cannot both write it.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getTask, type MagnificFeature } from "@/lib/magnific";
import { storeStockAsset } from "@/lib/marketplace-studio";
import { MAGNIFIC_FEATURES } from "@/lib/magnific";

/** Never let one sweep turn into a long chain of downloads. */
const DEFAULT_LIMIT = 6;

/**
 * Task details parked on a listing by the studio. Lives in the listing's
 * `details` JSON rather than a table of its own — the row IS the pending item,
 * and the admin sees it in the review queue from the moment it is queued.
 */
export type ParkedTask = {
  magnificTaskId: string;
  magnificFeature: string;
  /** ISO. Past this, the result URL is assumed dead. */
  magnificExpiresAt: string;
  magnificPrompt?: string;
};

export function readParkedTask(details: unknown): ParkedTask | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const id = d.magnificTaskId;
  const feature = d.magnificFeature;
  const expires = d.magnificExpiresAt;
  if (typeof id !== "string" || !id) return null;
  if (typeof feature !== "string" || !(feature in MAGNIFIC_FEATURES)) return null;
  if (typeof expires !== "string") return null;
  return {
    magnificTaskId: id,
    magnificFeature: feature,
    magnificExpiresAt: expires,
    magnificPrompt: typeof d.magnificPrompt === "string" ? d.magnificPrompt : undefined,
  };
}

export type SweepSummary = {
  examined: number;
  completed: number;
  stillRunning: number;
  failed: number;
  expired: number;
};

export function summariseSweep(s: SweepSummary): string {
  if (s.examined === 0) return "No generations waiting.";
  const bits = [`examined ${s.examined}`, `finished ${s.completed}`];
  if (s.stillRunning) bits.push(`still rendering ${s.stillRunning}`);
  if (s.failed) bits.push(`failed ${s.failed}`);
  if (s.expired) bits.push(`expired ${s.expired}`);
  return `${bits.join(", ")}.`;
}

/** Mark a listing as not going to happen, with a reason the admin can read. */
async function rejectListing(id: string, reason: string) {
  await prisma.marketplaceListing.updateMany({
    // `files: isEmpty` keeps this from touching a listing that a concurrent
    // tick has already completed.
    where: { id, files: { isEmpty: true } },
    data: { status: "REJECTED", rejectionReason: reason, reviewedAt: new Date() },
  });
}

export async function settleMagnificTasks(
  opts: { limit?: number } = {}
): Promise<SweepSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 25));
  const summary: SweepSummary = {
    examined: 0,
    completed: 0,
    stillRunning: 0,
    failed: 0,
    expired: 0,
  };

  // The `magnificTaskId` clause is doing real work, not just tidying: without
  // it this would page through PENDING_REVIEW listings generally, and a
  // marketplace with more than a page of sellers waiting on review would push
  // freshly queued clips past the end of the batch — they would never be
  // examined, and would sit there until their result link expired. Filtering in
  // SQL means the sweep only ever sees rows it owns.
  const candidates = await prisma.marketplaceListing.findMany({
    where: {
      status: "PENDING_REVIEW",
      files: { isEmpty: true },
      details: { path: ["magnificTaskId"], not: Prisma.DbNull },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, title: true, details: true, images: true },
  });

  for (const listing of candidates) {
    if (summary.examined >= limit) break;
    const parked = readParkedTask(listing.details);
    if (!parked) continue;
    summary.examined++;

    const feature = parked.magnificFeature as MagnificFeature;
    const state = await getTask(feature, parked.magnificTaskId);

    if (!state.success) {
      // A 404 means the task id is not known to Magnific any more — there is
      // nothing left to wait for, so stop re-asking every two minutes.
      if (state.status === 404) {
        summary.failed++;
        await rejectListing(listing.id, `Generation task ${parked.magnificTaskId} no longer exists.`);
      } else {
        summary.stillRunning++;
      }
      continue;
    }

    const expired = Date.now() > Date.parse(parked.magnificExpiresAt);

    if (state.data.status === "FAILED") {
      summary.failed++;
      await rejectListing(
        listing.id,
        state.data.error || "The generation failed at the provider."
      );
      continue;
    }

    if (state.data.status !== "COMPLETED") {
      if (expired) {
        summary.expired++;
        await rejectListing(
          listing.id,
          "The generation did not finish before its result link expired. The credits were spent — start it again."
        );
      } else {
        summary.stillRunning++;
      }
      continue;
    }

    const sourceUrl = state.data.generated[0];
    if (!sourceUrl) {
      summary.failed++;
      await rejectListing(listing.id, "The provider reported success but returned no file.");
      continue;
    }

    // Past the deadline the link is already dead; say so rather than letting
    // the fetch fail with a bare 403.
    if (expired) {
      summary.expired++;
      await rejectListing(
        listing.id,
        "The result link expired before it could be downloaded. The credits were spent — start it again."
      );
      continue;
    }

    const res = await fetch(sourceUrl, { cache: "no-store" });
    if (!res.ok) {
      // Transient errors are worth another tick; a 403 means the signature
      // lapsed and never will be.
      if (res.status === 403 || res.status === 404) {
        summary.expired++;
        await rejectListing(
          listing.id,
          `The result link is no longer downloadable (HTTP ${res.status}). The credits were spent — start it again.`
        );
      } else {
        summary.stillRunning++;
      }
      continue;
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const name = new URL(sourceUrl).pathname.split("/").pop() || `${parked.magnificTaskId}.mp4`;

    const stored = await storeStockAsset({
      bytes,
      filename: name,
      contentType,
      watermarkAs: listing.title,
      // Video and audio have no pixels jimp can watermark. The still the admin
      // animated is already sitting in `images[]` as the poster.
      previewable: contentType.startsWith("image/"),
    });
    if (!stored.success) {
      summary.stillRunning++;
      console.error(`[magnific-tasks] could not store ${listing.id}:`, stored.error);
      continue;
    }

    const nextDetails = { ...(listing.details as Record<string, unknown>) };
    // Clear the parked task so the row drops out of this sweep for good.
    delete nextDetails.magnificTaskId;
    delete nextDetails.magnificFeature;
    delete nextDetails.magnificExpiresAt;

    const written = await prisma.marketplaceListing.updateMany({
      where: { id: listing.id, files: { isEmpty: true } },
      data: {
        files: [stored.data.fileUrl],
        // Keep the poster when there is one; a watermarked still is better than
        // an empty card, and a video has no preview of its own.
        images: stored.data.previewUrl
          ? [stored.data.previewUrl]
          : listing.images,
        details: JSON.parse(JSON.stringify(nextDetails)),
      },
    });

    if (written.count === 0) {
      // Another tick won the race. Harmless: it stored the same asset.
      continue;
    }
    summary.completed++;
  }

  return summary;
}
