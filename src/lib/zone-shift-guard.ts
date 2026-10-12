import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Daily rewards reset at the member's LOCAL midnight (lib/user-day). Moving the
 * country or time zone ahead (Bangladesh → Kiribati) starts "tomorrow" early,
 * which was one extra daily claim per jump. Country (7 days) and time zone
 * (30 days) already have cooldowns; this closes the jump itself: for 24 hours
 * after such a change, a daily reward needs 20 hours since the previous one.
 * Members who don't change their location never see it.
 */
const SHIFT_WINDOW_MS = 24 * 3_600_000;
const MIN_GAP_MS = 20 * 3_600_000;

export async function zoneShiftBlock(userId: string, referencePrefix: string): Promise<NextResponse | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezoneChangedAt: true, targetingChangedAt: true },
  });
  const changedAt = Math.max(u?.timezoneChangedAt?.getTime() ?? 0, u?.targetingChangedAt?.getTime() ?? 0);
  if (!changedAt || Date.now() - changedAt > SHIFT_WINDOW_MS) return null;

  const last = await prisma.transaction.findFirst({
    where: { userId, reference: { startsWith: referencePrefix } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last) return null;
  const waitMs = last.createdAt.getTime() + MIN_GAP_MS - Date.now();
  if (waitMs <= 0) return null;
  const hours = Math.ceil(waitMs / 3_600_000);
  return NextResponse.json(
    {
      error: `You changed your country or time zone recently, so this reward opens 20 hours after your last one — in about ${hours} hour${hours === 1 ? "" : "s"}.`,
      code: "ZONE_SHIFT_WAIT",
      retryAfterHours: hours,
    },
    { status: 429 }
  );
}
