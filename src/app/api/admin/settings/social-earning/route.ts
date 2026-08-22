import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateSocialEarningCache } from "@/lib/social-earning";
import { invalidateSettingsCache } from "@/lib/system-settings";
import { z } from "zod";
import { SOCIAL_ACTIVITY_KEYS } from "@/lib/social-actions";
import { readSocialEarningAdminConfig } from "@/lib/social-earning-admin";

const ACTIONS = SOCIAL_ACTIVITY_KEYS;

const sideSchema = z.object({
  enabled: z.boolean(),
  points: z.number().min(0).max(10000),
  xp: z.number().min(0).max(10000),
  // Award points+xp once per this many counted actions. 1 = flat per action.
  perCount: z.number().int().min(1).max(1_000_000).optional(),
  // Over what period the counter resets before the next milestone.
  window: z.enum(["daily", "lifetime"]).optional(),
});

const schema = z.object({
  enabled: z.boolean(),
  daily_cap_per_user: z.number().int().min(0).max(100000),
  daily_xp_cap_per_user: z.number().int().min(0).max(100000),
  cap_per_post: z.number().int().min(0).max(100000),
  min_account_age_hours: z.number().int().min(0).max(720),
  count_toward_daily_missions: z.boolean(),
  mission_distinct_post: z.boolean(),
  activities: z.record(
    z.enum(ACTIONS),
    z.object({
      recipient: sideSchema,
      actor: sideSchema,
    })
  ),
});

const CATEGORY = "social_earning";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Shared with the settings page. These fallbacks used to be hand-written here
  // and had drifted from the real defaults — every payout defaulted to 0 points
  // and every activity to enabled, so a round-trip through this endpoint would
  // have zeroed the platform and switched on the one activity that ships off.
  const config = await readSocialEarningAdminConfig();

  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const cfg = v.data;

  const writes: Array<[string, unknown]> = [
    ["social_earning.enabled", cfg.enabled],
    ["social_earning.daily_cap_per_user", cfg.daily_cap_per_user],
    ["social_earning.daily_xp_cap_per_user", cfg.daily_xp_cap_per_user],
    ["social_earning.cap_per_post", cfg.cap_per_post],
    ["social_earning.min_account_age_hours", cfg.min_account_age_hours],
    ["social_earning.count_toward_daily_missions", cfg.count_toward_daily_missions],
    ["social_earning.mission_distinct_post", cfg.mission_distinct_post],
  ];
  for (const a of ACTIONS) {
    const row = cfg.activities[a];
    if (!row) continue;
    writes.push([`social_earning.${a}_enabled`, row.recipient.enabled]);
    writes.push([`social_earning.${a}_points`, row.recipient.points]);
    writes.push([`social_earning.${a}_recipient_xp`, row.recipient.xp]);
    writes.push([`social_earning.${a}_actor_enabled`, row.actor.enabled]);
    writes.push([`social_earning.${a}_actor_points`, row.actor.points]);
    writes.push([`social_earning.${a}_actor_xp`, row.actor.xp]);
    writes.push([`social_earning.${a}_actor_per_count`, row.actor.perCount ?? 1]);
    // Ratio settings — recipient side is new; the actor side gains a window.
    writes.push([`social_earning.${a}_recipient_per_count`, row.recipient.perCount ?? 1]);
    writes.push([`social_earning.${a}_recipient_per_window`, row.recipient.window ?? "daily"]);
    writes.push([`social_earning.${a}_actor_per_window`, row.actor.window ?? "lifetime"]);
  }

  // Chunked: this is now ~87 rows, and firing them all at once opens 87
  // concurrent connections against the Accelerate pool.
  const CHUNK = 20;
  for (let i = 0; i < writes.length; i += CHUNK) {
    await Promise.all(
      writes.slice(i, i + CHUNK).map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, category: CATEGORY, value: value as object },
          update: { category: CATEGORY, value: value as object },
        })
      )
    );
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "SOCIAL_EARNING_CONFIG_UPDATED",
      entity: "SystemSetting",
      newData: cfg,
    },
  });

  invalidateSocialEarningCache();
  invalidateSettingsCache();

  return NextResponse.json({ success: true, config: cfg });
}
