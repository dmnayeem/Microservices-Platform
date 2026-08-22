import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseEventTiers, EVENT_ACTION_TYPES } from "@/lib/events-shared";
import { maxPackageAccessLevel } from "@/lib/events";
import type { Prisma } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { EVENTS_ACTIVE_TAG } from "@/lib/cache-tags";

// The single shared list — see EVENT_ACTION_TYPES in events-shared.ts.
const ACTION_TYPES = EVENT_ACTION_TYPES;

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
      // 0 = unlimited. Bounded per user per LOCAL day by recordUserAction.
      dailyCap: int(b.dailyCap, 0),
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
  const [events, packages] = await Promise.all([
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { progress: true } } },
    }),
    prisma.package.findMany({
      orderBy: { accessLevel: "asc" },
      select: { name: true, accessLevel: true },
    }),
  ]);
  // Access-level options for the form: "All users" (0) + each distinct package
  // tier, so an admin can only pick a tier that actually exists.
  const seen = new Set<number>();
  const accessLevels: { level: number; label: string }[] = [];
  for (const p of packages) {
    if (seen.has(p.accessLevel)) continue;
    seen.add(p.accessLevel);
    accessLevels.push({
      level: p.accessLevel,
      label: p.accessLevel === 0 ? "All users" : `${p.name} (level ${p.accessLevel})`,
    });
  }
  if (!seen.has(0)) accessLevels.unshift({ level: 0, label: "All users" });
  return NextResponse.json({ events, accessLevels });
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
  // Never gate above the top real tier — else the event is invisible to everyone.
  const maxLevel = await maxPackageAccessLevel();
  parsed.data.requiredAccessLevel = Math.min(
    parsed.data.requiredAccessLevel,
    maxLevel
  );
  const event = await prisma.event.create({ data: parsed.data });
  // The recorder reads a cached index of active events to decide whether an
  // action needs tracking at all. Without this the new event records nothing
  // for up to 60s — long enough for the admin to test it and conclude it's
  // broken.
  revalidateTag(EVENTS_ACTIVE_TAG, "max");
  return NextResponse.json({ event });
}
