import type { ArticleConfig } from "@/lib/article-tasks";

/**
 * Can a user actually finish this task, and get paid for it?
 *
 * The admin task form already validates the three types that carry a rich
 * config — APPINSTALL, CUSTOM and SOCIAL — but VIDEO, ARTICLE and QUIZ had no
 * gate at all, and nothing anywhere enforced a reward above zero. A live audit
 * found the result sitting in production: 8 ACTIVE video tasks paying 0 points
 * and 0 XP, 6 ACTIVE article tasks with no article to read, and a video task
 * with no video. Every one of them was visible to every user, who could open
 * it, follow it as far as it went, and get nothing.
 *
 * This is the one gate, applied on create AND on update — a task that passes
 * creation and is then edited into an unfinishable state is the same broken
 * task, and the edit path is the easier one to forget.
 *
 * It deliberately checks what the PLAYER reads, not what the column is named: a
 * VIDEO plays `videoConfig.videoUrl || contentUrl`, an ARTICLE runs off
 * `articleConfig.pages` (key-pool mode) or its legacy `links`, and a QUIZ with
 * no stored questions falls back to AI generation — so an empty `questions` is
 * only fatal when no key is configured to generate them.
 */

export interface TaskCompletabilityInput {
  type: string;
  pointsReward?: number | string | null;
  xpReward?: number | string | null;
  contentUrl?: string | null;
  questions?: unknown;
  videoConfig?: unknown;
  articleConfig?: unknown;
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns a human-readable reason the task could not be completed, or null when
 * it is fine. The string is shown to the admin, so it says what to add.
 */
export function taskCompletabilityError(
  input: TaskCompletabilityInput,
  opts: { aiQuizAvailable?: boolean } = {}
): string | null {
  const points = num(input.pointsReward);
  const xp = num(input.xpReward);

  if (points < 0 || xp < 0) {
    return "Rewards cannot be negative.";
  }
  // A task worth nothing is not a task — the user does the work and the wallet
  // does not move. Either value alone is enough to make it worth doing.
  if (points === 0 && xp === 0) {
    return "This task pays nothing. Set a points reward or an XP reward above zero.";
  }

  if (input.type === "VIDEO") {
    const cfg = input.videoConfig as { videoUrl?: string } | null | undefined;
    if (!cfg?.videoUrl?.trim() && !input.contentUrl?.trim()) {
      return "A video task needs a video URL.";
    }
  }

  if (input.type === "ARTICLE") {
    const cfg = input.articleConfig as Partial<ArticleConfig> | null | undefined;
    const hasPages = (cfg?.pages ?? []).some((p) => p?.url?.trim());
    const hasLinks = (cfg?.links ?? []).some((l) => l?.url?.trim());
    if (!hasPages && !hasLinks && !input.contentUrl?.trim()) {
      return "An article task needs at least one article URL.";
    }
  }

  if (input.type === "QUIZ") {
    const qs = input.questions;
    const stored = Array.isArray(qs) && qs.length > 0;
    // Only fatal when nothing can stand in for the missing questions.
    if (!stored && !opts.aiQuizAvailable) {
      return "A quiz task needs questions (AI generation is not configured, so they cannot be generated on demand).";
    }
  }

  return null;
}
