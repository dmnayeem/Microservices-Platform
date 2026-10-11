import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { LEVEL_REWARDS_KEY, normalizeLevelRewards, validateLevelRewards } from "@/lib/level-rewards";

/**
 * PUT /api/admin/gamification/level-rewards — `{ enabled, rows: [{ level, points }] }`.
 * Same permission as the other gamification settings (`settings.edit`). A bad
 * value is refused with a message, never clamped silently.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const problem = validateLevelRewards(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const value = normalizeLevelRewards(body);
  await saveSetting(LEVEL_REWARDS_KEY, value, "gamification");
  await writeAudit({
    actorId: session.user.id,
    action: "LEVEL_REWARDS_SET",
    entity: "SystemSetting",
    entityId: LEVEL_REWARDS_KEY,
    summary: value.enabled
      ? `Level rewards: ${value.rows.map((r) => `L${r.level}=${r.points}`).join(", ") || "none"}`
      : "Level rewards switched off",
  });
  return NextResponse.json({ ok: true, value });
}
