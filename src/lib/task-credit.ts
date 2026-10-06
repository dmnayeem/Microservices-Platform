import "server-only";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import type { LedgerDb } from "@/lib/ledger";

/**
 * Task credit — points bought to fund tasks, kept strictly apart from points
 * earned.
 *
 * The separation is the whole point of this module, so it is worth stating why
 * rather than leaving it to be rediscovered:
 *
 * `User.pointsBalance` is what a worker EARNS. It mirrors into `totalEarnings`,
 * it converts to cash (`points-convert.ts`), and cash can be withdrawn. If task
 * budgets came out of that same column, then buying points would be buying
 * withdrawable balance — money in, money straight back out, with a completed
 * "task" as the paperwork. That is a laundering path and a chargeback one at
 * the same time.
 *
 * So `taskCreditPoints` has exactly one way in and one way out:
 *   IN  — `purchaseTaskCredit`, paid for with wallet cash.
 *   OUT — `chargeTaskCompletion`, one approved completion at a time.
 *
 * Credit is charged **as it is used**, not reserved when the task is created.
 * A task advertised to 100 people whose first 10 complete costs the buyer 10
 * rewards; the other 90 never leave their balance. That is the owner's model
 * and it is the better one: reserving up front strands money in tasks that
 * expire half-finished, which then needs a refund path for every way a task
 * can end (expired, paused, archived, closed early) — and the one that gets
 * forgotten silently keeps the buyer's points.
 *
 * Nothing that credits earnings may write it, it is never converted to cash,
 * and it is never withdrawn. `scripts/verify-task-credit.ts` asserts all of
 * that from both directions, because the invariant is only worth as much as
 * what stops the next edit breaking it.
 */

/** Ledger reference prefixes, so the finance console can tell these apart. */
export const TASK_CREDIT_PURCHASE_REF = "taskcredit_buy_";
/**
 * One row per completion, recording the credit that paid for it.
 *
 * There is deliberately no refund function here. Credit is charged per
 * completion, an approved submission cannot be un-approved (see the admin
 * review route), and a rejected task was never charged — so nothing in the
 * system needs to hand credit back. A money function nobody calls is a trap:
 * the next person wires it up assuming it has been exercised.
 */
export const TASK_SPEND_REF = "taskspend_";

export type PurchaseResult =
  | { ok: true; points: number; costUsd: number; newBalance: number }
  | { ok: false; reason: "INSUFFICIENT_CASH" | "TOO_SMALL" | "TOO_LARGE"; shortByUsd?: number };

/**
 * Buy task credit with wallet cash.
 *
 * Atomic and no-overdraft: the cash debit is a CAS (`cashBalance >= cost`), so
 * two concurrent purchases cannot both pass on the same balance. The credit and
 * the ledger row are written in the same transaction, so a crash cannot leave
 * the user charged with nothing to show for it.
 */
export async function purchaseTaskCredit(
  userId: string,
  points: number,
  opts: { minPoints: number; maxPoints: number }
): Promise<PurchaseResult> {
  const amount = Math.floor(points);
  if (!Number.isFinite(amount) || amount < opts.minPoints) {
    return { ok: false, reason: "TOO_SMALL" };
  }
  if (amount > opts.maxPoints) return { ok: false, reason: "TOO_LARGE" };

  const rate = await getPointsPerUsd();
  const costUsd = amount / rate;

  try {
    return await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: userId, cashBalance: { gte: costUsd } },
        data: {
          cashBalance: { decrement: costUsd },
          taskCreditPoints: { increment: amount },
        },
      });
      if (debited.count === 0) throw new Error("INSUFFICIENT_CASH");

      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -costUsd,
          // `points` records what was bought. It is NOT an earning: the row is
          // a PURCHASE, and nothing reads it as income.
          points: amount,
          description: `Task credit — ${amount.toLocaleString()} points`,
          reference: `${TASK_CREDIT_PURCHASE_REF}${userId}_${Date.now()}`,
          metadata: { kind: "task_credit_purchase", points: amount, rate },
        },
      });

      const after = await tx.user.findUnique({
        where: { id: userId },
        select: { taskCreditPoints: true },
      });
      return {
        ok: true as const,
        points: amount,
        costUsd,
        newBalance: after?.taskCreditPoints ?? 0,
      };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_CASH") {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { cashBalance: true },
      });
      const have = Number(me?.cashBalance ?? 0);
      return {
        ok: false,
        reason: "INSUFFICIENT_CASH",
        shortByUsd: Math.max(0, costUsd - have),
      };
    }
    throw e;
  }
}

/**
 * Spend task credit — a CAS decrement, so two requests firing at once cannot
 * both pass on the same balance.
 *
 * Takes a transaction client because the caller writes the thing it paid for in
 * the same transaction: the spend and its consequence must commit together or
 * not at all. Returns false when the balance could not cover it.
 */
export async function spendTaskCredit(
  db: LedgerDb,
  userId: string,
  points: number
): Promise<boolean> {
  const amount = Math.floor(points);
  if (amount <= 0) return true;
  const spent = await db.user.updateMany({
    where: { id: userId, taskCreditPoints: { gte: amount } },
    data: { taskCreditPoints: { decrement: amount } },
  });
  return spent.count > 0;
}

export interface CompletionCharge {
  /** False → the buyer could not pay; the worker must NOT be credited. */
  paid: boolean;
  /** Reward charged to the buyer, in credit. */
  rewardPoints: number;
  /** Platform commission charged on top, in credit. */
  feePoints: number;
  /**
   * True when the task should stop being advertised: either the buyer can no
   * longer cover one more reward, or the task has delivered everything it
   * promised.
   */
  closeTask: boolean;
  /**
   * WHY it should close. The buyer needs to be told the difference: a task
   * that finished is good news, a task that ran out of credit is something
   * they have to act on. Telling them "your task ended" for both means the
   * ones that stalled sit dead and they never find out why.
   */
  closeReason?: "NO_CREDIT" | "DELIVERED";
  /**
   * Set when `paid` is false, for the message shown to the worker:
   * NO_CREDIT = the buyer's balance could not cover it; DELIVERED = the task's
   * funded completions were already all used up.
   */
  reason?: "NO_CREDIT" | "DELIVERED";
}

/** What to tell the worker when chargeTaskCompletion did not pay. */
export function unpaidCompletionMessage(reason: CompletionCharge["reason"]): string {
  return reason === "DELIVERED"
    ? "This task already reached the number of completions its advertiser paid for — no reward was paid."
    : "The advertiser ran out of credit for this task — no reward was paid.";
}

/**
 * Claim ONE completion slot on a task, inside the approval transaction.
 *
 * `totalLimit` used to be checked only at START, then `completedCount` was
 * incremented unconditionally at approval — so every approval of an attempt
 * started before the cap filled paid past it. The increment is now conditional
 * (`completedCount < totalLimit`); false = the task is full and this
 * completion must not be paid. Shared by every approval path (admin review,
 * auto-approve on submit, the social re-check, the quiz route).
 */
export async function claimTaskCompletionSlot(
  db: LedgerDb,
  taskId: string
): Promise<boolean> {
  const t = await db.task.findUnique({
    where: { id: taskId },
    select: { totalLimit: true },
  });
  if (t?.totalLimit && t.totalLimit > 0) {
    const r = await db.task.updateMany({
      where: { id: taskId, completedCount: { lt: t.totalLimit } },
      data: { completedCount: { increment: 1 } },
    });
    return r.count > 0;
  }
  await db.task.updateMany({
    where: { id: taskId },
    data: { completedCount: { increment: 1 } },
  });
  return true;
}

/** Thrown inside an approval transaction to roll it back without paying. */
export class CompletionRefused extends Error {
  constructor(public reason: "TASK_FULL" | "NO_CREDIT" | "DELIVERED") {
    super(reason);
    this.name = "CompletionRefused";
  }
}

/**
 * Charge a buyer for ONE approved completion, and say whether the task should
 * now close.
 *
 * This is the single place a buyer's credit is spent on work, so every payout
 * path — admin approval, auto-approve on submit, and the background re-check —
 * charges identically. Three copies of this arithmetic is how one of them ends
 * up crediting a worker the platform was never paid for.
 *
 * Order matters and is deliberate: **the buyer is charged BEFORE the worker is
 * credited**. If the charge fails there is no payout, so points are never
 * minted from a balance that could not cover them.
 *
 * `closeTask` is answered on the state AFTER this charge, and it asks whether
 * ONE MORE reward could be paid — not whether the balance is empty. A task that
 * stays advertised with too little credit behind it invites work that cannot be
 * paid for, and the person who did that work is the one who loses.
 */
export async function chargeTaskCompletion(
  db: LedgerDb,
  args: {
    taskId: string;
    buyerId: string;
    /** What this worker earns. May differ from the task's headline reward. */
    rewardPoints: number;
    /** The task's standard reward — what "one more" costs. */
    standardReward: number;
    /** Platform commission, percent. */
    feePercent: number;
    /** Promise left on the task, before this completion. */
    remainingBudget: number;
  }
): Promise<CompletionCharge> {
  const rewardPoints = Math.max(0, Math.floor(args.rewardPoints));
  // Rounded UP, for the same reason the creation quote rounds up: a fee that
  // rounds to zero on small rewards is a fee a buyer can avoid entirely by
  // running many tiny tasks instead of one large one.
  const feePoints =
    args.feePercent > 0
      ? Math.ceil((rewardPoints * args.feePercent) / 100)
      : 0;
  const total = rewardPoints + feePoints;

  // Draw the PROMISE first. `remainingBudget` is how many completions the buyer
  // agreed to fund; once it is spent, a further approval is over-delivery the
  // buyer never asked for. It used to clamp to 0 and pay anyway, so every
  // concurrent or late approval past the end was charged to the buyer.
  //
  // The guarded decrement lets only one of two concurrent approvals win the
  // subtraction. The last completion may legitimately cost more than what is
  // left (a plan multiplier raises a worker's reward above the standard one),
  // so a shortfall is still allowed as long as at least one STANDARD reward
  // remained — that clamps to 0. Less than that left = the task is delivered.
  const drawn = await db.task.updateMany({
    where: { id: args.taskId, remainingBudget: { gte: rewardPoints } },
    data: { remainingBudget: { decrement: rewardPoints } },
  });
  let drewPoints = rewardPoints;
  if (drawn.count === 0) {
    const lastSlot = Math.max(1, Math.min(rewardPoints, Math.floor(args.standardReward)));
    const before = await db.task.findUnique({
      where: { id: args.taskId },
      select: { remainingBudget: true },
    });
    const left = before?.remainingBudget ?? 0;
    const clamped =
      left >= lastSlot
        ? await db.task.updateMany({
            where: { id: args.taskId, remainingBudget: left },
            data: { remainingBudget: 0 },
          })
        : { count: 0 };
    if (clamped.count === 0) {
      return {
        paid: false,
        rewardPoints,
        feePoints,
        closeTask: true,
        closeReason: "DELIVERED",
        reason: "DELIVERED",
      };
    }
    drewPoints = left;
  }

  const paid = await spendTaskCredit(db, args.buyerId, total);
  if (!paid) {
    // Give the promise back — nothing was delivered on it. (Inside the
    // caller's transaction this is a no-op either way; outside one it keeps
    // the counter honest.)
    if (drewPoints > 0) {
      await db.task.updateMany({
        where: { id: args.taskId },
        data: { remainingBudget: { increment: drewPoints } },
      });
    }
    // Out of credit. Close the task so nobody else works for nothing.
    return {
      paid: false,
      rewardPoints,
      feePoints,
      closeTask: true,
      closeReason: "NO_CREDIT",
      reason: "NO_CREDIT",
    };
  }

  // `remainingBudget` (drawn above) is how many completions this task still
  // advertises — it tells a buyer "40 of 100 left". It is not a reserved pool:
  // nothing is held. Always an atomic decrement, never a `set` computed from
  // the snapshot the CALLER read (two approvals landing together used to both
  // compute `snapshot - reward` and the second overwrote the first).

  // The buyer's record of where their credit went.
  //
  // Without this the balance simply drops — and with the fee at 0%, which is
  // the default, NOTHING was written at all: a buyer watching their credit go
  // 20,000 → 19,450 had no way to see which task took it. Money that moves
  // without a row is money nobody can reconcile, and the platform writes a row
  // for every earning already; a spend deserves the same.
  await db.transaction.create({
    data: {
      userId: args.buyerId,
      type: TransactionType.PURCHASE,
      status: TransactionStatus.COMPLETED,
      // No USD moved — the credit was bought earlier, this is it being used.
      amount: 0,
      points: -rewardPoints,
      description: `Task reward paid — 1 completion`,
      reference: `${TASK_SPEND_REF}${args.taskId}_${Date.now()}`,
      metadata: {
        kind: "task_completion",
        taskId: args.taskId,
        rewardPoints,
        feePoints,
      },
    },
  });

  if (feePoints > 0) {
    await db.transaction.create({
      data: {
        userId: args.buyerId,
        type: TransactionType.ADMIN_FEE,
        status: TransactionStatus.COMPLETED,
        // Revenue: those points were bought with real cash, and the platform
        // now owns them. The USD figure is what makes it show up as income.
        amount: 0,
        points: -feePoints,
        description: `Platform fee — 1 completion`,
        reference: `task_fee_${args.taskId}_${Date.now()}`,
        metadata: {
          kind: "task_fee",
          taskId: args.taskId,
          feePercent: args.feePercent,
          feePoints,
        },
      },
    });
  }

  // Can the buyer still cover one more? Read the balance back rather than
  // assuming — another task of theirs may have drawn on it in between. Same for
  // the promise: the decrement above is atomic, so the authoritative
  // `remainingBudget` is the one the database now holds, not an arithmetic
  // guess off the caller's snapshot.
  // Sequential, not `Promise.all`: `db` may be an interactive-transaction
  // client, and those must not have two queries in flight at once.
  const after = await db.user.findUnique({
    where: { id: args.buyerId },
    select: { taskCreditPoints: true },
  });
  const taskAfter = await db.task.findUnique({
    where: { id: args.taskId },
    select: { remainingBudget: true },
  });
  const promiseLeft = taskAfter?.remainingBudget ?? 0;
  const oneMore =
    args.standardReward +
    (args.feePercent > 0
      ? Math.ceil((args.standardReward * args.feePercent) / 100)
      : 0);

  const outOfCredit = (after?.taskCreditPoints ?? 0) < oneMore;
  const promiseDone = promiseLeft < args.standardReward;

  return {
    paid: true,
    rewardPoints,
    feePoints,
    closeTask: outOfCredit || promiseDone,
    // Out of credit takes precedence: if both are true the buyer still needs
    // to know their balance is the binding constraint on the next task.
    closeReason: outOfCredit
      ? "NO_CREDIT"
      : promiseDone
        ? "DELIVERED"
        : undefined,
  };
}

/**
 * Tell a buyer their task has stopped, and why.
 *
 * Fire-and-forget, and deliberately OUTSIDE any transaction: a notification is
 * not worth failing a payout for, and sending one for a transaction that then
 * rolled back would be worse than sending none.
 *
 * Without this a task that ran out of credit simply stopped appearing. The
 * buyer's own hub still listed it, nothing said why, and the natural
 * assumption — "it is still running, nobody is doing it" — is the opposite of
 * the truth.
 */
export async function notifyTaskClosed(args: {
  buyerId: string;
  taskTitle: string;
  reason: "NO_CREDIT" | "DELIVERED";
}): Promise<void> {
  const { notifyUser } = await import("@/lib/notify");
  const { NotificationType } = await import("@/generated/prisma/client");

  const outOfCredit = args.reason === "NO_CREDIT";
  await notifyUser({
    userId: args.buyerId,
    type: NotificationType.SYSTEM,
    title: outOfCredit ? "Task stopped — out of credit" : "Task finished ✅",
    message: outOfCredit
      ? `"${args.taskTitle}" stopped because your credit can no longer cover another completion. Top up and publish it again to keep going.`
      : `"${args.taskTitle}" has been completed by everyone it was advertised to.`,
    link: outOfCredit ? "/buy-points" : "/buyer",
  }).catch(() => {});
}

/** Current task-credit balance. */
export async function getTaskCredit(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { taskCreditPoints: true },
  });
  return u?.taskCreditPoints ?? 0;
}
