import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateRandomArticleKey } from "@/lib/article-tasks";
import { z } from "zod";

const ACTION_SCHEMA = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    count: z.number().int().min(1).max(10000),
  }),
  z.object({
    action: z.literal("append"),
    keys: z.array(z.string().trim().min(3).max(80)).min(1).max(10000),
  }),
  z.object({
    action: z.literal("replace"),
    keys: z.array(z.string().trim().min(3).max(80)).max(10000),
  }),
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "tasks.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const keys = await prisma.articleTaskKey.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      keyValue: true,
      claimedByUserId: true,
      claimedAt: true,
      submissionId: true,
      createdAt: true,
    },
  });

  // Side-fetch user info for claimed rows so admin sees who owns each key.
  const claimerIds = Array.from(
    new Set(
      keys
        .map((k) => k.claimedByUserId)
        .filter((u): u is string => !!u)
    )
  );
  const claimers = claimerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: claimerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const claimerById = new Map(claimers.map((u) => [u.id, u]));

  return NextResponse.json({
    total: keys.length,
    unused: keys.filter((k) => !k.claimedByUserId).length,
    claimed: keys.filter((k) => !!k.claimedByUserId).length,
    submitted: keys.filter((k) => !!k.submissionId).length,
    keys: keys.map((k) => ({
      ...k,
      claimer: k.claimedByUserId
        ? claimerById.get(k.claimedByUserId) ?? null
        : null,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "tasks.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, type: true } });
  if (!task || task.type !== "ARTICLE") {
    return NextResponse.json(
      { error: "Article task not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const v = ACTION_SCHEMA.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  let toCreate: string[] = [];
  if (v.data.action === "generate") {
    const set = new Set<string>();
    while (set.size < v.data.count) set.add(generateRandomArticleKey());
    toCreate = Array.from(set);
  } else {
    toCreate = Array.from(
      new Set(v.data.keys.map((k) => k.trim()).filter(Boolean))
    );
  }

  if (v.data.action === "replace") {
    // Only delete unclaimed keys — claimed ones are part of someone's history
    // and wiping them could orphan their submission.
    await prisma.articleTaskKey.deleteMany({
      where: { taskId: id, claimedByUserId: null },
    });
  }

  // Skip duplicates that already exist for this task (unique constraint
  // would throw — we filter pre-flight for a friendlier UX).
  const existing = await prisma.articleTaskKey.findMany({
    where: { taskId: id, keyValue: { in: toCreate } },
    select: { keyValue: true },
  });
  const existingSet = new Set(existing.map((e) => e.keyValue));
  const fresh = toCreate.filter((k) => !existingSet.has(k));

  if (fresh.length === 0 && v.data.action !== "replace") {
    return NextResponse.json({
      created: 0,
      skipped: toCreate.length,
      message: "All provided keys already exist on this task.",
    });
  }

  await prisma.articleTaskKey.createMany({
    data: fresh.map((keyValue) => ({ taskId: id, keyValue })),
    skipDuplicates: true,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action:
        v.data.action === "replace"
          ? "ARTICLE_KEYS_REPLACED"
          : v.data.action === "generate"
          ? "ARTICLE_KEYS_GENERATED"
          : "ARTICLE_KEYS_APPENDED",
      entity: "Task",
      entityId: id,
      newData: { added: fresh.length, skipped: toCreate.length - fresh.length },
    },
  });

  return NextResponse.json({
    created: fresh.length,
    skipped: toCreate.length - fresh.length,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "tasks.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  // Only deletes unclaimed keys; claimed ones are protected.
  const result = await prisma.articleTaskKey.deleteMany({
    where: { taskId: id, claimedByUserId: null },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "ARTICLE_KEYS_CLEARED",
      entity: "Task",
      entityId: id,
      newData: { deleted: result.count },
    },
  });

  return NextResponse.json({ deleted: result.count });
}
