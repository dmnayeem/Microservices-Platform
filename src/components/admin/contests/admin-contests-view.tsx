"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Pencil, Plus, Trophy, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  CONTEST_PHASE_LABEL,
  CONTEST_PLATFORM_LABEL,
  CONTEST_PLATFORMS,
  type ContestPhase,
  type ContestPlatform,
} from "@/lib/contests";

interface ContestRow {
  id: string;
  title: string;
  description: string;
  rules: string | null;
  coverImage: string | null;
  platforms: string[];
  hashtag: string | null;
  startAt: string;
  endAt: string;
  votingEndsAt: string;
  voteWeightPct: number;
  minLevelToEnter: number;
  minLevelToVote: number;
  maxEntriesPerUser: number;
  prizes: { rank: number; points: number }[];
  participationPoints: number;
  status: string;
  phase: ContestPhase;
  pending: number;
  approved: number;
}
interface EntryRow {
  id: string;
  url: string;
  platform: string;
  caption: string | null;
  status: string;
  linkCheck: string | null;
  adminScore: number | null;
  votes: number;
  rank: number | null;
  prizePoints: number | null;
  rejectReason: string | null;
  user: { id: string; name: string | null; email: string; level: number } | null;
  live: { score: number; position: number } | null;
}

const inp = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60";
const local = (d: string | Date) => {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function AdminContestsView({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<ContestRow[] | null>(null);
  const [editing, setEditing] = useState<ContestRow | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/contests", { cache: "no-store" }).catch(() => null);
    const d = r && r.ok ? await r.json() : { contests: [] };
    setRows(d.contests ?? []);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const act = async (id: string, action: string) => {
    const r = await fetch(`/api/admin/contests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't update");
    toast.success(`Contest ${action}ed`);
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
            <Trophy className="h-6 w-6 text-amber-400" /> Creator Contests
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Members make a TikTok / Reel / Short / post about the platform and enter its link. You approve entries and
            score them 0–10; members vote; the final score mixes both. Prizes are points, paid when you pick the
            winners. Free to enter, judged on merit — no stake, no chance.
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setEditing("new")} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
            <Plus className="h-4 w-4" /> New contest
          </button>
        )}
      </div>

      {editing && (
        <ContestForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {rows === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">No contests yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{c.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {CONTEST_PHASE_LABEL[c.phase]} · {c.approved} approved · {c.pending} waiting · prizes{" "}
                    {c.prizes.map((p) => `${p.points}`).join(" / ")} pts
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(c.startAt).toLocaleString()} → {new Date(c.endAt).toLocaleString()} · voting until{" "}
                    {new Date(c.votingEndsAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className={`${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`}>
                    Entries ({c.pending + c.approved})
                  </button>
                  {canManage && c.status !== "FINISHED" && (
                    <button type="button" onClick={() => setEditing(c)} className={`${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`}>
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                  )}
                  {canManage && c.status === "DRAFT" && (
                    <button type="button" onClick={() => act(c.id, "publish")} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
                      Publish
                    </button>
                  )}
                  {canManage && c.status === "PUBLISHED" && (
                    <button type="button" onClick={() => confirm("Cancel this contest? No one is paid.") && act(c.id, "cancel")} className={`${btn} border border-red-500/40 text-red-300 hover:bg-red-500/10`}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {open === c.id && <EntriesPanel contest={c} canManage={canManage} onChanged={load} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContestForm({ initial, onClose, onSaved }: { initial: ContestRow | null; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [f, setF] = useState(() => ({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    rules: initial?.rules ?? "",
    hashtag: initial?.hashtag ?? "#RevType",
    platforms: (initial?.platforms ?? ["TIKTOK", "INSTAGRAM", "YOUTUBE", "FACEBOOK"]) as string[],
    startAt: local(initial?.startAt ?? now),
    endAt: local(initial?.endAt ?? new Date(now.getTime() + 14 * 86_400_000)),
    votingEndsAt: local(initial?.votingEndsAt ?? new Date(now.getTime() + 17 * 86_400_000)),
    voteWeightPct: String(initial?.voteWeightPct ?? 50),
    minLevelToEnter: String(initial?.minLevelToEnter ?? 0),
    minLevelToVote: String(initial?.minLevelToVote ?? 3),
    maxEntriesPerUser: String(initial?.maxEntriesPerUser ?? 1),
    prizes: (initial?.prizes ?? [{ rank: 1, points: 5000 }, { rank: 2, points: 3000 }, { rank: 3, points: 1500 }]).map((p) => String(p.points)),
    participationPoints: String(initial?.participationPoints ?? 50),
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        ...f,
        startAt: new Date(f.startAt).toISOString(),
        endAt: new Date(f.endAt).toISOString(),
        votingEndsAt: new Date(f.votingEndsAt).toISOString(),
        prizes: f.prizes.map((p, i) => ({ rank: i + 1, points: Number(p) })),
      };
      const r = await fetch(initial ? `/api/admin/contests/${initial.id}` : "/api/admin/contests", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't save");
      toast.success(initial ? "Contest saved" : "Contest created as a draft — publish it when ready");
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
        <h2 className="text-lg font-semibold text-white">{initial ? "Edit contest" : "New contest"}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Title</label>
          <input className={inp} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Best RevType Reel — October" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>What to make</label>
          <textarea className={inp} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Make a short video showing how you earn on RevType…" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Rules (optional)</label>
          <textarea className={inp} rows={3} value={f.rules} onChange={(e) => set({ rules: e.target.value })} placeholder="Your own original video, public, at least 15 seconds…" />
        </div>
        <div>
          <label className={label}>Hashtag the post must include</label>
          <input className={inp} value={f.hashtag} onChange={(e) => set({ hashtag: e.target.value })} />
        </div>
        <div>
          <label className={label}>Platforms</label>
          <div className="flex flex-wrap gap-2">
            {CONTEST_PLATFORMS.map((p) => (
              <label key={p} className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={f.platforms.includes(p)}
                  onChange={(e) => set({ platforms: e.target.checked ? [...f.platforms, p] : f.platforms.filter((x) => x !== p) })}
                />
                {CONTEST_PLATFORM_LABEL[p as ContestPlatform]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>Entries open</label>
          <input type="datetime-local" className={inp} value={f.startAt} onChange={(e) => set({ startAt: e.target.value })} />
        </div>
        <div>
          <label className={label}>Entries close</label>
          <input type="datetime-local" className={inp} value={f.endAt} onChange={(e) => set({ endAt: e.target.value })} />
        </div>
        <div>
          <label className={label}>Voting ends (then you pick winners)</label>
          <input type="datetime-local" className={inp} value={f.votingEndsAt} onChange={(e) => set({ votingEndsAt: e.target.value })} />
        </div>
        <div>
          <label className={label}>Votes count for (%) — the rest is your score</label>
          <input type="number" min={0} max={100} className={inp} value={f.voteWeightPct} onChange={(e) => set({ voteWeightPct: e.target.value })} />
        </div>
        <div>
          <label className={label}>Level needed to enter</label>
          <input type="number" min={0} className={inp} value={f.minLevelToEnter} onChange={(e) => set({ minLevelToEnter: e.target.value })} />
        </div>
        <div>
          <label className={label}>Level needed to vote</label>
          <input type="number" min={0} className={inp} value={f.minLevelToVote} onChange={(e) => set({ minLevelToVote: e.target.value })} />
        </div>
        <div>
          <label className={label}>Entries per member</label>
          <input type="number" min={1} max={10} className={inp} value={f.maxEntriesPerUser} onChange={(e) => set({ maxEntriesPerUser: e.target.value })} />
        </div>
        <div>
          <label className={label}>Points for every other approved entry</label>
          <input type="number" min={0} className={inp} value={f.participationPoints} onChange={(e) => set({ participationPoints: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Prizes (points) — 1st, 2nd, 3rd …</label>
          <div className="flex flex-wrap items-center gap-2">
            {f.prizes.map((p, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-xs text-slate-400">#{i + 1}</span>
                <input
                  type="number"
                  min={1}
                  className={`${inp} !w-28`}
                  value={p}
                  onChange={(e) => set({ prizes: f.prizes.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              </div>
            ))}
            <button type="button" onClick={() => set({ prizes: [...f.prizes, "500"] })} className="text-xs text-sky-300">+ add place</button>
            {f.prizes.length > 1 && (
              <button type="button" onClick={() => set({ prizes: f.prizes.slice(0, -1) })} className="text-xs text-slate-400">− remove last</button>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
        <button type="button" onClick={onClose} className={`${btn} border border-slate-700 text-slate-300`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EntriesPanel({ contest, canManage, onChanged }: { contest: ContestRow; canManage: boolean; onChanged: () => void }) {
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/contests/${contest.id}/entries`, { cache: "no-store" }).catch(() => null);
    const d = r && r.ok ? await r.json() : { entries: [] };
    setEntries(d.entries ?? []);
  }, [contest.id]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const patch = async (entryId: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/admin/contests/${contest.id}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, ...body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error ?? "Couldn't update");
    void load();
    onChanged();
  };

  const finalize = async () => {
    if (!confirm("Pick the winners now and pay the points? This can't be undone.")) return;
    setFinalizing(true);
    try {
      const r = await fetch(`/api/admin/contests/${contest.id}/finalize`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't finalize");
      toast.success(d.retried ? `Payouts re-run — ${d.paid} paid` : `Winners picked — ${d.paid} paid`);
      void load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't finalize");
    } finally {
      setFinalizing(false);
    }
  };

  const finished = contest.status === "FINISHED";
  const canFinalize = canManage && (finished || (contest.status === "PUBLISHED" && contest.phase === "judging"));

  return (
    <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
      {canFinalize && (
        <button type="button" onClick={finalize} disabled={finalizing} className={`${btn} bg-amber-600 text-white hover:bg-amber-500`}>
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
          {finished ? "Re-run payouts" : "Pick winners & pay"}
        </button>
      )}
      {entries === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500">No entries yet.</p>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="rounded-lg border border-slate-800 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">{e.user?.name ?? e.user?.email ?? "?"}</span>
              <span className="text-xs text-slate-500">L{e.user?.level ?? 0} · {e.platform}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${e.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" : e.status === "REJECTED" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{e.status}</span>
              <span className={`text-[11px] ${e.linkCheck === "OK" ? "text-emerald-400" : "text-amber-400"}`}>
                {e.linkCheck === "OK" ? "hashtag found" : e.linkCheck === "NO_HASHTAG" ? "hashtag missing" : "couldn't read — check by eye"}
              </span>
              <span className="text-xs text-slate-400">{e.votes} votes</span>
              {e.live && <span className="text-xs text-sky-300">score {e.live.score} · #{e.live.position}</span>}
              {e.rank && <span className="text-xs font-bold text-amber-300">placed #{e.rank} · {e.prizePoints} pts</span>}
              <a href={e.url} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-xs text-sky-300">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {e.caption && <p className="mt-1 text-xs text-slate-400">{e.caption}</p>}
            {canManage && !finished && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {e.status !== "APPROVED" && (
                  <button type="button" onClick={() => patch(e.id, { status: "APPROVED" })} className={`${btn} !py-1 bg-emerald-600/80 text-white`}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {e.status !== "REJECTED" && (
                  <button
                    type="button"
                    onClick={() => {
                      const reason = prompt("Why? (the member sees this)") ?? "";
                      void patch(e.id, { status: "REJECTED", rejectReason: reason });
                    }}
                    className={`${btn} !py-1 border border-red-500/40 text-red-300`}
                  >
                    Reject
                  </button>
                )}
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  Score
                  <select
                    value={e.adminScore ?? ""}
                    onChange={(ev) => patch(e.id, { adminScore: ev.target.value === "" ? null : Number(ev.target.value) })}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-white"
                  >
                    <option value="">—</option>
                    {Array.from({ length: 11 }, (_, n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  / 10
                </label>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
