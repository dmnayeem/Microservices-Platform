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
  | "SOCIAL_ACTION";

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

export const EVENT_ACTION_META: Record<
  EventActionType,
  { label: string; unit: string; hint: string }
> = {
  TEAM_ADD: { label: "Invite to team", unit: "members", hint: "New members you referred during the event." },
  TASK_COMPLETE: { label: "Complete tasks", unit: "tasks", hint: "Approved task completions during the event." },
  QUIZ_COMPLETE: { label: "Complete quizzes", unit: "quizzes", hint: "Quiz completions during the event." },
  LOTTERY_BUY: { label: "Buy lottery tickets", unit: "tickets", hint: "Lottery tickets bought during the event." },
  UPLOAD_PROOF: { label: "Upload proof", unit: "upload", hint: "Upload the required image/screenshot." },
  SOCIAL_ACTION: { label: "Social actions", unit: "actions", hint: "Likes/comments/shares/posts during the event." },
};
