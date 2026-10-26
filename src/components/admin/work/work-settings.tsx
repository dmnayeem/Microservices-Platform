"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Loader2, Plus, Users, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { OPTION_KINDS, type OptionKind } from "@/lib/work/model";
import { btnGhost, btnPrimary, card, input, label, workFetch } from "./ui";

interface Settings {
  staff: Array<{ id: string; name: string; role: string }>;
  options: Array<{ id: string; kind: OptionKind; label: string; isActive: boolean; sort: number }>;
  teams: Array<{ id: string; name: string; description: string | null; departmentId: string | null; isActive: boolean; members: Array<{ userId: string; isLead: boolean; positionId: string | null; user: { name: string } | null }> }>;
  reminderCooldownMinutes: number;
}

const KIND_LABEL: Record<OptionKind, string> = {
  DEPARTMENT: "Departments",
  CATEGORY: "Task categories",
  PLATFORM: "Platforms / channels",
  UNIT: "Target units",
  POSITION: "Positions",
};
const SUGGEST: Record<OptionKind, string[]> = {
  DEPARTMENT: ["Marketing", "Operations", "Support", "Development", "Finance", "HR"],
  CATEGORY: ["Social Media Management", "Content Creation", "SEO", "Website Management", "Customer Support", "Software Development", "Design", "Research", "Custom Work"],
  PLATFORM: ["Facebook", "Instagram", "YouTube", "TikTok", "LinkedIn", "Pinterest", "X", "Snapchat", "Twitch", "Website"],
  UNIT: ["posts", "videos", "articles", "designs", "leads", "tickets", "pages", "features", "hours", "deliverables"],
  POSITION: ["Team Lead", "Executive", "Specialist", "Intern"],
};

/** Team Work settings: teams + Team Leads, the managed lists, the reminder cooldown. */
export function WorkSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const load = useCallback(() => {
    workFetch<Settings>("/api/admin/work/settings").then(setS).catch((e) => toast.error("Couldn't load settings", { description: e.message }));
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const post = async (body: Record<string, unknown>, ok?: string) => {
    try {
      await workFetch("/api/admin/work/settings", { method: "POST", body: JSON.stringify(body) });
      if (ok) toast.success(ok);
      load();
    } catch (e) {
      toast.error("Not saved", { description: (e as Error).message });
    }
  };

  if (!s) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  return (
    <div className="space-y-5">
      <Teams s={s} post={post} />
      <div className="grid gap-4 lg:grid-cols-2">
        {OPTION_KINDS.map((k) => <OptionList key={k} kind={k} s={s} post={post} />)}
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold text-white">Reminders</h2>
          <label className={label}>Minimum minutes between two reminders / update requests to the same person on the same task</label>
          <div className="flex gap-2">
            <input type="number" min={0} max={10080} defaultValue={s.reminderCooldownMinutes} id="work-cooldown" className={`${input} w-32`} />
            <button onClick={() => { const v = Number((document.getElementById("work-cooldown") as HTMLInputElement).value); void post({ action: "cooldown", minutes: Math.max(0, Math.floor(v || 0)) }, "Saved"); }} className={btnGhost}>Save</button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">0 = no limit.</p>
        </section>
      </div>
    </div>
  );
}

function OptionList({ kind, s, post }: { kind: OptionKind; s: Settings; post: (b: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const rows = s.options.filter((o) => o.kind === kind);
  const missing = SUGGEST[kind].filter((x) => !rows.some((r) => r.label.toLowerCase() === x.toLowerCase()));
  const add = async (labelText: string) => {
    if (!labelText.trim()) return;
    await post({ action: "option_add", kind, label: labelText.trim() });
    setV("");
  };
  return (
    <section className={card}>
      <h2 className="mb-2 text-sm font-semibold text-white">{KIND_LABEL[kind]}</h2>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((o) => (
          <button
            key={o.id}
            onClick={() => void post({ action: "option_update", id: o.id, isActive: !o.isActive })}
            title={o.isActive ? "Click to deactivate (kept on old tasks)" : "Click to reactivate"}
            className={cn("rounded-full px-2.5 py-1 text-xs", o.isActive ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-900 text-slate-500 line-through")}
          >
            {o.label}
          </button>
        ))}
        {!rows.length && <span className="text-xs text-slate-500">None yet.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add(v)} placeholder="Add…" className={input} />
        <button onClick={() => void add(v)} className={btnGhost}><Plus className="h-4 w-4" /></button>
      </div>
      {missing.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {missing.slice(0, 10).map((x) => <button key={x} onClick={() => void add(x)} className="rounded-full border border-dashed border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:text-white">+ {x}</button>)}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Deactivated entries stay on the tasks that used them.</p>
    </section>
  );
}

function Teams({ s, post }: { s: Settings; post: (b: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const depts = s.options.filter((o) => o.kind === "DEPARTMENT" && o.isActive);
  return (
    <section className={card}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white"><Users className="h-4 w-4" />Teams &amp; Team Leads</h2>
      <p className="mb-3 text-xs text-slate-400">
        A Team Lead with &quot;Create &amp; assign work&quot; can create tasks for their own team and sees its work. Assigning across teams needs
        &quot;Assign across teams&quot; (Admin Access).
      </p>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New team name" className={input} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={input} aria-label="Department">
          <option value="">— Department —</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <button disabled={name.trim().length < 2} onClick={async () => { await post({ action: "team_save", name: name.trim(), departmentId: dept || null }, "Team created"); setName(""); }} className={btnPrimary}><Plus className="h-4 w-4" />Add team</button>
      </div>
      {s.teams.length === 0 ? <p className="text-sm text-slate-500">No teams yet.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {s.teams.map((t) => (
            <div key={t.id} className={cn("rounded-lg border p-3", t.isActive ? "border-slate-800 bg-slate-950/40" : "border-slate-800 opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-white">{t.name}{t.departmentId && <span className="ml-1 text-xs text-slate-500">· {s.options.find((o) => o.id === t.departmentId)?.label}</span>}</p>
                <button onClick={() => void post({ action: "team_save", id: t.id, name: t.name, departmentId: t.departmentId, isActive: !t.isActive })} className="text-xs text-slate-400 hover:text-white">{t.isActive ? "Deactivate" : "Reactivate"}</button>
              </div>
              <ul className="mt-2 space-y-1">
                {t.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-200">{m.user?.name ?? m.userId}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button onClick={() => void post({ action: "member_set", teamId: t.id, userId: m.userId, isLead: !m.isLead, positionId: m.positionId })} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", m.isLead ? "bg-amber-500/15 text-amber-300" : "bg-slate-800 text-slate-400 hover:text-white")}>
                        <Crown className="h-3 w-3" />{m.isLead ? "Lead" : "Make lead"}
                      </button>
                      <button onClick={() => void post({ action: "member_remove", teamId: t.id, userId: m.userId })} aria-label="Remove from team" className="p-1 text-slate-500 hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <select value={pick[t.id] ?? ""} onChange={(e) => setPick({ ...pick, [t.id]: e.target.value })} className={input} aria-label="Add a member">
                  <option value="">Add a staff member…</option>
                  {s.staff.filter((u) => !t.members.some((m) => m.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role.replace(/_/g, " ").toLowerCase()}</option>)}
                </select>
                <button disabled={!pick[t.id]} onClick={async () => { await post({ action: "member_set", teamId: t.id, userId: pick[t.id], isLead: false }); setPick({ ...pick, [t.id]: "" }); }} className={btnGhost}><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
