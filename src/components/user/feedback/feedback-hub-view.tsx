"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Lightbulb, Loader2, MessageSquareHeart, Rocket, Star, ThumbsUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";
import { IDEA_STATUS_LABEL, MIN_TEXT_ANSWER, type FeedbackQuestion, type IdeaStatus } from "@/lib/feedback";

interface Round {
  id: string;
  title: string;
  intro: string | null;
  questions: FeedbackQuestion[];
  endAt: string;
  rewardPoints: number;
  minLevel: number;
  answered: boolean;
}
interface Idea {
  id: string;
  title: string;
  body: string | null;
  status: IdeaStatus;
  votes: number;
  adminNote: string | null;
  mine: boolean;
  voted: boolean;
}
interface Shipped {
  id: string;
  title: string;
  body: string | null;
  votes: number;
  adminNote: string | null;
  shippedAt: string | null;
}

type Tab = "round" | "ideas" | "shipped";

export function FeedbackHubView() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = sp.get("tab");
    return t === "ideas" || t === "shipped" ? t : "round";
  });
  const [data, setData] = useState<{ round: Round | null; ideas: Idea[]; shipped: Shipped[] } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/feedback", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const tabs: { key: Tab; label: string; icon: typeof Star }[] = [
    { key: "round", label: "This month", icon: MessageSquareHeart },
    { key: "ideas", label: "Ideas", icon: Lightbulb },
    { key: "shipped", label: "You asked, we built", icon: Rocket },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="t-title text-white">Feedback</h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Tell us what to improve, suggest features, and vote for the ones you want. We build the most-wanted ones.
        </p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "app-tap-row inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold",
              tab === t.key ? "app-accent-soft" : "border-(--app-line) bg-(--app-surface) text-(--app-ink-3)"
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-(--app-accent-ink)" />
      ) : tab === "round" ? (
        <RoundForm round={data.round} onDone={load} />
      ) : tab === "ideas" ? (
        <IdeasBoard ideas={data.ideas} onChanged={load} />
      ) : (
        <ShippedList items={data.shipped} />
      )}
    </div>
  );
}

function RoundForm({ round, onDone }: { round: Round | null; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  if (!round) {
    return <div className="app-card text-center text-sm text-(--app-ink-3)">No feedback round is open right now — the next one opens soon.</div>;
  }
  if (round.answered) {
    return (
      <div className="app-card text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
        <p className="mt-2 font-bold text-white">Thank you — your feedback is in.</p>
        <p className="t-meta text-(--app-ink-3)">Meanwhile, post an idea or vote on the Ideas tab.</p>
      </div>
    );
  }
  const set = (id: string, v: string | number) => setAnswers((a) => ({ ...a, [id]: v }));
  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: round.id, answers }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't send");
      toast.success("Thank you for your feedback!", d.rewarded ? { description: `+${pts(d.rewarded)} pts added` } : undefined);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-card space-y-5">
      <div>
        <h2 className="text-lg font-black text-white">{round.title}</h2>
        {round.intro && <p className="mt-1 whitespace-pre-line text-sm text-(--app-ink-2)">{round.intro}</p>}
        <p className="t-meta mt-1 text-(--app-ink-3)">
          Open until {new Date(round.endAt).toLocaleDateString()}
          {round.rewardPoints > 0 ? ` · ${pts(round.rewardPoints)} pts for a complete answer` : ""}
        </p>
      </div>
      {round.questions.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <p className="text-sm font-bold text-white">
            {i + 1}. {q.label} {q.required && <span className="text-red-400">*</span>}
          </p>
          {q.type === "RATING" && (
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => set(q.id, n)} aria-label={`${n} stars`}>
                  <Star className={cn("h-8 w-8", Number(answers[q.id] ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-(--app-ink-3)")} />
                </button>
              ))}
            </div>
          )}
          {q.type === "NPS" && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set(q.id, n)}
                  className={cn(
                    "h-9 w-9 rounded-lg border text-sm font-bold",
                    answers[q.id] === n ? "app-accent" : "border-(--app-line) bg-(--app-surface-2) text-(--app-ink-2)"
                  )}
                >
                  {n}
                </button>
              ))}
              <p className="w-full text-[11px] text-(--app-ink-3)">0 = not at all · 10 = definitely</p>
            </div>
          )}
          {q.type === "CHOICE" && (
            <div className="space-y-1.5">
              {(q.options ?? []).map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm text-(--app-ink-2)">
                  <input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => set(q.id, o)} /> {o}
                </label>
              ))}
            </div>
          )}
          {q.type === "TEXT" && (
            <>
              <textarea
                rows={3}
                value={String(answers[q.id] ?? "")}
                onChange={(e) => set(q.id, e.target.value)}
                className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2 text-sm text-(--app-ink)"
              />
              {q.required && <p className="text-[11px] text-(--app-ink-3)">At least {MIN_TEXT_ANSWER} characters.</p>}
            </>
          )}
        </div>
      ))}
      <button type="button" onClick={send} disabled={busy} className="app-accent inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send feedback
      </button>
    </div>
  );
}

function IdeasBoard({ ideas, onChanged }: { ideas: Idea[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const post = async () => {
    setBusy("post");
    try {
      const r = await fetch("/api/feedback/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't post");
      toast.success("Idea posted — others can vote for it now");
      setTitle("");
      setBody("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post");
    } finally {
      setBusy(null);
    }
  };

  const vote = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/feedback/ideas/${id}/vote`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't vote");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't vote");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card space-y-2">
        <h2 className="t-section text-white">Suggest a feature</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Your idea in one line" className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2.5 text-sm text-(--app-ink)" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder="Why would it help? (optional)" className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2 text-sm text-(--app-ink)" />
        <button type="button" onClick={post} disabled={busy === "post" || title.trim().length < 8} className="app-accent inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-60">
          {busy === "post" && <Loader2 className="h-4 w-4 animate-spin" />} Post idea
        </button>
      </div>
      {ideas.length === 0 ? (
        <div className="app-card text-center text-sm text-(--app-ink-3)">No ideas yet — be the first.</div>
      ) : (
        <ul className="space-y-2">
          {ideas.map((i) => (
            <li key={i.id} className="app-card flex items-start gap-3 !p-3">
              <button
                type="button"
                onClick={() => vote(i.id)}
                disabled={i.mine || busy !== null}
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center rounded-xl border py-1.5 text-xs font-black disabled:opacity-60",
                  i.voted ? "border-(--app-accent-edge) bg-(--app-nav-wash) text-(--app-accent-ink)" : "border-(--app-line) text-(--app-ink-2)"
                )}
                aria-label={i.voted ? "Take back vote" : "Vote"}
              >
                <ThumbsUp className="h-4 w-4" />
                {i.votes}
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white">{i.title}</p>
                {i.body && <p className="mt-0.5 text-sm text-(--app-ink-2)">{i.body}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-(--app-surface-2) px-2 py-0.5 font-bold text-(--app-ink-2)">{IDEA_STATUS_LABEL[i.status]}</span>
                  {i.mine && <span className="text-(--app-ink-3)">Your idea</span>}
                  {i.adminNote && <span className="text-sky-300">Team: {i.adminNote}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShippedList({ items }: { items: Shipped[] }) {
  if (items.length === 0) {
    return <div className="app-card text-center text-sm text-(--app-ink-3)">Ideas you vote for land here once we build them.</div>;
  }
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s.id} className="app-card !p-3">
          <p className="inline-flex items-center gap-2 font-bold text-white">
            <Rocket className="h-4 w-4 text-emerald-400" /> {s.title}
          </p>
          {s.adminNote && <p className="mt-1 text-sm text-(--app-ink-2)">{s.adminNote}</p>}
          <p className="t-meta mt-1 text-(--app-ink-3)">
            {s.votes} votes{s.shippedAt ? ` · shipped ${new Date(s.shippedAt).toLocaleDateString()}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
