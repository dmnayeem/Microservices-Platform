"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, FileUp, Loader2, Lock, MessageSquare, Pencil, Send, ShieldAlert, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog, promptDialog } from "@/lib/confirm";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, STATUS_LABEL, TASK_VISIBILITY, VISIBILITY_LABEL, WORK_PRIORITIES, type MemberRole } from "@/lib/work/model";
import { OverdueBadge, PriorityBadge, ProgressBar, StatusBadge, btnDanger, btnGhost, btnPrimary, card, fmtAgo, fmtDate, input, label, Note, workFetch } from "./ui";

type Person = { id: string; name: string; avatar: string | null } | null;
interface Target { targetId: string; label: string; unitLabel: string; quantity: number; originalQuantity: number; assigneeId: string | null; approved: number; pending: number; remaining: number; percent: number; over: number }
interface Detail {
  task: {
    id: string; code: string; title: string; summary: string | null; instructions: string | null; status: string; priority: string; visibility: string;
    targetMode: string; reviewRequired: boolean; evidenceRequired: boolean; acceptance: string | null; estimatedHours: number | null;
    startAt: string | null; dueAt: string | null; overdue: boolean; completedAt: string | null; closedReason: string | null; createdAt: string;
    createdBy: Person; manager: Person; project: { id: string; code: string; title: string } | null; milestone: { id: string; title: string; status: string } | null;
    dependsOn: { id: string; code: string; title: string; status: string } | null; category: string | null; team: { id: string; name: string } | null;
  };
  caps: { view: boolean; manage: boolean; report: boolean; review: boolean; privateNotes: boolean; memberRole: MemberRole | null };
  me: { userId: string; role: string | null; acceptedAt: string | null };
  members: Array<{ id: string; userId: string; role: MemberRole; acceptedAt: string | null; user: Person }>;
  progress?: { targets: Target[]; overall: number };
  overallMethod: string;
  reports: Array<{
    id: string; status: string; summary: string | null; inProgress: string | null; blockers: string | null; nextSteps: string | null; nextUpdateAt: string | null;
    links: string[]; attachments: Array<{ key: string; name: string }> | null; isFinal: boolean; createdAt: string; reviewedAt: string | null; reviewNote: string | null;
    lines: Array<{ targetId: string; quantity: number }>; author: Person; reviewer: Person;
  }>;
  comments: Array<{ id: string; kind: string; body: string; parentId: string | null; createdAt: string; author: Person }>;
  activity: Array<{ id: string; type: string; summary: string; createdAt: string; actor: Person }>;
  requests: Array<{ id: string; kind: string; message: string; status: string; createdAt: string; answeredAt: string | null; from: Person; to: Person }>;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function TaskDetail({ taskId }: { taskId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    workFetch<Detail>(`/api/admin/work/tasks/${taskId}`)
      .then(setD)
      .catch(() => setMissing(true));
  }, [taskId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (action: string, opts: { reason?: boolean; prompt?: string; confirm?: string } = {}) => {
    let reason: string | undefined;
    if (opts.reason) {
      const r = await promptDialog({ title: opts.prompt ?? "Reason", required: true, multiline: true, confirmLabel: "Continue" });
      if (!r?.trim()) return;
      reason = r.trim();
    } else if (opts.confirm && !(await confirmDialog({ title: opts.confirm, confirmLabel: "Yes" }))) return;
    setBusy(action);
    try {
      const r = await workFetch<{ waiting?: boolean }>(`/api/admin/work/tasks/${taskId}/action`, { method: "POST", body: JSON.stringify({ action, reason }) });
      if (action === "accept") toast.success(r.waiting ? "Accepted — waiting for the task it depends on" : "Accepted — you've started the task");
      else toast.success("Saved");
      load();
    } catch (e) {
      toast.error("Couldn't do that", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (missing) return <Note>This task doesn&apos;t exist or isn&apos;t shared with you.</Note>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const { task, caps } = d;
  const doer = caps.memberRole === "ASSIGNEE" || caps.memberRole === "COLLABORATOR";
  const open = ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "CHANGES_REQUESTED"].includes(task.status);
  const myOpenRequests = d.requests.filter((r) => r.status === "OPEN" && r.to?.id === d.me.userId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{task.code}</span>
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.overdue && <OverdueBadge />}
          {task.visibility === "PARTICIPANTS" && <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Lock className="h-3 w-3" /> Private</span>}
        </div>
        <h1 className="mt-2 text-xl font-bold text-white">{task.title}</h1>
        {task.summary && <p className="mt-1 text-sm text-slate-300">{task.summary}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <div><dt className="text-slate-500">Due</dt><dd className={cn("text-slate-200", task.overdue && "text-red-300")}>{fmtDate(task.dueAt, true)}</dd></div>
          <div><dt className="text-slate-500">Start</dt><dd className="text-slate-200">{fmtDate(task.startAt, true)}</dd></div>
          <div><dt className="text-slate-500">Assigned by</dt><dd className="text-slate-200">{task.createdBy?.name ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Manager</dt><dd className="text-slate-200">{task.manager?.name ?? task.createdBy?.name ?? "—"}</dd></div>
          {task.project && <div className="col-span-2"><dt className="text-slate-500">Project</dt><dd><Link href={`/admin/work/projects/${task.project.id}`} className="text-blue-400 hover:underline">{task.project.code} · {task.project.title}</Link>{task.milestone && <span className="text-slate-400"> › {task.milestone.title}</span>}</dd></div>}
          {task.team && <div><dt className="text-slate-500">Team</dt><dd className="text-slate-200">{task.team.name}</dd></div>}
          {task.category && <div><dt className="text-slate-500">Category</dt><dd className="text-slate-200">{task.category}</dd></div>}
          {task.estimatedHours != null && <div><dt className="text-slate-500">Estimate</dt><dd className="text-slate-200">{task.estimatedHours} h</dd></div>}
        </dl>
        {task.closedReason && <p className="mt-3 rounded-lg bg-slate-800/60 p-2 text-xs text-slate-300">{STATUS_LABEL[task.status]}: {task.closedReason}</p>}
        {task.dependsOn && task.dependsOn.status !== "COMPLETED" && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            Waiting on <Link href={`/admin/work/tasks/${task.dependsOn.id}`} className="underline">{task.dependsOn.code} {task.dependsOn.title}</Link> ({STATUS_LABEL[task.dependsOn.status]}) — it must be completed first.
            {caps.manage && <button onClick={() => act("override_dependency", { reason: true, prompt: "Why start without it?" })} className="ml-2 underline">Override</button>}
          </p>
        )}

        {/* Actions — only the ones this person may take */}
        <div className="mt-4 flex flex-wrap gap-2">
          {doer && !d.me.acceptedAt && open && (
            <button onClick={() => act("accept")} disabled={!!busy} className={btnPrimary}>{busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Accept &amp; Start</button>
          )}
          {doer && d.me.acceptedAt && ["IN_PROGRESS", "CHANGES_REQUESTED"].includes(task.status) && (
            <a href="#report" className={btnPrimary}><Send className="h-4 w-4" />Report progress</a>
          )}
          {(doer || caps.manage) && ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(task.status) && (
            <button onClick={() => act("block", { reason: true, prompt: "What is blocking the work?" })} disabled={!!busy} className={btnGhost}>Report a blocker</button>
          )}
          {(doer || caps.manage) && task.status === "BLOCKED" && <button onClick={() => act("resume")} disabled={!!busy} className={btnGhost}>Resume</button>}
          {doer && d.me.acceptedAt && ["IN_PROGRESS", "CHANGES_REQUESTED"].includes(task.status) && (
            <button onClick={() => act("submit_review", { confirm: "Hand the whole task in for final review?" })} disabled={!!busy} className={btnGhost}>Submit for final review</button>
          )}
          {caps.review && ["IN_PROGRESS", "IN_REVIEW"].includes(task.status) && (
            <button onClick={() => act("complete", { confirm: "Approve this task as completed?" })} disabled={!!busy} className={btnGhost}><CheckCircle2 className="h-4 w-4 text-emerald-400" />Approve completion</button>
          )}
          {caps.manage && open && <button onClick={() => setEditing(true)} className={btnGhost}><Pencil className="h-4 w-4" />Edit</button>}
          {caps.manage && open && <button onClick={() => act("cancel", { reason: true, prompt: "Why is the task cancelled?" })} disabled={!!busy} className={btnDanger}>Cancel task</button>}
          {caps.manage && ["COMPLETED", "CANCELLED"].includes(task.status) && <button onClick={() => act("reopen", { reason: true, prompt: "Why reopen it?" })} disabled={!!busy} className={btnGhost}>Reopen</button>}
          {caps.manage && ["COMPLETED", "CANCELLED"].includes(task.status) && <button onClick={() => act("archive", { confirm: "Archive this task?" })} disabled={!!busy} className={btnGhost}>Archive</button>}
          {task.status === "DRAFT" && caps.manage && (
            <>
              <button onClick={() => setEditing(true)} className={btnGhost}><Pencil className="h-4 w-4" />Edit draft</button>
              <button onClick={() => act("publish", { confirm: "Publish and send it to the assignees?" })} disabled={!!busy} className={btnPrimary}><Send className="h-4 w-4" />Publish &amp; assign</button>
            </>
          )}
        </div>
      </section>

      {myOpenRequests.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ShieldAlert className="h-4 w-4" />Waiting on you</h2>
          {myOpenRequests.map((r) => (
            <div key={r.id} className="mt-2 text-sm text-amber-50/90">
              <b>{r.from?.name}</b> ({r.kind.toLowerCase()}, {fmtAgo(r.createdAt)}): {r.message}
              <p className="mt-1 text-xs text-amber-200/80">A progress report answers it automatically.</p>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4 min-w-0">
          <TargetsCard d={d} />
          {task.instructions && (
            <section className={card}>
              <h2 className="mb-2 text-sm font-semibold text-white">Instructions</h2>
              <div className="prose prose-invert prose-sm max-w-none break-words" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(task.instructions) }} />
            </section>
          )}
          {task.acceptance && (
            <section className={card}>
              <h2 className="mb-1 text-sm font-semibold text-white">Acceptance criteria</h2>
              <p className="whitespace-pre-line text-sm text-slate-300">{task.acceptance}</p>
            </section>
          )}
          {caps.report && d.me.acceptedAt && <ReportForm d={d} onDone={load} />}
          <ReportsCard d={d} onDone={load} />
          <Discussion d={d} onDone={load} />
        </div>
        <div className="space-y-4 min-w-0">
          <MembersCard d={d} />
          <RequestsCard d={d} onDone={load} />
          <section className={card}>
            <h2 className="mb-2 text-sm font-semibold text-white">Activity</h2>
            {d.activity.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
              <ol className="space-y-2 border-l border-slate-800 pl-3">
                {d.activity.map((x) => (
                  <li key={x.id} className="text-xs">
                    <p className="text-slate-300"><b className="text-slate-200">{x.actor?.name ?? "System"}</b> {x.summary}</p>
                    <p className="text-slate-500">{fmtDate(x.createdAt, true)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {editing && <EditModal d={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}

function TargetsCard({ d }: { d: Detail }) {
  const t = d.progress?.targets ?? [];
  const names = new Map(d.members.map((m) => [m.userId, m.user?.name]));
  return (
    <section className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Targets &amp; progress</h2>
        {t.length > 0 && <span className="text-sm font-bold tabular-nums text-white">{d.progress?.overall ?? 0}%</span>}
      </div>
      {t.length === 0 ? (
        <p className="text-sm text-slate-500">No numeric target — progress is tracked by reports and the final review.</p>
      ) : (
        <div className="space-y-3">
          {t.map((x) => (
            <div key={x.targetId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-white">{x.label}{x.assigneeId && <span className="ml-1 text-xs font-normal text-slate-400">· {names.get(x.assigneeId)}</span>}</span>
                <span className="tabular-nums text-slate-300">{x.approved} / {x.quantity} {x.unitLabel} · {x.percent}%</span>
              </div>
              <ProgressBar percent={x.percent} pending={x.quantity > 0 ? Math.floor((x.pending / x.quantity) * 100) : 0} className="mt-1.5" />
              <p className="mt-1 text-[11px] text-slate-500">
                Remaining {x.remaining}
                {x.pending > 0 && <span className="text-violet-300"> · {x.pending} reported, waiting for review</span>}
                {x.over > 0 && <span className="text-emerald-300"> · +{x.over} beyond target</span>}
                {x.quantity !== x.originalQuantity && <span> · first set at {x.originalQuantity}</span>}
              </p>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">{d.task.targetMode === "SHARED" ? "Shared target — everyone's approved work adds up toward it. " : "Individual targets — one per assignee. "}{t.length > 1 ? d.overallMethod : ""} Only approved reports count.</p>
        </div>
      )}
    </section>
  );
}

function ReportForm({ d, onDone }: { d: Detail; onDone: () => void }) {
  const mine = (d.progress?.targets ?? []).filter((t) => !t.assigneeId || t.assigneeId === d.me.userId);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [f, setF] = useState({ summary: "", inProgress: "", blockers: "", nextSteps: "", nextUpdateAt: "", links: "", isFinal: false });
  const [files, setFiles] = useState<Array<{ key: string; name: string; size: number; type: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = useRef(newKey());
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await workFetch<{ key: string; name: string; size: number; type: string }>(`/api/admin/work/tasks/${d.task.id}/evidence`, { method: "POST", body: fd });
      setFiles((xs) => [...xs, r]);
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const lines = mine.map((t) => ({ targetId: t.targetId, quantity: Number(qty[t.targetId] || 0) })).filter((l) => l.quantity > 0);
    const links = f.links.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length && !f.summary.trim() && !f.blockers.trim()) return toast.error("Add progress numbers or describe the work.");
    if (d.task.evidenceRequired && lines.length && !links.length && !files.length) return toast.error("This task needs evidence — add links or files.");
    setSaving(true);
    try {
      await workFetch(`/api/admin/work/tasks/${d.task.id}/reports`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: key.current,
          lines,
          summary: f.summary || undefined,
          inProgress: f.inProgress || undefined,
          blockers: f.blockers || undefined,
          nextSteps: f.nextSteps || undefined,
          nextUpdateAt: f.nextUpdateAt ? new Date(f.nextUpdateAt).toISOString() : undefined,
          links,
          attachments: files,
          isFinal: f.isFinal,
        }),
      });
      toast.success(d.task.reviewRequired ? "Report sent for review" : "Progress saved");
      key.current = newKey();
      setQty({});
      setFiles([]);
      setF({ summary: "", inProgress: "", blockers: "", nextSteps: "", nextUpdateAt: "", links: "", isFinal: false });
      onDone();
    } catch (e) {
      toast.error("Couldn't send the report", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="report" className={cn(card, "scroll-mt-24 space-y-3 border-blue-500/30")}>
      <h2 className="text-sm font-semibold text-white">Report progress</h2>
      {mine.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Enter the work you ADDED since your last report — not the running total.</p>
          {mine.map((t) => {
            const add = Number(qty[t.targetId] || 0);
            return (
              <div key={t.targetId} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 sm:grid-cols-[1fr_8rem_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{t.label}</p>
                  <p className="text-[11px] text-slate-500">Approved so far {t.approved}/{t.quantity}{t.pending ? ` · ${t.pending} waiting` : ""}</p>
                </div>
                <input inputMode="numeric" value={qty[t.targetId] ?? ""} onChange={(e) => setQty({ ...qty, [t.targetId]: e.target.value.replace(/\D/g, "") })} placeholder="+ added" aria-label={`Added ${t.label}`} className={input} />
                <p className="col-span-2 text-[11px] text-slate-400 sm:col-span-1 sm:text-right">
                  {add > 0 ? <>After approval: {t.approved + add}/{t.quantity} · remaining {Math.max(t.quantity - t.approved - add, 0)}</> : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={label}>Work completed this period</label><textarea rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} className={input} /></div>
        <div><label className={label}>Still in progress</label><textarea rows={2} value={f.inProgress} onChange={(e) => setF({ ...f, inProgress: e.target.value })} className={input} /></div>
        <div><label className={label}>Issues or blockers</label><textarea rows={2} value={f.blockers} onChange={(e) => setF({ ...f, blockers: e.target.value })} className={input} /></div>
        <div><label className={label}>Next steps</label><textarea rows={2} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} className={input} /></div>
        <div><label className={label}>Next update expected</label><input type="datetime-local" value={f.nextUpdateAt} onChange={(e) => setF({ ...f, nextUpdateAt: e.target.value })} className={input} /></div>
        <div className="sm:col-span-2"><label className={label}>Links {d.task.evidenceRequired && "(evidence required)"}</label><textarea rows={2} value={f.links} onChange={(e) => setF({ ...f, links: e.target.value })} placeholder="One link per line" className={input} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) void upload(x); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className={btnGhost}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Attach file</button>
        {files.map((x) => (
          <span key={x.key} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">{x.name}<button onClick={() => setFiles((xs) => xs.filter((y) => y.key !== x.key))} aria-label="Remove file"><X className="h-3 w-3" /></button></span>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.isFinal} onChange={(e) => setF({ ...f, isFinal: e.target.checked })} /> This finishes the task — send it for final review</label>
      <div className="flex justify-end"><button onClick={submit} disabled={saving} className={btnPrimary}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Send report</button></div>
    </section>
  );
}

function ReportsCard({ d, onDone }: { d: Detail; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const targetName = useMemo(() => new Map((d.progress?.targets ?? []).map((t) => [t.targetId, `${t.label}`])), [d.progress]);
  const review = async (id: string, decision: "APPROVE" | "REJECT" | "CHANGES") => {
    let note: string | undefined;
    if (decision !== "APPROVE") {
      const n = await promptDialog({ title: decision === "REJECT" ? "Why is it rejected?" : "What needs to change?", required: true, multiline: true, confirmLabel: "Send" });
      if (!n?.trim()) return;
      note = n.trim();
    }
    setBusy(id);
    try {
      await workFetch(`/api/admin/work/reports/${id}`, { method: "POST", body: JSON.stringify({ decision, note }) });
      toast.success(decision === "APPROVE" ? "Report approved" : "Sent back");
      onDone();
    } catch (e) {
      toast.error("Couldn't review", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className={card}>
      <h2 className="mb-3 text-sm font-semibold text-white">Progress reports ({d.reports.length})</h2>
      {d.reports.length === 0 ? <p className="text-sm text-slate-500">No reports yet.</p> : (
        <ul className="space-y-3">
          {d.reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <b className="text-slate-200">{r.author?.name}</b>
                <span className="text-slate-500">{fmtDate(r.createdAt, true)}</span>
                <StatusBadge status={r.status} />
                {r.isFinal && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">Final</span>}
              </div>
              {r.lines.length > 0 && (
                <p className="mt-1.5 text-sm text-white">{r.lines.map((l) => `+${l.quantity} ${targetName.get(l.targetId) ?? ""}`).join(" · ")}</p>
              )}
              {[["Done", r.summary], ["In progress", r.inProgress], ["Blockers", r.blockers], ["Next", r.nextSteps]].map(([k, v]) =>
                v ? <p key={k as string} className="mt-1 whitespace-pre-line text-sm text-slate-300"><span className="text-xs text-slate-500">{k}: </span>{v}</p> : null
              )}
              {r.nextUpdateAt && <p className="mt-1 text-xs text-slate-500">Next update by {fmtDate(r.nextUpdateAt, true)}</p>}
              {(r.links.length > 0 || (r.attachments?.length ?? 0) > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate rounded bg-slate-800 px-2 py-0.5 text-xs text-blue-300 hover:underline"><ExternalLink className="h-3 w-3 shrink-0" />{l.replace(/^https?:\/\//, "").slice(0, 40)}</a>)}
                  {(r.attachments ?? []).map((x) => <a key={x.key} href={`/api/admin/work/tasks/${d.task.id}/evidence?key=${encodeURIComponent(x.key)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs text-blue-300 hover:underline"><FileUp className="h-3 w-3" />{x.name}</a>)}
                </div>
              )}
              {r.reviewNote && <p className="mt-2 rounded bg-slate-800/60 p-2 text-xs text-slate-300"><b>{r.reviewer?.name ?? "Review"}:</b> {r.reviewNote}</p>}
              {d.caps.review && r.status === "SUBMITTED" && r.author?.id !== d.me.userId && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => review(r.id, "APPROVE")} disabled={busy === r.id} className={btnPrimary}>Approve</button>
                  <button onClick={() => review(r.id, "CHANGES")} disabled={busy === r.id} className={btnGhost}>Request changes</button>
                  <button onClick={() => review(r.id, "REJECT")} disabled={busy === r.id} className={btnDanger}>Reject</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MembersCard({ d }: { d: Detail }) {
  return (
    <section className={card}>
      <h2 className="mb-2 text-sm font-semibold text-white">People</h2>
      <ul className="space-y-1.5 text-sm">
        {d.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-slate-200">{m.user?.name}</span>
            <span className="shrink-0 text-xs text-slate-400">
              {ROLE_LABEL[m.role]}
              {(m.role === "ASSIGNEE" || m.role === "COLLABORATOR") && (m.acceptedAt ? <span className="text-emerald-300"> · accepted</span> : <span className="text-amber-300"> · not accepted</span>)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">{VISIBILITY_LABEL[d.task.visibility as keyof typeof VISIBILITY_LABEL] ?? d.task.visibility}</p>
    </section>
  );
}

function RequestsCard({ d, onDone }: { d: Detail; onDone: () => void }) {
  const doers = d.members.filter((m) => m.role === "ASSIGNEE" || m.role === "COLLABORATOR");
  const canAsk = d.caps.manage || d.caps.review;
  const isDoer = d.caps.memberRole === "ASSIGNEE" || d.caps.memberRole === "COLLABORATOR";
  const send = async (kind: "UPDATE" | "REMINDER" | "CLARIFICATION") => {
    const message = await promptDialog({
      title: kind === "CLARIFICATION" ? "Ask the manager" : kind === "UPDATE" ? "Request an update" : "Send a reminder",
      multiline: true,
      required: true,
      defaultValue: kind === "CLARIFICATION" ? "" : "Please submit the latest progress report, including completed quantity, remaining work, blockers, evidence, and your expected completion date.",
      confirmLabel: "Send",
    });
    if (!message?.trim()) return;
    try {
      const r = await workFetch<{ sent: number }>(`/api/admin/work/tasks/${d.task.id}/requests`, { method: "POST", body: JSON.stringify({ kind, message: message.trim() }) });
      toast.success(`Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}`);
      onDone();
    } catch (e) {
      toast.error("Not sent", { description: (e as Error).message });
    }
  };
  if (!canAsk && !isDoer && !d.requests.length) return null;
  return (
    <section className={card}>
      <h2 className="mb-2 text-sm font-semibold text-white">Updates &amp; reminders</h2>
      <div className="flex flex-wrap gap-2">
        {canAsk && doers.length > 0 && <button onClick={() => send("UPDATE")} className={btnGhost}>Request update</button>}
        {canAsk && doers.length > 0 && <button onClick={() => send("REMINDER")} className={btnGhost}>Remind</button>}
        {isDoer && <button onClick={() => send("CLARIFICATION")} className={btnGhost}>Ask the manager</button>}
      </div>
      {d.requests.length > 0 && (
        <ul className="mt-3 space-y-2">
          {d.requests.map((r) => (
            <li key={r.id} className="text-xs">
              <p className="text-slate-300"><b>{r.from?.name}</b> → {r.to?.name} · {r.kind.toLowerCase()} · {fmtAgo(r.createdAt)}</p>
              <p className="text-slate-400">{r.message}</p>
              <p className={r.status === "OPEN" ? "text-amber-300" : "text-emerald-300"}>{r.status === "OPEN" ? "Waiting" : `Answered ${fmtAgo(r.answeredAt)}`}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Discussion({ d, onDone }: { d: Detail; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const send = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await workFetch(`/api/admin/work/tasks/${d.task.id}/comments`, { method: "POST", body: JSON.stringify({ body: body.trim(), kind: note ? "NOTE" : "COMMENT" }) });
      setBody("");
      onDone();
    } catch (e) {
      toast.error("Not sent", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className={card}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><MessageSquare className="h-4 w-4" />Discussion</h2>
      {d.comments.length === 0 ? <p className="mb-3 text-sm text-slate-500">No messages yet.</p> : (
        <ul className="mb-3 space-y-2">
          {d.comments.map((c) => (
            <li key={c.id} className={cn("rounded-lg p-2.5", c.kind === "NOTE" ? "border border-amber-500/30 bg-amber-500/5" : "bg-slate-950/50")}>
              <p className="text-xs text-slate-400"><b className="text-slate-200">{c.author?.name}</b> · {fmtDate(c.createdAt, true)}{c.kind === "NOTE" && <span className="ml-1 inline-flex items-center gap-1 text-amber-300"><Lock className="h-3 w-3" />private note</span>}</p>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-200">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" className={input} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {d.caps.privateNotes ? <label className="flex items-center gap-2 text-xs text-amber-200"><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />Private note (managers of this task only)</label> : <span />}
        <button onClick={send} disabled={saving || !body.trim()} className={btnPrimary}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Send</button>
      </div>
    </section>
  );
}

function EditModal({ d, onClose, onSaved }: { d: Detail; onClose: () => void; onSaved: () => void }) {
  const t = d.task;
  const local = (v: string | null) => (v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [f, setF] = useState({ title: t.title, priority: t.priority, visibility: t.visibility, dueAt: local(t.dueAt), reason: "" });
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries((d.progress?.targets ?? []).map((x) => [x.targetId, String(x.quantity)])));
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [addId, setAddId] = useState("");
  const [addRole, setAddRole] = useState<MemberRole>("ASSIGNEE");
  const [remove, setRemove] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    workFetch<{ people: Array<{ id: string; name: string }> }>("/api/admin/work/meta").then((m) => setPeople(m.people)).catch(() => {});
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const targets = (d.progress?.targets ?? []).map((x) => ({ id: x.targetId, label: x.label, unitLabel: x.unitLabel, quantity: Number(qty[x.targetId] || 0), assigneeId: x.assigneeId }));
      await workFetch(`/api/admin/work/tasks/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: f.title,
          priority: f.priority,
          visibility: f.visibility,
          dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
          ...(targets.length ? { targets } : {}),
          ...(addId ? { addMembers: [{ userId: addId, role: addRole }] } : {}),
          ...(remove.length ? { removeMemberIds: remove } : {}),
          reason: f.reason || undefined,
        }),
      });
      toast.success("Task updated");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-white">Edit {t.code}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div>
        <div><label className={label}>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={input} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Priority</label><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={input}>{WORK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div><label className={label}>Due</label><input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} className={input} /></div>
        </div>
        <div><label className={label}>Who can see it</label><select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} className={input}>{TASK_VISIBILITY.map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}</select></div>
        {(d.progress?.targets ?? []).map((x) => (
          <div key={x.targetId} className="grid grid-cols-[1fr_7rem] items-center gap-2">
            <span className="text-sm text-slate-300">{x.label} target</span>
            <input inputMode="numeric" value={qty[x.targetId] ?? ""} onChange={(e) => setQty({ ...qty, [x.targetId]: e.target.value.replace(/\D/g, "") })} className={input} />
          </div>
        ))}
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} className={input} aria-label="Add a person">
            <option value="">Add a person…</option>
            {people.filter((p) => !d.members.some((m) => m.userId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={addRole} onChange={(e) => setAddRole(e.target.value as MemberRole)} className={input} aria-label="Role">{(["ASSIGNEE", "COLLABORATOR", "REVIEWER", "OBSERVER"] as MemberRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </div>
        {d.members.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.members.map((m) => (
              <button key={m.userId} onClick={() => setRemove((xs) => (xs.includes(m.userId) ? xs.filter((x) => x !== m.userId) : [...xs, m.userId]))} className={cn("rounded-full px-2 py-1 text-xs", remove.includes(m.userId) ? "bg-red-500/20 text-red-300 line-through" : "bg-slate-800 text-slate-300")}>
                {m.user?.name} · {ROLE_LABEL[m.role]}
              </button>
            ))}
            <p className="w-full text-[11px] text-slate-500">Tap a person to remove them — they lose access to the task.</p>
          </div>
        )}
        <div><label className={label}>Reason (required if the deadline or a target changes)</label><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={input} /></div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={save} disabled={saving} className={btnPrimary}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></div>
      </div>
    </div>
  );
}
