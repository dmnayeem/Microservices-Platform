import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { MILESTONES } from "@/lib/milestones";
import {
  DAILY_REWARD_KEY,
  SOLO_REWARD_KEY,
  MILESTONE_REWARDS_KEY,
  MILESTONE_REFERRAL_DEFER_KEY,
  validateDailyRewardConfig,
  validateSoloRewardConfig,
  validateMilestoneOverrides,
} from "@/lib/reward-config";

/**
 * PUT /api/admin/gamification/rewards
 *
 * Body, one of:
 *   { kind: "daily",      value: DailyRewardConfig }
 *   { kind: "solo",       value: SoloRewardConfig }
 *   { kind: "milestones", value: { rewards: Record<id, {points, enabled}>, referralDeferToLadder: boolean } }
 *
 * Same permission as the level-curve sibling (`settings.edit`). Every figure is
 * bounded (see reward-config.ts) so a typo cannot mint a huge reward, and a bad
 * value is REJECTED with a message rather than quietly clamped.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: unknown;
    value?: unknown;
  };

  if (body.kind === "daily") {
    const v = validateDailyRewardConfig(body.value);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await saveSetting(DAILY_REWARD_KEY, v.value, "gamification");
    await writeAudit({
      actorId: session.user.id,
      action: "GAMIFICATION_DAILY_REWARD_UPDATED",
      entity: "SystemSetting",
      entityId: DAILY_REWARD_KEY,
      summary: `Daily reward ladder set to ${v.value.days
        .map((d) => d.points)
        .join("/")} pts; mystery box ${v.value.mysteryBoxEnabled ? "on" : "off"}`,
      meta: { ...v.value },
    }).catch(() => {});
    return NextResponse.json({ ok: true, value: v.value });
  }

  if (body.kind === "solo") {
    const v = validateSoloRewardConfig(body.value);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await saveSetting(SOLO_REWARD_KEY, v.value, "gamification");
    await writeAudit({
      actorId: session.user.id,
      action: "GAMIFICATION_SOLO_REWARD_UPDATED",
      entity: "SystemSetting",
      entityId: SOLO_REWARD_KEY,
      summary: `Solo reward set to ${v.value.points} pts + ${v.value.xp} XP for ${v.value.tasksToday} tasks and $${v.value.earningsToday} today`,
      meta: { ...v.value },
    }).catch(() => {});
    return NextResponse.json({ ok: true, value: v.value });
  }

  if (body.kind === "milestones") {
    const val = (body.value ?? {}) as {
      rewards?: unknown;
      referralDeferToLadder?: unknown;
    };
    const v = validateMilestoneOverrides(
      val.rewards,
      MILESTONES.map((m) => m.id)
    );
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const defer = val.referralDeferToLadder === true;
    await saveSetting(MILESTONE_REWARDS_KEY, v.value, "gamification");
    await saveSetting(MILESTONE_REFERRAL_DEFER_KEY, defer, "gamification");
    const off = Object.entries(v.value)
      .filter(([, o]) => o.enabled === false)
      .map(([id]) => id);
    await writeAudit({
      actorId: session.user.id,
      action: "GAMIFICATION_MILESTONES_UPDATED",
      entity: "SystemSetting",
      entityId: MILESTONE_REWARDS_KEY,
      summary: `Milestone rewards saved (${off.length} switched off${
        off.length ? `: ${off.join(", ")}` : ""
      }); referral milestones ${defer ? "defer to" : "pay alongside"} the referral ladder`,
      meta: { rewards: v.value, referralDeferToLadder: defer },
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
