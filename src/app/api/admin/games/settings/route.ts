import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { GAMES_SETTING_KEYS, getGamesGlobalConfig } from "@/lib/game-settings";
import { GAMES_BOUNDS as B } from "@/lib/game-settings-bounds";

const int = (b: { min: number; max: number }, label: string) =>
  z
    .number({ message: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(b.min, `${label} must be at least ${b.min.toLocaleString()}.`)
    .max(b.max, `${label} must be at most ${b.max.toLocaleString()}.`);

const schema = z.object({
  enabled: z.boolean(),
  maxPointsPerTick: int(B.maxPointsPerTick, "Max points per tick"),
  minTickSeconds: int(B.minTickSeconds, "Minimum tick length"),
  globalDailyCap: int(B.globalDailyCap, "Daily cap across all games"),
  maxPerSession: int(B.maxPerSession, "Max points per session"),
});

/**
 * PUT /api/admin/games/settings — the global game-earning guardrails.
 *
 * Same permission as creating/editing a game (`games.manage`). Writes the
 * existing `games.*` keys (GAMES_SETTING_KEYS) — the keys the reward engine
 * already reads — so nothing about how they are read changes.
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await request.json().catch(() => null));
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const before = await getGamesGlobalConfig();
  const d = v.data;
  await saveSetting(GAMES_SETTING_KEYS.enabled, d.enabled, "games");
  await saveSetting(GAMES_SETTING_KEYS.maxPointsPerTick, d.maxPointsPerTick, "games");
  await saveSetting(GAMES_SETTING_KEYS.minTickSeconds, d.minTickSeconds, "games");
  await saveSetting(GAMES_SETTING_KEYS.globalDailyCap, d.globalDailyCap, "games");
  await saveSetting(GAMES_SETTING_KEYS.maxPerSession, d.maxPerSession, "games");

  await writeAudit({
    actorId: session.user.id,
    action: "GAMES_SETTINGS_UPDATED",
    entity: "SystemSetting",
    entityId: "games",
    summary: `Game earning ${d.enabled ? "on" : "OFF"}; ≤${d.maxPointsPerTick} pts/tick, ticks ≥${d.minTickSeconds}s, ${d.globalDailyCap}/day, ${d.maxPerSession}/session`,
    meta: { before, after: d },
  }).catch(() => {});

  return NextResponse.json({ ok: true, config: await getGamesGlobalConfig() });
}
