/**
 * What kind of text a task box holds — caption, comment, reply, review,
 * question, answer or post text. Client-safe: the page labels its "Generate …"
 * buttons with it, and lib/ai-copy-text writes to it.
 */

export type CopyKind = "caption" | "comment" | "reply" | "review" | "question" | "answer" | "post";

export const COPY_KIND_LABEL: Record<CopyKind, string> = {
  caption: "caption",
  comment: "comment",
  reply: "reply",
  review: "review",
  question: "question",
  answer: "answer",
  post: "post text",
};

/** Which kind of text a box holds, from its field key and the action. */
export function copyKindFor(fieldKey: string, actionKey: string | null | undefined): CopyKind {
  const k = (actionKey ?? "").toUpperCase();
  if (/CAPTION/i.test(fieldKey)) return "caption";
  if (/REVIEW|RATE/.test(k)) return "review";
  if (/ANSWER/.test(k)) return "answer";
  if (/QUESTION|ASK/.test(k)) return "question";
  if (/REPLY/.test(k)) return "reply";
  if (fieldKey === "commentTemplate" || /COMMENT/.test(k)) return "comment";
  return "post";
}
