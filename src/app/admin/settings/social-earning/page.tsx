import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { SocialEarningForm } from "@/components/admin/settings/social-earning-form";

const CATEGORY = "social_earning";

const ACTIONS = [
  "post_create",
  "view_received",
  "like_received",
  "vote_received",
  "comment_received",
  "share_received",
  "donation_received",
  "mention_received",
] as const;

const RECIPIENT_DEFAULTS: Record<
  (typeof ACTIONS)[number],
  { enabled: boolean; points: number }
> = {
  post_create: { enabled: true, points: 5 },
  view_received: { enabled: true, points: 0 },
  like_received: { enabled: true, points: 1 },
  vote_received: { enabled: true, points: 1 },
  comment_received: { enabled: true, points: 2 },
  share_received: { enabled: true, points: 3 },
  donation_received: { enabled: false, points: 0 },
  mention_received: { enabled: true, points: 1 },
};

export default async function SocialEarningSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "settings.view")) redirect("/admin");

  const canEdit = hasPermission(adminRole, "settings.edit");

  const rows = await prisma.systemSetting.findMany({
    where: { category: CATEGORY },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const initial = {
    enabled: (map.get("social_earning.enabled") as boolean) ?? true,
    daily_cap_per_user:
      (map.get("social_earning.daily_cap_per_user") as number) ?? 500,
    daily_xp_cap_per_user:
      (map.get("social_earning.daily_xp_cap_per_user") as number) ?? 1000,
    cap_per_post: (map.get("social_earning.cap_per_post") as number) ?? 100,
    min_account_age_hours:
      (map.get("social_earning.min_account_age_hours") as number) ?? 24,
    count_toward_daily_missions:
      (map.get("social_earning.count_toward_daily_missions") as boolean) ?? true,
    mission_distinct_post:
      (map.get("social_earning.mission_distinct_post") as boolean) ?? true,
    activities: Object.fromEntries(
      ACTIONS.map((a) => {
        const def = RECIPIENT_DEFAULTS[a];
        return [
          a,
          {
            recipient: {
              enabled:
                (map.get(`social_earning.${a}_enabled`) as boolean) ?? def.enabled,
              points:
                (map.get(`social_earning.${a}_points`) as number) ?? def.points,
              xp: (map.get(`social_earning.${a}_recipient_xp`) as number) ?? 0,
            },
            actor: {
              enabled:
                (map.get(`social_earning.${a}_actor_enabled`) as boolean) ?? false,
              points:
                (map.get(`social_earning.${a}_actor_points`) as number) ?? 0,
              xp: (map.get(`social_earning.${a}_actor_xp`) as number) ?? 0,
              perCount:
                (map.get(`social_earning.${a}_actor_per_count`) as number) ?? 1,
            },
          },
        ];
      })
    ) as Record<
      (typeof ACTIONS)[number],
      {
        recipient: { enabled: boolean; points: number; xp: number };
        actor: {
          enabled: boolean;
          points: number;
          xp: number;
          perCount: number;
        };
      }
    >,
  };

  return <SocialEarningForm initial={initial} canEdit={canEdit} />;
}
