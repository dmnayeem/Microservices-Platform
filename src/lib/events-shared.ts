/**
 * Client-safe event constants (no prisma import) — shared by the server event
 * logic (src/lib/events.ts) and client UIs (admin builder + user events page).
 */

export type EventActionType =
  | "TEAM_ADD"
  | "TASK_COMPLETE"
  | "QUIZ_COMPLETE"
  | "LOTTERY_BUY"
  | "UPLOAD_PROOF"
  | "SOCIAL_ACTION"
  | "FEED_LIKE"
  | "FEED_COMMENT"
  | "FEED_SHARE"
  | "FEED_POST"
  | "FEED_VOTE"
  | "REFERRAL_SIGNUP";

/**
 * The single list both admin event routes validate against. It used to be
 * copy-pasted into each of them, which is exactly how one of two copies gets
 * missed when a value is added.
 */
export const EVENT_ACTION_TYPES: EventActionType[] = [
  "REFERRAL_SIGNUP",
  "TASK_COMPLETE",
  "QUIZ_COMPLETE",
  "LOTTERY_BUY",
  "FEED_LIKE",
  "FEED_COMMENT",
  "FEED_SHARE",
  "FEED_POST",
  "FEED_VOTE",
  "UPLOAD_PROOF",
  "TEAM_ADD",
  "SOCIAL_ACTION",
];

/** One reward tier of a multi-tier event (e.g. 10 invites → X, 20 → Y). */
export interface EventTier {
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
}

/** Coerce arbitrary JSON into a clean, ascending, de-duped tier list. */
export function parseEventTiers(raw: unknown): EventTier[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: EventTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const threshold = Math.floor(Number(o.threshold));
    if (!Number.isFinite(threshold) || threshold < 1 || seen.has(threshold))
      continue;
    seen.add(threshold);
    out.push({
      threshold,
      rewardPoints: Math.max(0, Math.floor(Number(o.rewardPoints)) || 0),
      rewardXp: Math.max(0, Math.floor(Number(o.rewardXp)) || 0),
    });
  }
  return out.sort((a, b) => a.threshold - b.threshold);
}

/**
 * Every hint states its DEDUP RULE, because that is the thing users and admins
 * both get wrong. Progress only ever counts actions taken after the event is
 * published — nothing retroactive.
 */
export const EVENT_ACTION_META: Record<
  EventActionType,
  { label: string; unit: string; hint: string; deprecated?: boolean }
> = {
  REFERRAL_SIGNUP: {
    label: "Invite signups (verified)",
    unit: "signups",
    hint: "Counts when someone opens your link AND creates an account AND verifies their email. Sharing the link alone doesn't count.",
  },
  TASK_COMPLETE: {
    label: "Complete tasks",
    unit: "tasks",
    hint: "Counts when a task is APPROVED, not when it's submitted. One per task submission.",
  },
  QUIZ_COMPLETE: {
    label: "Complete quizzes",
    unit: "quizzes",
    hint: "Counts when a quiz task is approved. One per submission.",
  },
  LOTTERY_BUY: {
    label: "Buy lottery tickets",
    unit: "tickets",
    hint: "Counts every ticket in a completed purchase. A failed purchase never counts.",
  },
  FEED_LIKE: {
    label: "Like feed posts",
    unit: "likes",
    hint: "Counts once per post. Unliking doesn't take the progress back, and re-liking doesn't add more. Your own posts never count.",
  },
  FEED_COMMENT: {
    label: "Comment on feed posts",
    unit: "posts",
    hint: "Counts once per post, however many comments you leave on it. Your own posts never count.",
  },
  FEED_SHARE: {
    label: "Share feed posts",
    unit: "shares",
    hint: "Counts once per post, on the first share. Your own posts never count.",
  },
  FEED_POST: {
    label: "Create feed posts",
    unit: "posts",
    hint: "Counts each public post you create. Set a daily cap — otherwise a user can just keep posting.",
  },
  FEED_VOTE: {
    label: "Vote in polls",
    unit: "polls",
    hint: "Counts once per poll, on your first vote. Changing your vote doesn't add more.",
  },
  UPLOAD_PROOF: {
    label: "Upload proof",
    unit: "upload",
    hint: "Upload the required image/screenshot. Note this is claimed on trust — there is no review step.",
  },
  TEAM_ADD: {
    label: "Invite to team (old)",
    unit: "members",
    hint: "Same as 'Invite signups (verified)'. Kept so existing events keep working — use the new one instead.",
    deprecated: true,
  },
  SOCIAL_ACTION: {
    label: "Social actions (old)",
    unit: "actions",
    hint: "Satisfied by ANY feed like, comment, share, post or vote — too broad to be useful. Pick the specific action instead.",
    deprecated: true,
  },
};
