import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache, primeSetting } from "@/lib/system-settings";
import { LEVEL_CURVE_KEY } from "@/lib/level-curve-server";
import { writeAudit } from "@/lib/audit";

/**
 * PUT /api/admin/gamification/level-curve
 *
 * Body: { thresholds: number[], step: number }
 *
 * The curve is validated here as well as in the form, and again when it is
 * read back. That is not belt-and-braces for its own sake: the value lives in
 * a JSON column, so a hand-edited row or an older shape can arrive at the
 * reader without ever passing through this route, and a curve that does not
 * strictly increase makes "what level is this XP" ambiguous.
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
    thresholds?: unknown;
    step?: unknown;
  };

  const thresholds = Array.isArray(body.thresholds)
    ? body.thresholds.map((n) => Math.round(Number(n)))
    : null;
  const step = Math.round(Number(body.step));

  if (!thresholds || thresholds.length === 0) {
    return NextResponse.json(
      { error: "Give at least one level threshold" },
      { status: 400 }
    );
  }
  if (thresholds.length > 200) {
    return NextResponse.json(
      { error: "That is more levels than anyone will ever reach" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(step) || step <= 0) {
    return NextResponse.json(
      { error: "The cost of each level beyond the table must be above zero" },
      { status: 400 }
    );
  }
  let last = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (!Number.isFinite(thresholds[i]) || thresholds[i] <= last) {
      return NextResponse.json(
        {
          error: `Level ${i + 2} must need more XP than the level below it. A curve that does not climb would put a user on two levels at once.`,
        },
        { status: 400 }
      );
    }
    last = thresholds[i];
  }

  await prisma.systemSetting.upsert({
    where: { key: LEVEL_CURVE_KEY },
    create: {
      key: LEVEL_CURVE_KEY,
      category: "gamification",
      value: { thresholds, step },
    },
    update: { value: { thresholds, step } },
  });
  // Clearing alone is not enough: the read also carries an Accelerate
  // cacheStrategy, and that edge cache keeps serving the old row for its TTL.
  // Priming the value we just wrote is what makes Save take effect on the
  // reload the admin is about to do.
  invalidateSettingsCache();
  primeSetting(LEVEL_CURVE_KEY, { thresholds, step });

  await writeAudit({
    actorId: session.user.id,
    action: "GAMIFICATION_LEVEL_CURVE_UPDATED",
    entity: "SystemSetting",
    entityId: LEVEL_CURVE_KEY,
    summary: `Level curve set to ${thresholds.length + 1} levels, +${step} XP each beyond`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, thresholds, step });
}
