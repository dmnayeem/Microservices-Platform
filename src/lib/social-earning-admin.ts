import "server-only";
import { prisma } from "@/lib/prisma";
import {
  parseSocialEarningConfig,
  SOCIAL_ACTIONS,
  SOCIAL_EARNING_CATEGORY,
  type PerSideRule,
  type SocialActivityKey,
} from "@/lib/social-actions";

/**
 * The admin form's view of the config.
 *
 * Used by BOTH the settings page and the API's GET. They used to build this
 * independently and had already drifted: the GET defaulted every payout to
 * `points ?? 0` and `enabled ?? true`, so anything that read it and saved would
 * have silently zeroed every recipient reward and switched on the one activity
 * that ships deliberately off.
 */
export interface AdminSideRow {
  enabled: boolean;
  points: number;
  xp: number;
  perCount: number;
  window: PerSideRule["window"];
}

export interface AdminSocialEarningConfig {
  enabled: boolean;
  daily_cap_per_user: number;
  daily_xp_cap_per_user: number;
  cap_per_post: number;
  min_account_age_hours: number;
  count_toward_daily_missions: boolean;
  mission_distinct_post: boolean;
  activities: Record<
    SocialActivityKey,
    { recipient: AdminSideRow; actor: AdminSideRow }
  >;
}

export async function readSocialEarningAdminConfig(): Promise<AdminSocialEarningConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: { category: SOCIAL_EARNING_CATEGORY },
  });
  const cfg = parseSocialEarningConfig(
    new Map(rows.map((r) => [r.key, r.value]))
  );

  const activities = {} as AdminSocialEarningConfig["activities"];
  for (const action of SOCIAL_ACTIONS) {
    const key = action.toLowerCase() as SocialActivityKey;
    activities[key] = {
      recipient: { ...cfg.perActivity[action].recipient },
      actor: { ...cfg.perActivity[action].actor },
    };
  }

  return {
    enabled: cfg.enabled,
    daily_cap_per_user: cfg.dailyCapPerUser,
    daily_xp_cap_per_user: cfg.dailyXpCapPerUser,
    cap_per_post: cfg.capPerPost,
    min_account_age_hours: cfg.minAccountAgeHours,
    count_toward_daily_missions: cfg.countTowardDailyMissions,
    mission_distinct_post: cfg.missionDistinctPost,
    activities,
  };
}
