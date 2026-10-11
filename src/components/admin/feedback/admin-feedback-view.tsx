"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, MessageSquareHeart, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABEL,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  type FeedbackQuestion,
  type IdeaStatus,
  type QuestionType,
} from "@/lib/feedback";

interface RoundRow {
  id: string;
  title: string;
  intro: string | null;
  questions: FeedbackQuestion[];
  startAt: string;
  endAt: string;
  rewardPoints: number;
  minLevel: number;
  status: string;
  responses: number;
}
interface IdeaRow {
  id: string;
  title: string;
  body: string | null;
  status: IdeaStatus;
  votes: number;
  adminNote: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}
type Summary =
  | { id: string; type: "RATING" | "NPS"; label: string; count: number; average: number | null; nps: number | null }
  | { id: string; type: "CHOICE"; label: string; count: number; counts: Record<string, number> }
  | { id: string; type: "TEXT"; label: string; count: number; answers: string[] };

const inp = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60";
const local = (d: string | Date) => {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const STARTER: FeedbackQuestion[] = [
  { id: "overall", type: "RATING", label: "How happy are you with RevType this month?", required: true },
  { id: "recommend", type: "NPS", label: "How likely are you to recommend RevType to a friend?", required: true },
  { id: "best", type: "CHOICE", label: "What do you use most?", options: ["Tasks", "Feed", "Courses", "Marketplace", "Games"], required: true },
  { id: "improve", type: "TEXT", label: "What one thing should we improve or add next?", required: true },
];

export function AdminFeedbackView({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<"rounds" | "ideas">("rounds");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
          <MessageSquareHeart className="h-6 w-6 text-pink-400" /> Feedback
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          A monthly feedback form (with a small reward for a complete answer) and a public idea board members vote on.
          Mark an idea Shipped and its author and voters are told — &ldquo;you asked, we built it&rdquo;.
        </p>
      </div>
      <div className="flex gap-2">
        {(["rounds", "ideas"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`${btn} ${tab === t ? "bg-slate-700 text-white" : "border border-slate-700 text-slate-300"}`}>
            {t === "rounds" ? "Monthly rounds" : "Idea board"}
          </button>
        ))}
      </div>
      {tab === "rounds" ? <Rounds canManage={canManage} /> : <Ideas canManage={canManage} />}
    </div>
  );
}

function Rounds({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<RoundRow[] | null>(null);
  const [editing, setEditing] = useState<RoundRow | "new" | null>(null);
  const [results, setResults] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/feedback", { cache: "no-store" }).catch(() => null);
    setRows(r?.ok ? (await r.json()).rounds ?? [] : []);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const act = async (id: string, action: string) => {
    const r = await fetch(`/api/admin/feedback/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't update");
    void load();
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <button type="button" onClick={() => setEditing("new")} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
          <Plus className="h-4 w-4" /> New round
        </button>
      )}
      {editing && (
        <RoundForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {rows === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No rounds yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{r.title}</p>
                <p className="text-xs text-slate-400">
                  {r.status} · {r.responses} responses · {r.rewardPoints} pts reward · {new Date(r.startAt).toLocaleDateString()} → {new Date(r.endAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setResults(results === r.id ? null : r.id)} className={`${btn} border border-slate-700 text-slate-200`}>Results</button>
                <a href={`/api/admin/feedback/${r.id}?format=csv`} className={`${btn} border border-slate-700 text-slate-200`}>
                  <Download className="h-4 w-4" /> CSV
                </a>
                {canManage && (
                  <>
                    <button type="button" onClick={() => setEditing(r)} className={`${btn} border border-slate-700 text-slate-200`}>
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    {r.status !== "PUBLISHED" ? (
                      <button type="button" onClick={() => act(r.id, "publish")} className={`${btn} bg-emerald-600 text-white`}>Publish</button>
                    ) : (
                      <button type="button" onClick={() => act(r.id, "close")} className={`${btn} border border-slate-700 text-slate-200`}>Close</button>
                    )}
                  </>
                )}
              </div>
            </div>
            {results === r.id && <Results id={r.id} />}
          </div>
        ))
      )}
    </div>
  );
}

function Results({ id }: { id: string }) {
  const [data, setData] = useState<{ responses: number; summary: Summary[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/feedback/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [id]);
  if (!data) return <Loader2 className="mt-3 h-5 w-5 animate-spin text-slate-400" />;
  return (
    <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
      <p className="text-sm text-slate-300">{data.responses} responses</p>
      {data.summary.map((s) => (
        <div key={s.id} className="rounded-lg border border-slate-800 p-3">
          <p className="text-sm font-medium text-white">{s.label}</p>
          {(s.type === "RATING" || s.type === "NPS") && (
            <p className="mt-1 text-sm text-slate-300">
              Average <b>{s.average ?? "—"}</b>
              {s.type === "NPS" && s.nps != null && <> · NPS <b className={s.nps >= 0 ? "text-emerald-300" : "text-red-300"}>{s.nps}</b></>} · {s.count} answers
            </p>
          )}
          {s.type === "CHOICE" && (
            <div className="mt-2 space-y-1">
              {Object.entries(s.counts).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-32 truncate">{k}</span>
                  <div className="h-2 flex-1 rounded bg-slate-800">
                    <div className="h-2 rounded bg-sky-500" style={{ width: `${s.count ? (v / s.count) * 100 : 0}%` }} />
                  </div>
                  <span className="w-10 text-right">{v}</span>
                </div>
              ))}
            </div>
          )}
          {s.type === "TEXT" && (
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs text-slate-300">
              {s.answers.map((a, i) => (
                <li key={i} className="rounded bg-slate-800/60 px-2 py-1">{a}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function RoundForm({ initial, onClose, onSaved }: { initial: RoundRow | null; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [title, setTitle] = useState(initial?.title ?? `Feedback — ${now.toLocaleString("en-US", { month: "long", year: "numeric" })}`);
  const [intro, setIntro] = useState(initial?.intro ?? "Help us make RevType better — it takes two minutes.");
  const [startAt, setStartAt] = useState(local(initial?.startAt ?? now));
  const [endAt, setEndAt] = useState(local(initial?.endAt ?? new Date(now.getTime() + 14 * 86_400_000)));
  const [rewardPoints, setReward] = useState(String(initial?.rewardPoints ?? 50));
  const [minLevel, setMinLevel] = useState(String(initial?.minLevel ?? 0));
  const [qs, setQs] = useState<FeedbackQuestion[]>(initial?.questions ?? STARTER);
  const [saving, setSaving] = useState(false);
  const setQ = (i: number, patch: Partial<FeedbackQuestion>) => setQs((x) => x.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(initial ? `/api/admin/feedback/${initial.id}` : "/api/admin/feedback", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, intro, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), rewardPoints, minLevel, questions: qs }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't save");
      toast.success(initial ? "Round saved" : "Round created as a draft — publish it when ready");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const label = "block text-xs font-medium text-slate-400 mb-1";
  return (
    <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{initial ? "Edit round" : "New round"}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={label}>Title</label><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={label}>Intro</label><textarea className={inp} rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} /></div>
        <div><label className={label}>Opens</label><input type="datetime-local" className={inp} value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
        <div><label className={label}>Closes</label><input type="datetime-local" className={inp} value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
        <div><label className={label}>Reward for a complete answer (points)</label><input type="number" min={0} className={inp} value={rewardPoints} onChange={(e) => setReward(e.target.value)} /></div>
        <div><label className={label}>Level needed</label><input type="number" min={0} className={inp} value={minLevel} onChange={(e) => setMinLevel(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">Questions</p>
        {qs.map((q, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-800 p-3">
            <div className="flex flex-wrap gap-2">
              <select className={`${inp} !w-56`} value={q.type} onChange={(e) => setQ(i, { type: e.target.value as QuestionType, options: e.target.value === "CHOICE" ? q.options ?? ["Option 1", "Option 2"] : undefined })}>
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
              </select>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                <input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Required
              </label>
              <button type="button" onClick={() => setQs((x) => x.filter((_, j) => j !== i))} className="ml-auto rounded-lg p-2 text-slate-400 hover:text-red-300" aria-label="Remove question">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input className={inp} value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder="The question" />
            {q.type === "CHOICE" && (
              <input className={inp} value={(q.options ?? []).join(", ")} onChange={(e) => setQ(i, { options: e.target.value.split(",").map((s) => s.trim()) })} placeholder="Choices, separated by commas" />
            )}
          </div>
        ))}
        <button type="button" onClick={() => setQs((x) => [...x, { id: `q${Date.now().toString(36)}`, type: "TEXT", label: "", required: false }])} className="text-xs text-sky-300">
          + add question
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
        <button type="button" onClick={onClose} className={`${btn} border border-slate-700 text-slate-300`}>Cancel</button>
      </div>
    </div>
  );
}

function Ideas({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<IdeaRow[] | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/feedback/ideas", { cache: "no-store" }).catch(() => null);
    setRows(r?.ok ? (await r.json()).ideas ?? [] : []);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const update = async (id: string, patch: { status?: string; adminNote?: string }) => {
    const r = await fetch("/api/admin/feedback/ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't update");
    if (d.told) toast.success(`Shipped — ${d.told} people told`);
    void load();
  };

  if (rows === null) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  if (rows.length === 0) return <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No ideas yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((i) => (
        <div key={i.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">{i.votes} votes</span>
            <span className="font-medium text-white">{i.title}</span>
            <span className="text-xs text-slate-500">by {i.user?.name ?? i.user?.email ?? "?"} · {new Date(i.createdAt).toLocaleDateString()}</span>
          </div>
          {i.body && <p className="mt-1 text-xs text-slate-400">{i.body}</p>}
          {canManage && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className={`${inp} !w-44`} value={i.status} onChange={(e) => update(i.id, { status: e.target.value })}>
                {IDEA_STATUSES.map((s) => <option key={s} value={s}>{IDEA_STATUS_LABEL[s]}</option>)}
              </select>
              <input
                className={`${inp} !w-auto flex-1`}
                defaultValue={i.adminNote ?? ""}
                placeholder="Note shown to members (optional)"
                onBlur={(e) => e.target.value !== (i.adminNote ?? "") && update(i.id, { adminNote: e.target.value })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
