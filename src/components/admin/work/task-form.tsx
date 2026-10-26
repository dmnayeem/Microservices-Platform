"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { RichTextEditor } from "@/components/admin/offers/rich-text-editor";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { MEMBER_ROLES, RECURRENCES, RECURRENCE_LABEL, ROLE_LABEL, VISIBILITY_LABEL, TASK_VISIBILITY, WORK_PRIORITIES, type MemberRole } from "@/lib/work/model";
import { btnGhost, btnPrimary, card, input, label, workFetch } from "./ui";

interface Meta {
  me: { userId: string; leadTeamIds: string[] };
  caps: { create: boolean; assignAny: boolean };
  options: Record<"DEPARTMENT" | "CATEGORY" | "PLATFORM" | "UNIT" | "POSITION", Array<{ id: string; label: string }>>;
  teams: Array<{ id: string; name: string; lead: boolean }>;
  projects: Array<{ id: string; code: string; title: string; milestones: Array<{ id: string; title: string }> }>;
  people: Array<{ id: string; name: string; role: string; teamIds: string[] }>;
  tasks: Array<{ id: string; code: string; title: string }>;
  staffRoles: string[];
}

type TargetRow = { key: string; label: string; platformId: string; unitLabel: string; quantity: string; assigneeId: string };
const newTarget = (): TargetRow => ({ key: Math.random().toString(36).slice(2), label: "", platformId: "", unitLabel: "items", quantity: "", assigneeId: "" });

/** New task. Sections, inline checks; the server re-checks everything. */
export function TaskForm({ defaultProjectId }: { defaultProjectId?: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "publish">(null);
  const [f, setF] = useState({
    title: "",
    summary: "",
    instructions: "",
    projectId: defaultProjectId ?? "",
    milestoneId: "",
    categoryId: "",
    teamId: "",
    managerId: "",
    priority: "NORMAL",
    visibility: "PARTICIPANTS",
    targetMode: "SHARED" as "SHARED" | "INDIVIDUAL",
    reviewRequired: true,
    evidenceRequired: false,
    acceptance: "",
    estimatedHours: "",
    startAt: "",
    dueAt: "",
    visibleDepartmentId: "",
    recurrence: "NONE",
    dependsOnId: "",
  });
  const [visibleRoles, setVisibleRoles] = useState<string[]>([]);
  const [members, setMembers] = useState<Array<{ userId: string; role: MemberRole }>>([]);
  const [targets, setTargets] = useState<TargetRow[]>([newTarget()]);
  const [find, setFind] = useState("");

  useEffect(() => {
    workFetch<Meta>("/api/admin/work/meta")
      .then((m) => {
        setMeta(m);
        // A Team Lead without "across teams" must file under a team they lead.
        if (!m.caps.assignAny && m.me.leadTeamIds.length) setF((x) => ({ ...x, teamId: x.teamId || m.me.leadTeamIds[0] }));
      })
      .catch((e) => toast.error("Couldn't load the form", { description: e.message }));
  }, []);

  const peopleById = useMemo(() => new Map((meta?.people ?? []).map((p) => [p.id, p])), [meta]);
  const candidates = useMemo(() => {
    if (!meta) return [];
    const taken = new Set(members.map((m) => m.userId));
    const q = find.trim().toLowerCase();
    return meta.people
      .filter((p) => !taken.has(p.id))
      .filter((p) => meta.caps.assignAny || !f.teamId || p.teamIds.includes(f.teamId) || p.id === meta.me.userId)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [meta, members, find, f.teamId]);
  const assignees = members.filter((m) => m.role === "ASSIGNEE");
  const milestones = meta?.projects.find((p) => p.id === f.projectId)?.milestones ?? [];

  const problem = (() => {
    if (f.title.trim().length < 3) return "Give the task a title.";
    if (!assignees.length) return "Assign it to at least one person.";
    if (f.startAt && f.dueAt && f.dueAt < f.startAt) return "The due date is before the start date.";
    if (f.visibility === "DEPARTMENT" && !f.visibleDepartmentId) return "Choose the department that can see it.";
    if (f.visibility === "ROLES" && !visibleRoles.length) return "Choose at least one role that can see it.";
    if (f.recurrence !== "NONE" && !f.dueAt) return "A repeating task needs a due date.";
    for (const t of targets) {
      if (!t.label.trim() && !t.quantity) continue;
      if (!t.label.trim()) return "Every target needs a name (e.g. Facebook posts).";
      if (!/^\d+$/.test(t.quantity)) return "Every target needs a whole-number quantity.";
      if (f.targetMode === "INDIVIDUAL" && !assignees.some((a) => a.userId === t.assigneeId)) return "With individual targets, choose whose each target is.";
    }
    return null;
  })();

  const submit = async (draft: boolean) => {
    if (!draft && problem) {
      toast.error(problem);
      return;
    }
    setSaving(draft ? "draft" : "publish");
    try {
      const body = {
        ...f,
        summary: f.summary || null,
        instructions: f.instructions || null,
        projectId: f.projectId || null,
        milestoneId: f.milestoneId || null,
        categoryId: f.categoryId || null,
        teamId: f.teamId || null,
        managerId: f.managerId || null,
        acceptance: f.acceptance || null,
        visibleDepartmentId: f.visibility === "DEPARTMENT" ? f.visibleDepartmentId || null : null,
        visibleRoles: f.visibility === "ROLES" ? visibleRoles : [],
        dependsOnId: f.dependsOnId || null,
        estimatedHours: f.estimatedHours ? Number(f.estimatedHours) : null,
        startAt: f.startAt ? new Date(f.startAt).toISOString() : null,
        dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
        draft,
        members,
        targets: targets
          .filter((t) => t.label.trim() && t.quantity !== "")
          .map((t) => ({
            label: t.label.trim(),
            platformId: t.platformId || null,
            unitLabel: t.unitLabel.trim() || "items",
            quantity: Number(t.quantity),
            assigneeId: f.targetMode === "INDIVIDUAL" ? t.assigneeId || null : null,
          })),
      };
      const r = await workFetch<{ id: string; code: string }>("/api/admin/work/tasks", { method: "POST", body: JSON.stringify(body) });
      toast.success(draft ? `Draft ${r.code} saved` : `${r.code} assigned`, { description: draft ? undefined : "The assignees see it the next time they open the admin panel." });
      router.push(`/admin/work/tasks/${r.id}`);
    } catch (e) {
      toast.error("Couldn't save the task", { description: (e as Error).message });
      setSaving(null);
    }
  };

  if (!meta) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  if (!meta.caps.create) return <p className="text-sm text-slate-400">You can&apos;t create tasks. Ask a super admin for &quot;Create &amp; assign work&quot;.</p>;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-white">1 · What needs doing</h2>
        <div><label className={label}>Title *</label><input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} className={input} placeholder="e.g. Publish 100 approved Facebook posts" /></div>
        <div><label className={label}>Short summary</label><input value={f.summary} onChange={(e) => set("summary", e.target.value)} maxLength={500} className={input} /></div>
        <div>
          <label className={label}>Instructions</label>
          <RichTextEditor value={f.instructions} onChange={(v) => set("instructions", v)} placeholder="Steps, links, rules — what a good result looks like…" minHeightClass="min-h-40" />
        </div>
      </section>

      <section className={`${card} grid gap-3 sm:grid-cols-2`}>
        <h2 className="text-sm font-semibold text-white sm:col-span-2">2 · Where it belongs</h2>
        <div><label className={label}>Project</label>
          <select value={f.projectId} onChange={(e) => setF((x) => ({ ...x, projectId: e.target.value, milestoneId: "" }))} className={input}>
            <option value="">— Standalone task —</option>
            {meta.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}
          </select>
        </div>
        <div><label className={label}>Milestone</label>
          <select value={f.milestoneId} onChange={(e) => set("milestoneId", e.target.value)} disabled={!milestones.length} className={input}>
            <option value="">— None —</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
        <div><label className={label}>Category</label>
          <select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={input}>
            <option value="">— None —</option>
            {meta.options.CATEGORY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div><label className={label}>Team {meta.caps.assignAny ? "" : "(one you lead)"}</label>
          <select value={f.teamId} onChange={(e) => set("teamId", e.target.value)} className={input}>
            {meta.caps.assignAny && <option value="">— No team —</option>}
            {meta.teams.filter((t) => meta.caps.assignAny || t.lead).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-white">3 · People</h2>
        <p className="text-xs text-slate-400">Assignees do the work and report. Collaborators can report too. Reviewers approve reports. Observers can only read.</p>
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <span className="min-w-0 flex-1 truncate text-sm text-white">{peopleById.get(m.userId)?.name ?? m.userId}</span>
              <select value={m.role} onChange={(e) => setMembers((xs) => xs.map((x) => (x.userId === m.userId ? { ...x, role: e.target.value as MemberRole } : x)))} className={`${input} w-36`} aria-label="Role">
                {MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button onClick={() => setMembers((xs) => xs.filter((x) => x.userId !== m.userId))} aria-label="Remove" className="rounded p-1.5 text-slate-400 hover:text-red-300"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a person to add…" className={`${input} pl-9`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((p) => (
            <button key={p.id} onClick={() => { setMembers((xs) => [...xs, { userId: p.id, role: "ASSIGNEE" }]); setFind(""); }} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700">
              <Plus className="h-3 w-3" /> {p.name} <span className="text-slate-500">{p.role.replace(/_/g, " ").toLowerCase()}</span>
            </button>
          ))}
          {!candidates.length && <span className="text-xs text-slate-500">{meta.people.length ? "No more matches." : "No one you can assign — set up teams in Work Settings."}</span>}
        </div>
        <div className="sm:w-1/2"><label className={label}>Responsible manager (optional)</label>
          <select value={f.managerId} onChange={(e) => set("managerId", e.target.value)} className={input}>
            <option value="">— Me —</option>
            {meta.people.filter((p) => p.id !== meta.me.userId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-white">4 · Targets</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["SHARED", "INDIVIDUAL"] as const).map((m) => (
            <label key={m} className={cn("cursor-pointer rounded-lg border p-3 text-sm", f.targetMode === m ? "border-blue-500 bg-blue-500/10" : "border-slate-700")}>
              <input type="radio" className="mr-2" checked={f.targetMode === m} onChange={() => set("targetMode", m)} />
              <b className="text-white">{m === "SHARED" ? "Shared target" : "Individual targets"}</b>
              <span className="mt-0.5 block text-xs text-slate-400">{m === "SHARED" ? "Everyone works toward the same number — it is never multiplied by the number of people." : "Each target belongs to one assignee."}</span>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          {targets.map((t, i) => (
            <div key={t.key} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 sm:grid-cols-[2fr_1.2fr_1fr_0.8fr_1.2fr_auto]">
              <input value={t.label} onChange={(e) => setTargets((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Target (e.g. Facebook posts)" className={`${input} col-span-2 sm:col-span-1`} />
              <select value={t.platformId} onChange={(e) => setTargets((xs) => xs.map((x, j) => (j === i ? { ...x, platformId: e.target.value } : x)))} className={input} aria-label="Platform">
                <option value="">Platform —</option>
                {meta.options.PLATFORM.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <input list="work-units" value={t.unitLabel} onChange={(e) => setTargets((xs) => xs.map((x, j) => (j === i ? { ...x, unitLabel: e.target.value } : x)))} placeholder="Unit" className={input} />
              <input inputMode="numeric" value={t.quantity} onChange={(e) => setTargets((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x)))} placeholder="Qty" className={input} />
              {f.targetMode === "INDIVIDUAL" ? (
                <select value={t.assigneeId} onChange={(e) => setTargets((xs) => xs.map((x, j) => (j === i ? { ...x, assigneeId: e.target.value } : x)))} className={input} aria-label="Whose target">
                  <option value="">Whose? —</option>
                  {assignees.map((a) => <option key={a.userId} value={a.userId}>{peopleById.get(a.userId)?.name}</option>)}
                </select>
              ) : <span className="hidden sm:block" />}
              <button onClick={() => setTargets((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : [newTarget()]))} aria-label="Remove target" className="justify-self-end rounded p-2 text-slate-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <datalist id="work-units">{meta.options.UNIT.map((o) => <option key={o.id} value={o.label} />)}</datalist>
          <button onClick={() => setTargets((xs) => [...xs, newTarget()])} className={btnGhost}><Plus className="h-4 w-4" /> Add target</button>
          <p className="text-[11px] text-slate-500">Leave targets empty for work without a number (e.g. a deliverable) — progress then comes from reports and the final review.</p>
        </div>
      </section>

      <section className={`${card} grid gap-3 sm:grid-cols-4`}>
        <h2 className="text-sm font-semibold text-white sm:col-span-4">5 · Priority &amp; timeline</h2>
        <div><label className={label}>Priority</label>
          <select value={f.priority} onChange={(e) => set("priority", e.target.value)} className={input}>
            {WORK_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div><label className={label}>Start</label><input type="datetime-local" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} className={input} /></div>
        <div><label className={label}>Due</label><input type="datetime-local" value={f.dueAt} onChange={(e) => set("dueAt", e.target.value)} className={input} /></div>
        <div><label className={label}>Estimated hours</label><input inputMode="decimal" value={f.estimatedHours} onChange={(e) => set("estimatedHours", e.target.value.replace(/[^\d.]/g, ""))} className={input} /></div>
        <div className="sm:col-span-2"><label className={label}>Repeats</label>
          <select value={f.recurrence} onChange={(e) => set("recurrence", e.target.value)} className={input}>
            {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
          </select>
          {f.recurrence !== "NONE" && <p className="mt-1 text-[11px] text-slate-500">When this one is approved as completed, the next one is created and assigned to the same people, due one period later.</p>}
        </div>
        <div className="sm:col-span-2"><label className={label}>Depends on (must be completed first)</label>
          <select value={f.dependsOnId} onChange={(e) => set("dependsOnId", e.target.value)} className={input}>
            <option value="">— Nothing —</option>
            {meta.tasks.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.title}</option>)}
          </select>
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-white">6 · Who can see it</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {TASK_VISIBILITY.map((v) => (
            <label key={v} className={cn("cursor-pointer rounded-lg border p-3 text-sm", f.visibility === v ? "border-blue-500 bg-blue-500/10" : "border-slate-700")}>
              <input type="radio" className="mr-2" checked={f.visibility === v} onChange={() => set("visibility", v)} />
              <span className="text-white">{VISIBILITY_LABEL[v]}</span>
            </label>
          ))}
        </div>
        {f.visibility === "DEPARTMENT" && (
          <div className="sm:w-1/2"><label className={label}>Department</label>
            <select value={f.visibleDepartmentId} onChange={(e) => set("visibleDepartmentId", e.target.value)} className={input}>
              <option value="">— Choose —</option>
              {meta.options.DEPARTMENT.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {!meta.options.DEPARTMENT.length && <p className="mt-1 text-[11px] text-amber-300">No departments yet — add them in Work Settings and put teams in them.</p>}
          </div>
        )}
        {f.visibility === "ROLES" && (
          <div className="flex flex-wrap gap-1.5">
            {meta.staffRoles.map((r) => (
              <button key={r} type="button" onClick={() => setVisibleRoles((xs) => (xs.includes(r) ? xs.filter((x) => x !== r) : [...xs, r]))} className={cn("rounded-full px-2.5 py-1 text-xs", visibleRoles.includes(r) ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700")}>
                {r.replace(/_/g, " ").toLowerCase()}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">
          &quot;Only the people on this task&quot; is private: other admins — managers included — don&apos;t see it in lists, searches, counts or
          notifications. You and the super admin always can. Add observers in People to share it with specific people.
        </p>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-white">7 · Review &amp; acceptance</h2>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.reviewRequired} onChange={(e) => set("reviewRequired", e.target.checked)} /> Reports must be approved before they count</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.evidenceRequired} onChange={(e) => set("evidenceRequired", e.target.checked)} /> Reports must include evidence (links or files)</label>
        <div><label className={label}>Acceptance criteria</label><textarea value={f.acceptance} onChange={(e) => set("acceptance", e.target.value)} rows={3} className={input} placeholder="What has to be true for this to be approved as done" /></div>
      </section>

      {/* Sticky inside the content column, so it never covers the sidebar. */}
      <div className="sticky bottom-0 z-20 rounded-xl border border-slate-800 bg-slate-950/95 p-3 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2">
          <p className="hidden min-w-0 truncate text-xs text-amber-300 sm:block">{problem ?? ""}</p>
          <div className="ml-auto flex gap-2">
            <button onClick={() => submit(true)} disabled={!!saving || f.title.trim().length < 3} className={btnGhost}>{saving === "draft" && <Loader2 className="h-4 w-4 animate-spin" />}Save draft</button>
            <button onClick={() => submit(false)} disabled={!!saving || !!problem} className={btnPrimary}>{saving === "publish" && <Loader2 className="h-4 w-4 animate-spin" />}Publish &amp; assign</button>
          </div>
        </div>
      </div>
    </div>
  );
}
