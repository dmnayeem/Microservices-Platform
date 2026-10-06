import "server-only";
import { prisma } from "@/lib/prisma";
import { syncUserLevelQuietly } from "@/lib/level-sync";
import {
  SubmissionStatus,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma/client";
import { fetchRawHtml, CRAWLER_UA, VERIFY_MAX_BYTES } from "@/lib/link-preview";
import {
  toPageContent,
  looksUnreadable,
  evaluateContentRules,
  parseContentRules,
} from "@/lib/link-verify";
import { normalizeSocialConfig } from "@/lib/social-tasks";
import { verifyCodeFor, contentHasCode } from "@/lib/task-verify-code";
import { getPointsPerUsd } from "@/lib/economy";
import { chargeTaskCompletion, claimTaskCompletionSlot, notifyTaskClosed } from "@/lib/task-credit";
import { getPlanMultipliers } from "@/lib/plan-multipliers";
import { getBuyerSettings } from "@/lib/buyer-settings";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { closeTaskIfFull } from "@/lib/task-slots";
import { processReferralCommissions } from "@/lib/referral-commissions";
import { recordUserAction } from "@/lib/goal-progress";
import { runAchievementCheck } from "@/lib/achievements";

/**
 * Look at a submission again, a little later.
 *
 * A social page is often not ready at the instant it is published — the pin,
 * post or tweet exists, but the server-rendered copy the fetcher sees has not
 * caught up, so the first check says "couldn't read this" and the submission
 * waits for a human. Nothing is wrong with the work; we simply asked too early.
 *
 * So anything that came out `unverifiable` gets asked again a minute or two on.
 * If the page now says what the admin required, the submission is approved and
 * paid exactly as if it had verified the first time.
 *
 * ── Two rules this must never break ──
 *
 * 1. **It only ever APPROVES.** A background job that rejects people is a very
 *    different thing from one that pays them: nobody is present to see it
 *    happen, so a false negative would land as an unexplained rejection. A
 *    submission that now genuinely fails its criteria is left PENDING for a
 *    human, whatever `onMismatch` says.
 *
 * 2. **It cannot pay twice.** It claims the row with the same CAS the admin
 *    review uses (`updateMany` while still PENDING), and writes the ledger under
 *    the same `task_<taskId>_<submissionId>` reference as both existing paths,
 *    so `Transaction @@unique([userId, reference])` is a second line of defence
 *    against this and the other two writers racing.
 */

export interface RecheckSummary {
  examined: number;
  approved: number;
  stillUnreadable: number;
  nowFailing: number;
  errors: number;
}

/** Read the per-item verify statuses a submission recorded when it was made. */
function verifyStatuses(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const items = (metadata as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => (i && typeof i === "object" ? (i as { verifyStatus?: string }).verifyStatus : undefined))
    .filter((s): s is string => typeof s === "string");
}

/** Ask as a link-preview crawler first, then as a browser. Same chain as submit. */
async function verifyFetch(url: string, userId: string): Promise<string | null> {
  // `userId`: the per-user outbound limit counts distinct URLs, so re-reading a
  // page the user already submitted costs them nothing extra.
  const asCrawler = await fetchRawHtml(url, CRAWLER_UA, VERIFY_MAX_BYTES, { userId }).catch(() => null);
  if (asCrawler && !looksUnreadable(toPageContent(asCrawler))) return asCrawler;
  const asBrowser = await fetchRawHtml(url, undefined, VERIFY_MAX_BYTES, { userId }).catch(() => null);
  if (asBrowser && !looksUnreadable(toPageContent(asBrowser))) return asBrowser;
  return asCrawler ?? asBrowser;
}

/**
 * Re-check submissions that could not be read the first time.
 *
 * @param minAgeSec  leave a submission alone until it has had a moment to
 *                   settle — re-asking immediately would just fail again.
 * @param maxAgeHours stop retrying eventually; past this a human should look.
 */
export async function recheckPendingSocialSubmissions(opts?: {
  limit?: number;
  minAgeSec?: number;
  maxAgeHours?: number;
  /**
   * Check ONE submission instead of sweeping.
   *
   * This is what makes the feature work with no scheduler at all: the page the
   * user is already looking at after submitting asks about its own submission
   * every few seconds, and the moment the page becomes readable they watch it
   * turn green. `ownerUserId` must be passed with it — a user may only ever ask
   * about their own row.
   */
  submissionId?: string;
  ownerUserId?: string;
}): Promise<RecheckSummary> {
  const limit = opts?.limit ?? 25;
  // A single targeted check is the user waiting on their own submission, so it
  // must not be held back by the batch's "let it settle" delay.
  const minAgeSec = opts?.minAgeSec ?? (opts?.submissionId ? 0 : 60);
  const maxAgeHours = opts?.maxAgeHours ?? 24;

  const now = Date.now();
  const summary: RecheckSummary = {
    examined: 0,
    approved: 0,
    stillUnreadable: 0,
    nowFailing: 0,
    errors: 0,
  };

  // Accelerate collapses a wide `select` back to the base model type the moment
  // a nested relation joins it, so the row shape is restated and cast.
  type Candidate = {
    id: string;
    userId: string;
    taskId: string;
    metadata: unknown;
    task: {
      id: string;
      title: string;
      type: string;
      socialConfig: unknown;
      pointsReward: number;
      xpReward: number;
      /** Set when a USER paid for this task out of their own wallet. */
      fundedByUserId: string | null;
      remainingBudget: number;
    };
  };

  const candidatesRaw = await prisma.taskSubmission.findMany({
    where: {
      status: SubmissionStatus.PENDING,
      submittedAt: {
        not: null,
        lte: new Date(now - minAgeSec * 1000),
        gte: new Date(now - maxAgeHours * 3600 * 1000),
      },
      // Board tasks are scored by the board, never paid in points; this
      // re-check approved and credited them like ordinary tasks.
      task: { type: "SOCIAL", boardId: null },
      ...(opts?.submissionId ? { id: opts.submissionId } : {}),
      // Ownership is part of the QUERY, not a check afterwards — there is then
      // no path where a mistaken id reaches somebody else's submission.
      ...(opts?.ownerUserId ? { userId: opts.ownerUserId } : {}),
    },
    orderBy: { submittedAt: "asc" },
    take: limit * 4, // over-fetch: most will have no CONTENT rules to re-check
    select: {
      id: true,
      userId: true,
      taskId: true,
      metadata: true,
      task: {
        select: {
          id: true,
          title: true,
          type: true,
          socialConfig: true,
          pointsReward: true,
          xpReward: true,
          fundedByUserId: true,
          remainingBudget: true,
        },
      },
    },
  });

  const candidates = candidatesRaw as unknown as Candidate[];
  const pointsPerUsd = await getPointsPerUsd();
  // Read once for the whole batch: the commission is the same for every
  // submission in this run, and re-reading it per row is a settings lookup
  // inside a loop that can process hundreds.
  const { feePercent } = await getBuyerSettings();

  for (const sub of candidates) {
    if (summary.examined >= limit) break;

    const cfg = normalizeSocialConfig(sub.task.socialConfig);
    const verifyItems = cfg.items
      .map((it, i) => ({ it, i }))
      .filter((x) => x.it.verify === "CONTENT" || x.it.verify === "CODE");
    if (verifyItems.length === 0) continue;
    // Revisit what we failed to READ, and what was never read at all.
    //
    // A submission that was genuinely checked and did not match is a decision,
    // not an accident, so `criteria_failed` is left alone. But a submission
    // carrying NO verify status is one the check never reached — it predates
    // the feature, or the fetch died before recording anything — and skipping
    // those left them waiting for a human forever, which is the one outcome
    // this job exists to prevent.
    const statuses = verifyStatuses(sub.metadata);
    const neverChecked = statuses.length === 0;
    if (!neverChecked && !statuses.includes("unverifiable")) continue;

    summary.examined++;

    try {
      const meta = (sub.metadata ?? {}) as Record<string, unknown>;
      const items = Array.isArray(meta.items)
        ? ([...(meta.items as unknown[])] as Record<string, unknown>[])
        : [];

      const urls = [
        ...new Set(
          verifyItems
            .map((x) => (items[x.i]?.proofUrl as string | undefined) ?? "")
            .filter(Boolean)
        ),
      ];
      const pages = new Map<string, string | null>();
      await Promise.all(
        urls.map(async (u) => pages.set(u, await verifyFetch(u, sub.userId).catch(() => null)))
      );

      let allVerified = true;
      let anyStillUnreadable = false;
      for (const { it, i } of verifyItems) {
        const url = (items[i]?.proofUrl as string | undefined) ?? "";
        const html = url ? pages.get(url) : null;
        let status: string = "unverifiable";

        if (!html) {
          status = "unverifiable";
        } else if (it.verify === "CODE") {
          status = contentHasCode(html, verifyCodeFor(sub.taskId, i, sub.userId))
            ? "verified"
            : "code_missing";
        } else {
          const page = toPageContent(html);
          const res = evaluateContentRules(page, parseContentRules(it.contentRules), {
            submittedUsername: (items[i]?.username as string | undefined) ?? undefined,
            expectedCode: verifyCodeFor(sub.taskId, i, sub.userId),
            codeMatcher: contentHasCode,
          });
          status = res.verdict === "verified" ? "verified" : res.verdict;
          if (items[i]) items[i].verifyDetails = res.results;
        }

        if (items[i]) items[i].verifyStatus = status;
        if (status !== "verified") allVerified = false;
        if (status === "unverifiable") anyStillUnreadable = true;
      }

      const passed = allVerified && verifyItems.length === cfg.items.length;

      // Always record what this attempt saw, so the admin reviewing it by hand
      // is looking at the latest evidence rather than the first failed read.
      meta.items = items;
      meta.recheckedAt = new Date().toISOString();
      meta.recheckCount = ((meta.recheckCount as number) ?? 0) + 1;

      if (!passed) {
        await prisma.taskSubmission.update({
          where: { id: sub.id },
          data: { metadata: meta as never },
        });
        if (anyStillUnreadable) summary.stillUnreadable++;
        else summary.nowFailing++;
        continue;
      }

      // ── Approve and pay ──
      // Same CAS and the same ledger reference as the other two writers, so a
      // race with a manual approval or a resubmit cannot pay twice.
      // Claim, buyer charge and worker credit commit TOGETHER. They used to be
      // three separate writes: an error after the charge (any DB blip) left the
      // buyer charged, the submission AUTO_APPROVED — so never re-checked — and
      // the worker never paid. The outer catch just counted it as an error.
      // Plan multipliers from the worker's EFFECTIVE plan — the same rule as
      // the submit, admin-review and quiz paths (this path paid the bare
      // reward, so which path approved a submission decided what it paid).
      // The buyer is charged the multiplied reward, as on the main path.
      const planMult = await getPlanMultipliers(sub.userId);
      const points = Math.round(sub.task.pointsReward * planMult.taskReward);
      const xp = Math.round(sub.task.xpReward * planMult.xp);
      let closedTask: { buyerId: string; taskTitle: string; reason: "NO_CREDIT" | "DELIVERED" } | null = null;
      let outcome: "lost" | "unfunded" | "full" | "paid";
      try {
        outcome = await prisma.$transaction(async (tx) => {
          const claimed = await tx.taskSubmission.updateMany({
            where: { id: sub.id, status: SubmissionStatus.PENDING },
            data: {
              status: SubmissionStatus.AUTO_APPROVED,
              reviewedAt: new Date(),
              metadata: meta as never,
            },
          });
          if (claimed.count === 0) return "lost" as const; // somebody else got there first

          // The task's global completion cap, claimed conditionally (it was
          // only checked at start). Full → hand the submission back to a human.
          if (!(await claimTaskCompletionSlot(tx, sub.taskId))) {
            await tx.taskSubmission.update({
              where: { id: sub.id },
              data: { status: SubmissionStatus.PENDING, reviewedAt: null },
            });
            return "full" as const;
          }

          // A user-funded task is paid for by its BUYER, so charge the buyer
          // first — exactly as the submit and admin-review paths do, through
          // the same `chargeTaskCompletion` (its CAS on remainingBudget is what
          // makes this safe against the other two writers).
          if (sub.task.fundedByUserId) {
            const charge = await chargeTaskCompletion(tx, {
              taskId: sub.taskId,
              buyerId: sub.task.fundedByUserId,
              rewardPoints: points,
              standardReward: sub.task.pointsReward,
              feePercent,
              remainingBudget: sub.task.remainingBudget,
            });
            if (charge.closeTask) {
              await tx.task.update({
                where: { id: sub.taskId },
                data: { status: "COMPLETED" },
              });
              closedTask = {
                buyerId: sub.task.fundedByUserId,
                taskTitle: sub.task.title,
                reason: charge.closeReason ?? "DELIVERED",
              };
            }
            if (!charge.paid) {
              // The buyer cannot pay. Leave the submission for a human rather
              // than paying money that does not exist: hand it back to PENDING.
              // (The slot claimed above is given back with it.)
              await tx.task.updateMany({
                where: { id: sub.taskId, completedCount: { gt: 0 } },
                data: { completedCount: { decrement: 1 } },
              });
              await tx.taskSubmission.update({
                where: { id: sub.id },
                data: { status: SubmissionStatus.PENDING, reviewedAt: null },
              });
              return "unfunded" as const;
            }
          }

          await tx.user.update({
            where: { id: sub.userId },
            data: {
              pointsBalance: { increment: points },
              xp: { increment: xp },
              totalEarnings: { increment: points / pointsPerUsd },
            },
          });
          await tx.transaction.create({
            data: {
              userId: sub.userId,
              type: TransactionType.EARNING,
              status: TransactionStatus.COMPLETED,
              points,
              amount: points / pointsPerUsd,
              description: `Completed task: ${sub.task.title}`,
              reference: `task_${sub.taskId}_${sub.id}`,
              metadata: {
                taskId: sub.taskId,
                taskType: sub.task.type,
                submissionId: sub.id,
                viaRecheck: true,
                multiplier: planMult.taskReward,
                xpMultiplier: planMult.xp,
              },
            },
          });
          return "paid" as const;
        }, { timeout: 15_000, maxWait: 10_000 });
      } catch (e) {
        // Already paid under this reference by another path. The whole
        // transaction (claim + charge) rolled back with it, so the buyer is not
        // charged a second time; the submission stays as it was.
        if (!isDuplicateLedgerError(e)) throw e;
        continue;
      }
      if (closedTask) void notifyTaskClosed(closedTask);
      if (outcome === "lost") continue;
      if (outcome === "full") {
        await closeTaskIfFull(sub.taskId).catch(() => {});
        summary.nowFailing++;
        continue;
      }
      if (outcome === "unfunded") {
        summary.nowFailing++;
        continue;
      }

      await closeTaskIfFull(sub.taskId).catch(() => {});

      // An eighth XP-awarding path, and one my own grep missed — the suite
      // found it. Same placement as everywhere else: after the transaction,
      // quietly, because the reward has already landed.
      await syncUserLevelQuietly(sub.userId);

      // The follow-ups every other approval path runs: the upline's commission,
      // event/mission progress and achievements. Missing here, a submission this
      // job approved paid the worker and nobody else, and never counted toward
      // a "complete N tasks" goal. Each is idempotent on the submission id, so
      // a race with another path pays and counts once.
      await processReferralCommissions(sub.userId, points, sub.taskId, sub.id);
      await recordUserAction({
        userId: sub.userId,
        action: "task_approved",
        targetId: sub.id,
      });
      await runAchievementCheck(sub.userId);

      await prisma.notification
        .create({
          data: {
            userId: sub.userId,
            type: "SYSTEM",
            title: "Task approved ✅",
            message: `Your submission for "${sub.task.title}" was verified and approved. ${points} points added.`,
            data: { link: "/tasks", submissionId: sub.id, taskId: sub.taskId },
          },
        })
        .catch(() => {});

      summary.approved++;
    } catch {
      summary.errors++;
    }
  }

  return summary;
}
