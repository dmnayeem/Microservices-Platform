import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseEventTiers } from "@/lib/events-shared";
import type { Prisma } from "@/generated/prisma/client";

const ACTION_TYPES = [
  "TEAM_ADD",
  "TASK_COMPLETE",
  "QUIZ_COMPLETE",
  "LOTTERY_BUY",
  "UPLOAD_PROOF",
  "SOCIAL_ACTION",
] as const;

function parseBody(b: Record<string, unknown>) {
  const actionType = String(b.actionType ?? "");
  if (!ACTION_TYPES.includes(actionType as (typeof ACTION_TYPES)[number])) {
    return { error: "Invalid action type" as const };
  }
  const title = String(b.title ?? "").trim();
  if (!title) return { error: "Title is required" as const };
  const startAt = new Date(String(b.startAt));
  const endAt = new Date(String(b.endAt));
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || endAt <= startAt) {
    return { error: "Invalid start/end date" as const };
  }
  const int = (v: unknown, def: number) => {
    const n = parseInt(String(v ?? def), 10);
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  const tiers = parseEventTiers(b.tiers);
  return {
    data: {
      title,
      description: b.description ? String(b.description) : null,
      actionType: actionType as (typeof ACTION_TYPES)[number],
      threshold: Math.max(1, int(b.threshold, 1)),
      rewardPoints: int(b.rewardPoints, 0),
      rewardXp: int(b.rewardXp, 0),
      tiers: tiers.length
        ? (tiers as unknown as Prisma.InputJsonValue)
        : undefined,
      requiredAccessLevel: int(b.requiredAccessLevel, 0),
      startAt,
      endAt,
      isActive: b.isActive !== false,
    },
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "events.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { progress: true } } },
  });
  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "events.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseBody(b);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const event = await prisma.event.create({ data: parsed.data });
  return NextResponse.json({ event });
}
