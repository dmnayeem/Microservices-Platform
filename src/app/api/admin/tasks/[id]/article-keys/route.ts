import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";
import {
  ENDED_TASK_STATUSES,
  FRESH_KEY_WHERE,
  KEY_POOL_LIMITS,
  ensureKeyPool,
  keyPoolStats,
  purgeArticleKeys,
  topUpKeyPool,
} from "@/lib/article-key-pool";

/*
 * Article task key pool — admin API.
 *
 * Keys are minted on demand (src/lib/article-key-pool.ts): "Generate 2,000,000"
 * raises the task's allowance (`target`) and stores only the buffer; the rest
 * is created as workers claim keys. The list is paged — a pool can hold far
 * more rows than one response can carry (Accelerate refuses responses > 5 MB).
 */

const ACTION_SCHEMA = z.discriminatedUnion("action", [
  // Raise the allowance by `count` keys; only the buffer is stored now.
  z.object({
    action: z.literal("generate"),
    count: z.number().int().min(1).max(KEY_POOL_LIMITS.maxGeneratePerAction),
  }),
  // Hand-made keys (e.g. printed codes). Stored as-is, counted as minted.
  z.object({
    action: z.literal("append"),
    keys: z.array(z.string().trim().min(3).max(80)).min(1).max(10000),
  }),
  z.object({
    action: z.literal("replace"),
    keys: z.array(z.string().trim().min(3).max(80)).max(10000),
  }),
  z.object({
    action: z.literal("settings"),
    buffer: z.number().int().min(KEY_POOL_LIMITS.minBuffer).max(KEY_POOL_LIMITS.maxBuffer).optional(),
    autoPurgeDays: z.number().int().min(0).max(KEY_POOL_LIMITS.maxAutoPurgeDays).optional(),
    // Lower (or raise) the allowance directly. Never below what was minted.
    target: z.number().int().min(0).max(KEY_POOL_LIMITS.maxTarget).optional(),
  }),
  z.object({ action: z.literal("purge") }),
]);

const PAGE_SIZE = 100;
const FILTERS = ["all", "unused", "issued", "claimed", "submitted"] as const;

async function gate(perm: "tasks.view" | "tasks.create") {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await can(session.user.id, perm))) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}

async function articleTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, type: true, status: true } });
  return task && task.type === "ARTICLE" ? task : null;
}

// GET ?page=1&filter=all|unused|issued|claimed|submitted&q=<key prefix>
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate("tasks.view");
  if (g.error) return g.error;
  const { id } = await params;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Math.min(100_000, parseInt(sp.get("page") ?? "1", 10) || 1));
  const filterRaw = sp.get("filter") ?? "all";
  const filter = (FILTERS as readonly string[]).includes(filterRaw) ? filterRaw : "all";
  const q = (sp.get("q") ?? "").trim().toUpperCase().slice(0, 40);

  const where = {
    taskId: id,
    ...(filter === "unused" ? FRESH_KEY_WHERE : {}),
    ...(filter === "issued" ? { claimedByUserId: null, issuedAt: { not: null }, submissionId: null } : {}),
    ...(filter === "claimed" ? { claimedByUserId: { not: null }, submissionId: null } : {}),
    ...(filter === "submitted" ? { submissionId: { not: null } } : {}),
    ...(q ? { keyValue: { startsWith: q } } : {}),
  };

  const [stats, pool, keys] = await Promise.all([
    keyPoolStats(id),
    prisma.articleKeyPool.findUnique({ where: { taskId: id } }),
    prisma.articleTaskKey.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        keyValue: true,
        claimedByUserId: true,
        claimedAt: true,
        issuedAt: true,
        submissionId: true,
        createdAt: true,
      },
    }),
  ]);
  const hasMore = keys.length > PAGE_SIZE;
  const pageKeys = keys.slice(0, PAGE_SIZE);

  const claimerIds = [...new Set(pageKeys.map((k) => k.claimedByUserId).filter((u): u is string => !!u))];
  const claimers = claimerIds.length
    ? await prisma.user.findMany({ where: { id: { in: claimerIds } }, select: { id: true, name: true, email: true } })
    : [];
  const claimerById = new Map(claimers.map((u) => [u.id, u]));

  // Keys still to come under the allowance.
  const remaining = pool ? Math.max(0, pool.target - pool.minted) : 0;

  return NextResponse.json({
    // For the task builder's gates: "unused" = keys a worker can still get —
    // stored now plus still to be minted under the allowance.
    total: stats.stored,
    unused: stats.unused + remaining,
    stored: stats.stored,
    readyNow: stats.unused,
    issued: stats.issued,
    claimed: stats.claimed,
    submitted: stats.submitted,
    pool: pool
      ? {
          target: pool.target,
          minted: pool.minted,
          remaining,
          buffer: pool.buffer,
          autoPurgeDays: pool.autoPurgeDays,
          purgedTotal: pool.purgedTotal,
          lastPurgedAt: pool.lastPurgedAt,
          purging: !!pool.purgeRequestedAt,
        }
      : null,
    limits: KEY_POOL_LIMITS,
    page,
    pageSize: PAGE_SIZE,
    hasMore,
    keys: pageKeys.map((k) => ({
      ...k,
      claimer: k.claimedByUserId ? claimerById.get(k.claimedByUserId) ?? null : null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate("tasks.create");
  if (g.error) return g.error;
  const { id } = await params;
  const task = await articleTask(id);
  if (!task) return NextResponse.json({ error: "Article task not found" }, { status: 404 });

  const v = ACTION_SCHEMA.safeParse(await req.json().catch(() => null));
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }
  const data = v.data;

  if (data.action === "generate") {
    const pool = await ensureKeyPool(id);
    const newTarget = Math.min(KEY_POOL_LIMITS.maxTarget, Math.max(pool.target, pool.minted) + data.count);
    await prisma.articleKeyPool.update({ where: { taskId: id }, data: { target: newTarget, purgeRequestedAt: null } });
    const created = await topUpKeyPool(id, 2);
    await writeAudit({
      actorId: g.userId,
      action: "ARTICLE_KEYS_GENERATED",
      entity: "Task",
      entityId: id,
      summary: `Raised article key allowance by ${data.count.toLocaleString()} (total ${newTarget.toLocaleString()}); ${created} stored now`,
      meta: { added: data.count, before: pool.target, after: newTarget, storedNow: created },
    });
    return NextResponse.json({ created, allowance: newTarget, added: data.count });
  }

  if (data.action === "settings") {
    const pool = await ensureKeyPool(id);
    const next = {
      ...(data.buffer !== undefined ? { buffer: data.buffer } : {}),
      ...(data.autoPurgeDays !== undefined ? { autoPurgeDays: data.autoPurgeDays } : {}),
      ...(data.target !== undefined ? { target: Math.max(data.target, pool.minted) } : {}),
    };
    await prisma.articleKeyPool.update({ where: { taskId: id }, data: next });
    await writeAudit({
      actorId: g.userId,
      action: "ARTICLE_KEY_POOL_SETTINGS",
      entity: "Task",
      entityId: id,
      summary: "Changed article key pool settings",
      meta: { before: { buffer: pool.buffer, autoPurgeDays: pool.autoPurgeDays, target: pool.target }, after: next },
    });
    if (task.status === "ACTIVE") await topUpKeyPool(id, 1).catch(() => 0);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "purge") {
    const r = await purgeArticleKeys(id);
    await writeAudit({
      actorId: g.userId,
      action: "ARTICLE_KEYS_PURGED",
      entity: "Task",
      entityId: id,
      summary: `Purged ${(r.unused + r.abandoned + r.finished).toLocaleString()} article keys${r.more ? " (continuing in the background)" : ""}`,
      meta: { ...r, taskStatus: task.status },
    });
    return NextResponse.json({ ...r, deleted: r.unused + r.abandoned + r.finished });
  }

  // append / replace — hand-made keys.
  const toCreate = [...new Set(data.keys.map((k) => k.trim()).filter(Boolean))];
  let replaced = 0;
  if (data.action === "replace") {
    // Only never-issued keys: anything handed out is part of someone's work.
    replaced = (await prisma.articleTaskKey.deleteMany({ where: { taskId: id, ...FRESH_KEY_WHERE } })).count;
  }
  const existing = toCreate.length
    ? await prisma.articleTaskKey.findMany({
        where: { taskId: id, keyValue: { in: toCreate } },
        select: { keyValue: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.keyValue));
  const fresh = toCreate.filter((k) => !existingSet.has(k));
  const created = fresh.length
    ? (await prisma.articleTaskKey.createMany({ data: fresh.map((keyValue) => ({ taskId: id, keyValue })), skipDuplicates: true })).count
    : 0;
  await ensureKeyPool(id);
  if (created > 0) {
    // Hand-made keys widen the allowance by exactly what was added.
    await prisma.articleKeyPool.update({
      where: { taskId: id },
      data: { minted: { increment: created }, target: { increment: created } },
    });
  }
  await writeAudit({
    actorId: g.userId,
    action: data.action === "replace" ? "ARTICLE_KEYS_REPLACED" : "ARTICLE_KEYS_APPENDED",
    entity: "Task",
    entityId: id,
    summary: `${data.action === "replace" ? "Replaced" : "Added"} article keys: ${created} new`,
    meta: { added: created, skipped: toCreate.length - fresh.length, removedUnused: replaced },
  });
  if (created === 0 && data.action !== "replace") {
    return NextResponse.json({ created: 0, skipped: toCreate.length, message: "All provided keys already exist on this task." });
  }
  return NextResponse.json({ created, skipped: toCreate.length - fresh.length });
}

// DELETE — remove every never-issued key AND stop minting new ones.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate("tasks.create");
  if (g.error) return g.error;
  const { id } = await params;
  const task = await articleTask(id);
  if (!task) return NextResponse.json({ error: "Article task not found" }, { status: 404 });

  const pool = await ensureKeyPool(id);
  // Close the allowance first so a background top-up can't refill behind us.
  await prisma.articleKeyPool.update({ where: { taskId: id }, data: { target: pool.minted } });
  let deleted = 0;
  for (let i = 0; i < 400; i++) {
    const batch = await prisma.articleTaskKey.findMany({ where: { taskId: id, ...FRESH_KEY_WHERE }, select: { id: true }, take: 5000 });
    if (batch.length === 0) break;
    deleted += (await prisma.articleTaskKey.deleteMany({ where: { id: { in: batch.map((b) => b.id) }, ...FRESH_KEY_WHERE } })).count;
  }
  await writeAudit({
    actorId: g.userId,
    action: "ARTICLE_KEYS_CLEARED",
    entity: "Task",
    entityId: id,
    summary: `Cleared ${deleted.toLocaleString()} unused article keys and closed the allowance`,
    meta: { deleted, ended: (ENDED_TASK_STATUSES as readonly string[]).includes(task.status) },
  });
  return NextResponse.json({ deleted });
}
