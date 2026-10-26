"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flag, Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { promptDialog } from "@/lib/confirm";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { MILESTONE_STATUSES, PROJECT_STATUSES, STATUS_LABEL } from "@/lib/work/model";
import { OverdueBadge, ProgressBar, StatusBadge, btnGhost, btnPrimary, card, fmtDate, input, label, Note, workFetch } from "./ui";
import { TaskList } from "./work-app";

interface Milestone {
  id: string; title: string; description: string | null; status: string; progressMode: string; manualProgress: number; acceptance: string | null;
  dueAt: string | null; percent: number; tasks: number; completedTasks: number; overdue: boolean; owner: { name: string } | null; blockedBy: { id: string; title: string } | null;
}
interface ProjectData {
  project: { id: string; code: string; title: string; description: string | null; status: string; priority: string; dueAt: string | null; startAt: string | null; lead: { name: string } | null };
  canManage: boolean;
  partial: boolean;
  summary: { tasks: number; completed: number; overdue: number; percent: number };
  milestones: Milestone[];
  activity: Array<{ id: string; summary: string; createdAt: string; actor: string | null }>;
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const [d, setD] = useState<ProjectData | null>(null);
  const [missing, setMissing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [m, setM] = useState({ title: "", dueAt: "", progressMode: "TASKS", acceptance: "", dependsOnId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    workFetch<ProjectData>(`/api/admin/work/projects/${projectId}`).then(setD).catch(() => setMissing(true));
  }, [projectId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const patch = async (body: Record<string, unknown>, ok = "Saved") => {
    try {
      await workFetch(`/api/admin/work/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(ok);
      load();
      return true;
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
      return false;
    }
  };

  const setMilestoneStatus = async (ms: Milestone, status: string) => {
    let reason: string | undefined;
    if (status === "COMPLETED" && ms.blockedBy) {
      const r = await promptDialog({ title: `It depends on "${ms.blockedBy.title}", which isn't completed. Why complete it anyway?`, required: true, confirmLabel: "Complete" });
      if (!r?.trim()) return;
      reason = r.trim();
    }
    await patch({ milestone: { id: ms.id, status, reason } }, "Milestone updated");
  };

  if (missing) return <Note>This project doesn&apos;t exist or isn&apos;t shared with you.</Note>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const p = d.project;

  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{p.code}</span>
          {d.canManage ? (
            <select value={p.status} onChange={(e) => void patch({ status: e.target.value })} className={`${input} w-auto py-1 text-xs`} aria-label="Project status">
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          ) : <StatusBadge status={p.status} />}
        </div>
        <h1 className="mt-2 text-xl font-bold text-white">{p.title}</h1>
        {p.description && <div className="prose prose-invert prose-sm mt-2 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(p.description) }} />}
        <div className="mt-3 flex items-center gap-2"><ProgressBar percent={d.summary.percent} /><span className="text-sm font-bold tabular-nums text-white">{d.summary.percent}%</span></div>
        <p className="mt-2 text-xs text-slate-400">
          {d.summary.completed}/{d.summary.tasks} tasks completed{d.summary.overdue > 0 && <span className="text-red-300"> · {d.summary.overdue} overdue</span>} · due {fmtDate(p.dueAt)}{p.lead && <> · lead {p.lead.name}</>}
        </p>
        {d.partial && <p className="mt-1 text-[11px] text-slate-500">Figures are counted over the tasks you can see.</p>}
      </section>

      <section className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Flag className="h-4 w-4 text-blue-400" />Milestones</h2>
          {d.canManage && <button onClick={() => setAdding((v) => !v)} className={btnGhost}><Plus className="h-4 w-4" />Add milestone</button>}
        </div>
        {adding && (
          <div className="mb-3 grid gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={label}>Title</label><input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} className={input} /></div>
            <div><label className={label}>Deadline</label><input type="date" value={m.dueAt} onChange={(e) => setM({ ...m, dueAt: e.target.value })} className={input} /></div>
            <div><label className={label}>Progress from</label>
              <select value={m.progressMode} onChange={(e) => setM({ ...m, progressMode: e.target.value })} className={input}>
                <option value="TASKS">Its linked tasks (average)</option>
                <option value="MANUAL">Set by hand</option>
              </select>
            </div>
            <div><label className={label}>Depends on</label>
              <select value={m.dependsOnId} onChange={(e) => setM({ ...m, dependsOnId: e.target.value })} className={input}>
                <option value="">— Nothing —</option>
                {d.milestones.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className={label}>Acceptance criteria / deliverable</label><textarea rows={2} value={m.acceptance} onChange={(e) => setM({ ...m, acceptance: e.target.value })} className={input} /></div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className={btnGhost}>Cancel</button>
              <button
                disabled={saving || m.title.trim().length < 2}
                onClick={async () => {
                  setSaving(true);
                  const ok = await patch({ addMilestone: { title: m.title, progressMode: m.progressMode, acceptance: m.acceptance || null, dependsOnId: m.dependsOnId || null, dueAt: m.dueAt ? new Date(m.dueAt).toISOString() : null } }, "Milestone added");
                  setSaving(false);
                  if (ok) { setAdding(false); setM({ title: "", dueAt: "", progressMode: "TASKS", acceptance: "", dependsOnId: "" }); }
                }}
                className={btnPrimary}
              >Add</button>
            </div>
          </div>
        )}
        {d.milestones.length === 0 ? <p className="text-sm text-slate-500">No milestones yet.</p> : (
          <ol className="space-y-3">
            {d.milestones.map((ms) => (
              <li key={ms.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{ms.title}</span>
                  {d.canManage ? (
                    <select value={ms.status} onChange={(e) => void setMilestoneStatus(ms, e.target.value)} className={`${input} w-auto py-1 text-xs`} aria-label="Milestone status">
                      {MILESTONE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
                    </select>
                  ) : <StatusBadge status={ms.status} />}
                  {ms.overdue && <OverdueBadge />}
                </div>
                <div className="mt-2 flex items-center gap-2"><ProgressBar percent={ms.percent} /><span className="text-xs tabular-nums text-slate-300">{ms.percent}%</span></div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {ms.progressMode === "MANUAL" ? "Set by hand" : `${ms.completedTasks}/${ms.tasks} linked tasks completed`} · due {fmtDate(ms.dueAt)}{ms.owner && <> · {ms.owner.name}</>}
                </p>
                {ms.blockedBy && <p className="mt-1 text-xs text-amber-300">Waiting on &quot;{ms.blockedBy.title}&quot;</p>}
                {ms.acceptance && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">Deliverable: {ms.acceptance}</p>}
                {d.canManage && ms.progressMode === "MANUAL" && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">Progress
                    <input type="range" min={0} max={100} step={5} defaultValue={ms.manualProgress} onMouseUp={(e) => void patch({ milestone: { id: ms.id, manualProgress: Number((e.target as HTMLInputElement).value) } })} onTouchEnd={(e) => void patch({ milestone: { id: ms.id, manualProgress: Number((e.target as HTMLInputElement).value) } })} className="flex-1" />
                  </label>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-[11px] text-slate-500">A milestone is never completed automatically when its tasks reach 100% — its manager marks it.</p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Tasks</h2>
          <Link href={`/admin/work/tasks/new?project=${p.id}`} className={btnGhost}><Plus className="h-4 w-4" />New task here</Link>
        </div>
        <TaskList fixedScope="all" projectId={p.id} />
      </section>

      {d.activity.length > 0 && (
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold text-white">Project history</h2>
          <ul className="space-y-1.5 text-xs">
            {d.activity.map((x) => <li key={x.id} className="text-slate-400"><b className="text-slate-200">{x.actor ?? "System"}</b> {x.summary} · {fmtDate(x.createdAt, true)}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
