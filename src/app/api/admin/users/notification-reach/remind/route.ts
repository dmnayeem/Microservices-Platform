import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  PUSH_REMINDER_CAP,
  PUSH_REMINDER_COOLDOWN_DAYS,
  parseReachFilters,
  sendPushReminders,
  type ReminderTarget,
} from "@/lib/notification-reach";

export const runtime = "nodejs";

/**
 * POST — "Remind to turn on notifications".
 * Body: { userIds: string[] }  or  { filters: Record<string,string> } (the page's
 * current filter, capped at 5,000). One in-app notification per user; anyone
 * reminded in the last 7 days is skipped. One audit row with the counts.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "users.view")) || !(await can(session.user.id, "notifications.send")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { userIds?: unknown; filters?: unknown } | null;
  let target: ReminderTarget;
  let mode: "selected" | "filter";
  if (Array.isArray(body?.userIds)) {
    const ids = body.userIds.filter((s): s is string => typeof s === "string" && s.length <= 64);
    if (ids.length === 0) return NextResponse.json({ error: "Select at least one user" }, { status: 400 });
    if (ids.length > PUSH_REMINDER_CAP)
      return NextResponse.json({ error: `At most ${PUSH_REMINDER_CAP.toLocaleString()} users at once` }, { status: 400 });
    target = { userIds: ids };
    mode = "selected";
  } else if (body?.filters && typeof body.filters === "object") {
    const raw = Object.fromEntries(
      Object.entries(body.filters as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : undefined])
    );
    target = { filters: parseReachFilters(raw) };
    mode = "filter";
  } else {
    return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
  }

  const result = await sendPushReminders(target);

  if (result.sent > 0 || result.skippedRecent > 0) {
    await writeAudit({
      actorId: session.user.id,
      action: "PUSH_REMINDER_SENT",
      entity: "Notification",
      summary:
        `Reminded ${result.sent.toLocaleString()} user(s) to turn on notifications` +
        (result.skippedRecent ? ` (${result.skippedRecent.toLocaleString()} skipped: reminded in the last ${PUSH_REMINDER_COOLDOWN_DAYS} days)` : ""),
      meta: { mode, ...result, ...("filters" in target ? { filters: target.filters } : {}) },
    });
  }

  return NextResponse.json(result);
}
