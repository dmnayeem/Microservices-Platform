// Shared daily-mission task-type maps + label helper. Client-safe (no imports),
// so both the mission page and the feed rail widget can label items identically.

/**
 * THE list of daily-mission item types.
 *
 * It was copy-pasted into four places — two Zod enums, the admin client's own
 * `TASK_TYPES` const, and a cast list in the admin page — and the copies had
 * already drifted: the admin page's was missing all five `SOCIAL_*` values.
 * The schema comment on `DailyMissionItem.taskType` listed a fifth version.
 * Everything now derives from here, the way `EVENT_ACTION_TYPES` works for
 * events.
 *
 * Adding a type means: add it here, give it a route + label below, and teach
 * `buildDailyProgress` (src/lib/daily-mission-progress.ts) how to count it.
 * A type with no counter silently never completes.
 */
export const MISSION_TASK_TYPES = [
  // Task-submission backed (counted from TaskSubmission)
  "ARTICLE",
  "VIDEO",
  "QUIZ",
  "SURVEY",
  "SOCIAL",
  "PROXY",
  "OFFERWALL",
  "APPINSTALL",
  "BOARD",
  "MANUAL",
  "CUSTOM",
  // Feed engagement (counted from SocialActionLog, admin-gated)
  "SOCIAL_LIKE",
  "SOCIAL_COMMENT",
  "SOCIAL_POST",
  "SOCIAL_SHARE",
  "SOCIAL_VOTE",
  // Platform activity (counted from their own tables)
  "LOTTERY_TICKET",
  "GAME_PLAY",
  "REFERRAL_SIGNUP",
  "COURSE_LESSON",
  "MARKETPLACE_PURCHASE",
] as const;

export type MissionTaskType = (typeof MISSION_TASK_TYPES)[number];

/** Where a mission task type sends the user to make progress. */
export const TYPE_TO_ROUTE: Record<string, string> = {
  ARTICLE: "/article-tasks",
  VIDEO: "/video-tasks",
  QUIZ: "/quiz-tasks",
  SURVEY: "/quiz-tasks",
  SOCIAL: "/social-tasks",
  PROXY: "/proxy-tasks",
  OFFERWALL: "/earn#offerwall",
  APPINSTALL: "/tasks",
  BOARD: "/board-tasks",
  MANUAL: "/manual-tasks",
  CUSTOM: "/manual-tasks",
  // Social-feed engagement goals → the feed
  SOCIAL_LIKE: "/social",
  SOCIAL_COMMENT: "/social",
  SOCIAL_POST: "/social",
  SOCIAL_SHARE: "/social",
  SOCIAL_VOTE: "/social",
  // Platform activity
  LOTTERY_TICKET: "/lottery",
  GAME_PLAY: "/games",
  REFERRAL_SIGNUP: "/referrals",
  COURSE_LESSON: "/my-learning",
  MARKETPLACE_PURCHASE: "/marketplace",
};

/** Human label for each mission task type. */
export const TYPE_LABEL: Record<string, string> = {
  ARTICLE: "Read article",
  VIDEO: "Watch video",
  QUIZ: "Complete quiz",
  SURVEY: "Complete survey",
  SOCIAL: "Social task",
  PROXY: "Proxy session",
  OFFERWALL: "Offerwall offer",
  APPINSTALL: "Install an app",
  BOARD: "Board task",
  MANUAL: "Manual task",
  CUSTOM: "Custom task",
  SOCIAL_LIKE: "Like posts",
  SOCIAL_COMMENT: "Comment on posts",
  SOCIAL_POST: "Create posts",
  SOCIAL_SHARE: "Share posts",
  SOCIAL_VOTE: "Vote on polls",
  LOTTERY_TICKET: "Buy lottery tickets",
  GAME_PLAY: "Play games",
  REFERRAL_SIGNUP: "Invite a friend (verified)",
  COURSE_LESSON: "Finish course lessons",
  MARKETPLACE_PURCHASE: "Buy from the marketplace",
};

/**
 * How each type is counted, in plain English — shown to the admin next to the
 * type picker, because "why does my mission never complete?" is nearly always a
 * misunderstanding of the counting rule rather than a bug.
 */
export const TYPE_HINT: Record<string, string> = {
  BOARD: "Any approved task that belongs to a Task Board.",
  MANUAL: "Counted with Custom tasks — they share one bucket.",
  SOCIAL_LIKE:
    "Feed likes. Counts once per post if 'distinct post' is on in Social Earning, otherwise every like.",
  SOCIAL_COMMENT: "Feed comments, counted the same way as likes.",
  SOCIAL_POST: "Posts the user creates on the feed.",
  SOCIAL_SHARE: "Feed shares.",
  SOCIAL_VOTE: "Poll votes on the feed.",
  LOTTERY_TICKET: "Every ticket in a completed purchase. A failed purchase never counts.",
  GAME_PLAY:
    "One per play session that actually started. Opening the same game twice in one day counts twice, but a session with no play time still counts as one.",
  REFERRAL_SIGNUP:
    "Counts when someone signs up through the link AND verifies their email — not on the click.",
  COURSE_LESSON: "Each lesson marked complete.",
  MARKETPLACE_PURCHASE: "Each completed marketplace order.",
};

/** Display label for a mission item — the admin description if set, else the
 *  task-type label, else a generic fallback. */
export function missionItemLabel(
  taskType: string,
  description?: string | null
): string {
  return description?.trim() || TYPE_LABEL[taskType] || "Task";
}
