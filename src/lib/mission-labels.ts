// Shared daily-mission task-type maps + label helper. Client-safe (no imports),
// so both the mission page and the feed rail widget can label items identically.

/** Where a mission task type sends the user to make progress. */
export const TYPE_TO_ROUTE: Record<string, string> = {
  ARTICLE: "/article-tasks",
  VIDEO: "/video-tasks",
  QUIZ: "/quiz-tasks",
  SURVEY: "/quiz-tasks",
  SOCIAL: "/social-tasks",
  PROXY: "/proxy-tasks",
  OFFERWALL: "/earn#offerwall",
  BOARD: "/board-tasks",
  MANUAL: "/manual-tasks",
  CUSTOM: "/manual-tasks",
  // Social-feed engagement goals → the feed
  SOCIAL_LIKE: "/social",
  SOCIAL_COMMENT: "/social",
  SOCIAL_POST: "/social",
  SOCIAL_SHARE: "/social",
  SOCIAL_VOTE: "/social",
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
  BOARD: "Board task",
  MANUAL: "Manual task",
  CUSTOM: "Custom task",
  SOCIAL_LIKE: "Like posts",
  SOCIAL_COMMENT: "Comment on posts",
  SOCIAL_POST: "Create posts",
  SOCIAL_SHARE: "Share posts",
  SOCIAL_VOTE: "Vote on polls",
};

/** Display label for a mission item — the admin description if set, else the
 *  task-type label, else a generic fallback. */
export function missionItemLabel(
  taskType: string,
  description?: string | null
): string {
  return description?.trim() || TYPE_LABEL[taskType] || "Task";
}
