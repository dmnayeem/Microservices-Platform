"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageCircleQuestion, Pin, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";

interface Question {
  id: string;
  question: string;
  answer: string | null;
  answeredAt: Date | null;
  isPinned: boolean;
  createdAt: Date;
  asker: { id: string; name: string | null; avatar: string | null };
  answeredBy: { id: string; name: string | null; avatar: string | null } | null;
}

interface Props {
  courseId: string;
  initial: Question[];
  isEnrolled: boolean;
  viewerId: string;
  tutorId: string | null;
}

export function CourseQA({ courseId, initial, isEnrolled, viewerId, tutorId }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const isTutor = viewerId === tutorId;

  const ask = async () => {
    if (!draft.trim() || draft.trim().length < 10) {
      toast.error("Question must be at least 10 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: draft.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Question posted");
      setDraft("");
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5 text-fuchsia-300" />
          Q&amp;A
        </h2>
        <p className="text-xs text-gray-500">
          {initial.length} question{initial.length === 1 ? "" : "s"}
        </p>
      </div>

      {isEnrolled ? (
        <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Ask the tutor a question…"
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-fuchsia-500 resize-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={ask}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Post question
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 italic">
          Enrol to ask the tutor a question.
        </p>
      )}

      {initial.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No questions yet. Be the first to ask.
        </p>
      ) : (
        <ul className="space-y-3">
          {initial.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              courseId={courseId}
              canAnswer={isTutor}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionCard({
  q,
  courseId,
  canAnswer,
}: {
  q: Question;
  courseId: string;
  canAnswer: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!answer.trim() || answer.trim().length < 5) {
      toast.error("Answer too short");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/courses/${courseId}/questions/${q.id}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: answer.trim() }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Answer posted");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-gray-800 bg-gray-950 p-3">
      <div className="flex items-center gap-2">
        <Avatar
          src={q.asker.avatar}
          size={28}
          fallbackStyle="solid-gray"
          fallbackText={(q.asker.name ?? "?").slice(0, 1).toUpperCase()}
        />
        <p className="text-sm text-white font-bold">{q.asker.name ?? "—"}</p>
        {q.isPinned && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300 font-bold uppercase tracking-wider">
            <Pin className="w-3 h-3" /> Pinned
          </span>
        )}
        <span className="ml-auto text-[11px] text-gray-500">
          {formatDistanceToNow(q.createdAt, { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap">{q.question}</p>

      {q.answer ? (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5">
            {q.answeredBy?.avatar ? (
              <span className="relative inline-block w-5 h-5 rounded-full overflow-hidden bg-gray-800">
                <SmartImage
                  src={q.answeredBy.avatar}
                  alt=""
                  fill
                  sizes="20px"
                  className="object-cover"
                />
              </span>
            ) : null}
            {q.answeredBy?.name ?? "Tutor"} answered
          </p>
          <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">
            {q.answer}
          </p>
        </div>
      ) : canAnswer ? (
        editing ? (
          <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              maxLength={4000}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-fuchsia-500 resize-none"
              placeholder="Your answer"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Post answer
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-xs font-bold text-fuchsia-300 hover:text-fuchsia-200"
          >
            Answer this →
          </button>
        )
      ) : null}
    </li>
  );
}
