import { parseQuestions } from "@/lib/feedback";

/** A feedback round's fields from the admin form, or an error message. */
export function parseRound(raw: unknown):
  | {
      ok: true;
      value: {
        title: string;
        intro: string | null;
        questions: unknown;
        startAt: Date;
        endAt: Date;
        rewardPoints: number;
        minLevel: number;
      };
    }
  | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = String(r.title ?? "").trim().slice(0, 120);
  if (title.length < 3) return { ok: false, error: "Give the round a title." };
  const q = parseQuestions(r.questions);
  if (!q.ok) return q;
  const startAt = new Date(String(r.startAt ?? ""));
  const endAt = new Date(String(r.endAt ?? ""));
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || !(startAt < endAt)) {
    return { ok: false, error: "Set a start and an end (end after start)." };
  }
  const reward = Math.round(Number(r.rewardPoints ?? 0));
  if (!Number.isFinite(reward) || reward < 0 || reward > 100_000) {
    return { ok: false, error: "Reward is 0–100,000 points." };
  }
  const minLevel = Math.max(0, Math.min(200, Math.round(Number(r.minLevel ?? 0)) || 0));
  return {
    ok: true,
    value: {
      title,
      intro: String(r.intro ?? "").trim().slice(0, 2000) || null,
      questions: q.value,
      startAt,
      endAt,
      rewardPoints: reward,
      minLevel,
    },
  };
}
