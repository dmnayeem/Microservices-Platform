import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { generateRandomArticleKey } from "@/lib/article-tasks";

/**
 * Article task key pool — minted on demand.
 *
 * The admin says how many keys a task may hand out (`target`, e.g. 2,000,000)
 * but only `buffer` unused keys are ever stored. Each claim takes the next
 * fresh key through a partial index (`ArticleTaskKey_fresh_idx`), and the pool
 * is topped back up in the background. So storage is "used keys + buffer",
 * not "everything the admin asked for", and a claim costs the same at any
 * pool size. (It used to be `ORDER BY random()` over every unused key: fine at
 * 1,000, a full scan per click at 1,000,000.)
 *
 * Purging deletes keys a finished task no longer needs. A deleted key can
 * never be used again: submit looks the key up in this task's pool and refuses
 * one that is not there, and the submission keeps its own copy of the key
 * (`metadata.articleSubmittedUniqueKey`) so review and history are unaffected.
 * `minted` survives a purge, so purging never lets a pool mint past its target.
 */

/** Keys created per top-up round (one short transaction each). */
const MINT_CHUNK = 5_000;
/** Rows deleted per purge statement. */
const PURGE_CHUNK = 5_000;

export const KEY_POOL_LIMITS = {
  maxTarget: 20_000_000,
  maxGeneratePerAction: 5_000_000,
  minBuffer: 100,
  maxBuffer: 50_000,
  defaultBuffer: 2_000,
  maxAutoPurgeDays: 365,
} as const;

/** Task states after which a pool's keys are no longer needed. */
export const ENDED_TASK_STATUSES = ["COMPLETED", "EXPIRED", "ARCHIVED", "REMOVED", "REJECTED"] as const;

/** A key nobody has been given yet — the only kind a claim may hand out. */
export const FRESH_KEY_WHERE = { claimedByUserId: null, issuedAt: null, submissionId: null } as const;

/**
 * The subquery both claim paths use to pick one fresh key. Ordered by id so
 * Postgres walks the partial index; the key values are random themselves, so
 * nothing is lost by not shuffling. SKIP LOCKED lets concurrent claims each
 * take a different row instead of queueing on the same one.
 */
export function pickFreshKeySql(taskId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT id FROM "ArticleTaskKey"
    WHERE "taskId" = ${taskId}
      AND "claimedByUserId" IS NULL
      AND "issuedAt" IS NULL
      AND "submissionId" IS NULL
    ORDER BY "id"
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
}

export type KeyPoolStats = {
  /** Rows stored right now. */
  stored: number;
  /** Fresh keys ready to hand out. */
  unused: number;
  /** Given to an anonymous visitor (search/referral entry), not yet submitted. */
  issued: number;
  /** Claimed by a signed-in user, not yet submitted. */
  claimed: number;
  submitted: number;
};

export async function keyPoolStats(taskId: string): Promise<KeyPoolStats> {
  const rows = await prisma.$queryRaw<
    Array<{ stored: number; unused: number; issued: number; claimed: number; submitted: number }>
  >(Prisma.sql`
    SELECT
      count(*)::int AS stored,
      count(*) FILTER (WHERE "claimedByUserId" IS NULL AND "issuedAt" IS NULL AND "submissionId" IS NULL)::int AS unused,
      count(*) FILTER (WHERE "claimedByUserId" IS NULL AND "issuedAt" IS NOT NULL AND "submissionId" IS NULL)::int AS issued,
      count(*) FILTER (WHERE "claimedByUserId" IS NOT NULL AND "submissionId" IS NULL)::int AS claimed,
      count(*) FILTER (WHERE "submissionId" IS NOT NULL)::int AS submitted
    FROM "ArticleTaskKey"
    WHERE "taskId" = ${taskId}
  `);
  return rows[0] ?? { stored: 0, unused: 0, issued: 0, claimed: 0, submitted: 0 };
}

/**
 * The task's pool row, created on first use. A task that already had keys
 * (from before pools existed) starts with `minted` = the keys it holds, so its
 * history counts toward any target set later.
 */
export async function ensureKeyPool(taskId: string) {
  const existing = await prisma.articleKeyPool.findUnique({ where: { taskId } });
  if (existing) return existing;
  const held = await prisma.articleTaskKey.count({ where: { taskId } });
  return prisma.articleKeyPool.upsert({
    where: { taskId },
    create: { taskId, minted: held, target: held, buffer: KEY_POOL_LIMITS.defaultBuffer },
    update: {},
  });
}

/**
 * Bring the task's fresh keys back up to `buffer`, never minting past
 * `target`. Each round is one short transaction holding a per-task advisory
 * lock, so two concurrent top-ups cannot both mint (and overshoot). A round
 * that cannot get the lock stops quietly — someone else is already minting.
 * Returns how many keys were created.
 */
export async function topUpKeyPool(taskId: string, maxRounds = 4): Promise<number> {
  let created = 0;
  for (let round = 0; round < maxRounds; round++) {
    const n = await prisma.$transaction(
      async (tx) => {
        const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(
          Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${"akp:" + taskId})) AS locked`
        );
        if (!lock[0]?.locked) return -1;

        const pool = await tx.articleKeyPool.findUnique({ where: { taskId } });
        if (!pool) return 0;

        // Bounded count: stop counting once the buffer is reached.
        const freshRows = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM (
            SELECT 1 FROM "ArticleTaskKey"
            WHERE "taskId" = ${taskId}
              AND "claimedByUserId" IS NULL AND "issuedAt" IS NULL AND "submissionId" IS NULL
            LIMIT ${pool.buffer}
          ) s
        `);
        const fresh = freshRows[0]?.n ?? 0;
        let need = pool.buffer - fresh;
        need = Math.min(need, pool.target - pool.minted);
        need = Math.min(need, MINT_CHUNK);
        if (need <= 0) return 0;

        const values = new Set<string>();
        while (values.size < need) values.add(generateRandomArticleKey());
        const r = await tx.articleTaskKey.createMany({
          data: [...values].map((keyValue) => ({ taskId, keyValue })),
          skipDuplicates: true,
        });
        if (r.count > 0) {
          await tx.articleKeyPool.update({ where: { taskId }, data: { minted: { increment: r.count } } });
        }
        return r.count;
      },
      { timeout: 12_000, maxWait: 5_000 }
    );
    if (n <= 0) break;
    created += n;
    if (n < MINT_CHUNK) break;
  }
  return created;
}

/** Top up after the response is sent; never throws into the request. */
export function topUpKeyPoolSoon(taskId: string): void {
  const run = async () => {
    try {
      await topUpKeyPool(taskId, 1);
    } catch (err) {
      console.error("[article-key-pool] top-up failed for", taskId, err);
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request scope (script) — just run it.
    void run();
  }
}

export type PurgeResult = {
  unused: number;
  abandoned: number;
  finished: number;
  /** True when rows that may be deleted are still left (time budget ran out). */
  more: boolean;
  /** Keys kept because their submission is still under review. */
  keptPending: number;
};

/**
 * Delete the keys a task no longer needs. What goes:
 *   - fresh keys nobody was given (not in a rolling cleanup: `keepUnused`);
 *   - keys handed out but never submitted — on a running task only once they
 *     are 48 h old (the worker has long since left); on an ended task, all;
 *   - keys whose submission is decided (approved or rejected) — on a running
 *     task only once they are 24 h old.
 * What stays: keys tied to a submission still PENDING or REVISION_REQUESTED.
 *
 * On an ended task the pool's allowance is also closed (`target = minted`) so
 * nothing re-mints; generating again re-opens it.
 *
 * Deletes in chunks within a time budget; `more` says the caller (or the
 * scheduler, via `purgeRequestedAt`) should run it again.
 */
export async function purgeArticleKeys(
  taskId: string,
  budgetMs = 20_000,
  opts: { keepUnused?: boolean } = {}
): Promise<PurgeResult> {
  const started = Date.now();
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  const ended = !!task && (ENDED_TASK_STATUSES as readonly string[]).includes(task.status);
  const staleBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);
  // On a running task a decided key is kept for a day: the anonymous path
  // rate-limits per browser by counting keys issued in the last 24 h, and
  // deleting them sooner would let the same browser take another key.
  const decidedBefore = ended ? new Date() : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const out: PurgeResult = { unused: 0, abandoned: 0, finished: 0, more: false, keptPending: 0 };

  const loop = async (label: keyof Pick<PurgeResult, "unused" | "abandoned" | "finished">, sql: Prisma.Sql) => {
    while (Date.now() - started < budgetMs) {
      const n = await prisma.$executeRaw(sql);
      out[label] += n;
      if (n < PURGE_CHUNK) return;
    }
    out.more = true;
  };

  if (!opts.keepUnused) await loop(
    "unused",
    Prisma.sql`
      DELETE FROM "ArticleTaskKey" WHERE id IN (
        SELECT id FROM "ArticleTaskKey"
        WHERE "taskId" = ${taskId}
          AND "claimedByUserId" IS NULL AND "issuedAt" IS NULL AND "submissionId" IS NULL
        LIMIT ${PURGE_CHUNK}
      )`
  );
  if (!out.more) {
    await loop(
      "abandoned",
      ended
        ? Prisma.sql`
          DELETE FROM "ArticleTaskKey" WHERE id IN (
            SELECT id FROM "ArticleTaskKey"
            WHERE "taskId" = ${taskId} AND "submissionId" IS NULL
              AND ("claimedByUserId" IS NOT NULL OR "issuedAt" IS NOT NULL)
            LIMIT ${PURGE_CHUNK}
          )`
        : Prisma.sql`
          DELETE FROM "ArticleTaskKey" WHERE id IN (
            SELECT id FROM "ArticleTaskKey"
            WHERE "taskId" = ${taskId} AND "submissionId" IS NULL
              AND (("claimedByUserId" IS NOT NULL AND "claimedAt" < ${staleBefore})
                OR ("claimedByUserId" IS NULL AND "issuedAt" < ${staleBefore}))
            LIMIT ${PURGE_CHUNK}
          )`
    );
  }
  if (!out.more) {
    await loop(
      "finished",
      Prisma.sql`
        DELETE FROM "ArticleTaskKey" WHERE id IN (
          SELECT k.id FROM "ArticleTaskKey" k
          JOIN "TaskSubmission" s ON s.id = k."submissionId"
          WHERE k."taskId" = ${taskId}
            AND s.status IN ('APPROVED', 'AUTO_APPROVED', 'REJECTED')
            AND COALESCE(k."issuedAt", k."claimedAt", k."createdAt") < ${decidedBefore}
          LIMIT ${PURGE_CHUNK}
        )`
    );
  }
  out.keptPending = await prisma.articleTaskKey.count({
    where: { taskId, submission: { status: { in: ["PENDING", "REVISION_REQUESTED"] } } },
  });

  const deleted = out.unused + out.abandoned + out.finished;
  const pool = await ensureKeyPool(taskId);
  await prisma.articleKeyPool.update({
    where: { taskId },
    data: {
      purgedTotal: { increment: deleted },
      lastPurgedAt: new Date(),
      purgeRequestedAt: out.more ? pool.purgeRequestedAt ?? new Date() : null,
      // An ended task stops minting; on a running task, unused keys are simply
      // re-minted by the next top-up.
      ...(ended ? { target: pool.minted } : {}),
    },
  });
  return out;
}

/**
 * Scheduler job: keep running pools topped up, continue purges that ran out
 * of time, and auto-purge tasks that ended `autoPurgeDays` ago.
 */
export async function runArticleKeyMaintenance(): Promise<{
  toppedUp: number;
  keysMinted: number;
  purged: number;
  keysDeleted: number;
}> {
  const res = { toppedUp: 0, keysMinted: 0, purged: 0, keysDeleted: 0 };
  const started = Date.now();
  const BUDGET = 60_000;

  // 0. Tasks that got keys before pools existed have no pool row, so neither
  //    auto-purge nor the admin counters would see them. Adopt them with a
  //    CLOSED allowance (target = keys held): nothing new is minted for them
  //    until an admin adds keys — exactly how they behaved before.
  const orphans = await prisma.$queryRaw<Array<{ taskId: string }>>(Prisma.sql`
    SELECT DISTINCT k."taskId" FROM "ArticleTaskKey" k
    LEFT JOIN "ArticleKeyPool" p ON p."taskId" = k."taskId"
    WHERE p."taskId" IS NULL
    LIMIT 50
  `);
  for (const o of orphans) await ensureKeyPool(o.taskId).catch(() => null);

  // 1. Unfinished purges first — the admin already asked for them.
  const pending = await prisma.articleKeyPool.findMany({
    where: { purgeRequestedAt: { not: null } },
    select: { taskId: true },
    take: 20,
  });
  for (const p of pending) {
    if (Date.now() - started > BUDGET) return res;
    const r = await purgeArticleKeys(p.taskId, 15_000);
    res.purged++;
    res.keysDeleted += r.unused + r.abandoned + r.finished;
  }

  // 2. Auto-purge tasks that stopped running long enough ago.
  const candidates = await prisma.articleKeyPool.findMany({
    where: {
      autoPurgeDays: { gt: 0 },
      task: { status: { in: [...ENDED_TASK_STATUSES] } },
    },
    select: { taskId: true, autoPurgeDays: true, lastPurgedAt: true, task: { select: { updatedAt: true } } },
    take: 200,
  });
  for (const c of candidates) {
    if (Date.now() - started > BUDGET) return res;
    const endedAt = c.task.updatedAt.getTime();
    if (Date.now() - endedAt < c.autoPurgeDays * 86_400_000) continue;
    if (c.lastPurgedAt && c.lastPurgedAt.getTime() > endedAt) continue; // already purged since it ended
    const r = await purgeArticleKeys(c.taskId, 15_000);
    res.purged++;
    res.keysDeleted += r.unused + r.abandoned + r.finished;
  }

  // 3. Rolling cleanup on RUNNING tasks: a task with no total limit never
  //    ends, so without this every approved key would stay stored for good.
  //    Decided keys (> 24 h) and abandoned ones (> 48 h) go; unused keys and
  //    keys under review stay. At most every 6 h per task.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const rolling = await prisma.articleKeyPool.findMany({
    where: {
      task: { status: { notIn: [...ENDED_TASK_STATUSES] } },
      purgeRequestedAt: null,
      OR: [{ lastPurgedAt: null }, { lastPurgedAt: { lt: sixHoursAgo } }],
    },
    select: { taskId: true },
    orderBy: { lastPurgedAt: { sort: "asc", nulls: "first" } },
    take: 50,
  });
  for (const p of rolling) {
    if (Date.now() - started > BUDGET) return res;
    const r = await purgeArticleKeys(p.taskId, 10_000, { keepUnused: true });
    const n = r.abandoned + r.finished;
    if (n > 0) {
      res.purged++;
      res.keysDeleted += n;
    }
  }

  // 4. Top up running pools that still have allowance.
  const running = await prisma.articleKeyPool.findMany({
    where: { task: { status: "ACTIVE" }, purgeRequestedAt: null },
    select: { taskId: true, target: true, minted: true },
    take: 200,
  });
  for (const p of running) {
    if (Date.now() - started > BUDGET) return res;
    if (p.minted >= p.target) continue;
    const n = await topUpKeyPool(p.taskId, 2).catch(() => 0);
    if (n > 0) {
      res.toppedUp++;
      res.keysMinted += n;
    }
  }
  return res;
}
