"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, CalendarDays, ChevronLeft, ChevronRight, Columns3, Download, FolderKanban, List as ListIcon, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { useUrlTab } from "@/components/admin/ui/use-url-tab";
import { cn } from "@/lib/utils";
import { OVERALL_METHOD_NOTE, PROJECT_STATUSES, STATUS_LABEL, TASK_STATUSES, WORK_PRIORITIES } from "@/lib/work/model";
import { OverdueBadge, PriorityBadge, ProgressBar, StatusBadge, btnGhost, btnPrimary, card, fmtAgo, fmtDate, input, label, Note, workFetch } from "./ui";
import { toast } from "@/lib/toast";

const TABS = ["overview", "tasks", "review", "projects"] as const;
type Tab = (typeof TABS)[number];

interface Overview {
  me: { awaitingAccept: number; inProgress: number; overdue: number; returned: number; requests: number };
  review: { waiting: number };
  managed: { scope: string; active: number; overdue: number; blocked: number; inReview: number; stale: number; completed30d: number; projects: number };
  upcoming: Array<{ id: string; code: string; title: string; status: string; priority: string; dueAt: string; overdue: boolean }>;
  activity: Array<{ id: string; at: string; summary: string; actor: string | null; taskId: string | null; task: { code: string; title: string } | null }>;
  workload: Array<{ userId: string; name: string; open: number }>;
  caps: { create: boolean; oversee: boolean; settings: boolean; review: boolean };
}

/** Team Work home: overview, task list, review queue, projects. */
export function WorkApp() {
  const [tab, setTab] = useUrlTab<Tab>("overview", TABS);
  const [ov, setOv] = useState<Overview | null>(null);

  const loadOverview = useCallback(() => {
    workFetch<Overview>("/api/admin/work/overview")
      .then(setOv)
      .catch((e) => toast.error("Couldn't load Team Work", { description: e.message }));
  }, []);
  useEffect(() => {
    const t = setTimeout(loadOverview, 0);
    return () => clearTimeout(t);
  }, [loadOverview]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks" },
    { id: "review", label: "Review", count: ov?.review.waiting },
    { id: "projects", label: "Projects" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                tab === t.id ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"
              )}
            >
              {t.label}
              {!!t.count && <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">{t.count}</span>}
            </button>
          ))}
        </div>
        {ov?.caps.create && (
          <Link href="/admin/work/tasks/new" className={btnPrimary}>
            <Plus className="h-4 w-4" /> New task
          </Link>
        )}
      </div>

      {tab === "overview" && <OverviewTab ov={ov} onRefresh={loadOverview} goTasks={() => setTab("tasks")} />}
      {tab === "tasks" && <TaskList />}
      {tab === "review" && <TaskList fixedScope="review" />}
      {tab === "projects" && <ProjectsTab canCreate={!!ov?.caps.create} />}
    </div>
  );
}

function Stat({ label: l, value, tone = "slate", href }: { label: string; value: number; tone?: "slate" | "red" | "amber" | "violet" | "emerald" | "blue"; href?: string }) {
  const tones = {
    slate: "text-white",
    red: "text-red-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
    emerald: "text-emerald-300",
    blue: "text-blue-300",
  };
  const body = (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-700">
      <p className={cn("text-2xl font-bold tabular-nums", value > 0 ? tones[tone] : "text-slate-500")}>{value}</p>
      <p className="text-xs text-slate-400">{l}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function OverviewTab({ ov, onRefresh, goTasks }: { ov: Overview | null; onRefresh: () => void; goTasks: () => void }) {
  if (!ov) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const managesWork = ov.caps.create || ov.caps.oversee;
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">My work</h2>
          <button onClick={onRefresh} className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Refresh</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Waiting for me to accept" value={ov.me.awaitingAccept} tone="violet" href="/admin/work?tab=tasks" />
          <Stat label="In progress" value={ov.me.inProgress} tone="blue" />
          <Stat label="Overdue" value={ov.me.overdue} tone="red" />
          <Stat label="Reports returned to me" value={ov.me.returned} tone="amber" />
          <Stat label="Update requests" value={ov.me.requests} tone="amber" />
        </div>
      </section>

      {(managesWork || ov.review.waiting > 0) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">
            {ov.managed.scope === "all" ? "All work" : "Work I manage"}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Active tasks" value={ov.managed.active} />
            <Stat label="Overdue" value={ov.managed.overdue} tone="red" />
            <Stat label="Blocked" value={ov.managed.blocked} tone="red" />
            <Stat label="In final review" value={ov.managed.inReview} tone="violet" />
            <Stat label="Reports to review" value={ov.review.waiting} tone="violet" href="/admin/work?tab=review" />
            <Stat label="No report for 3+ days" value={ov.managed.stale} tone="amber" />
            <Stat label="Completed (30 days)" value={ov.managed.completed30d} tone="emerald" />
            <Stat label="Active projects" value={ov.managed.projects} tone="blue" />
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-white">Deadlines (next 7 days &amp; overdue)</h2>
          {ov.upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing due soon.</p>
          ) : (
            <ul className="space-y-2">
              {ov.upcoming.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/work/tasks/${t.id}`} className="flex items-center gap-2 rounded-lg border border-slate-800 p-2 hover:bg-slate-800/60">
                    <span className="font-mono text-[11px] text-slate-500">{t.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{t.title}</span>
                    {t.overdue ? <OverdueBadge /> : <span className="text-xs text-slate-400">{fmtDate(t.dueAt)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button onClick={goTasks} className="mt-3 text-xs text-blue-400 hover:underline">All tasks →</button>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-white">Recent activity</h2>
          {ov.activity.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {ov.activity.map((x) => (
                <li key={x.id} className="text-sm">
                  <span className="text-slate-300">{x.actor ?? "System"}</span>{" "}
                  <span className="text-slate-400">{x.summary}</span>
                  {x.task && x.taskId && (
                    <Link href={`/admin/work/tasks/${x.taskId}`} className="ml-1 font-mono text-[11px] text-blue-400 hover:underline">{x.task.code}</Link>
                  )}
                  <span className="ml-2 text-[11px] text-slate-500">{fmtAgo(x.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {ov.workload.length > 0 && (
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-white">Workload — open tasks per person</h2>
          <div className="space-y-1.5">
            {ov.workload.map((w) => {
              const max = Math.max(...ov.workload.map((x) => x.open), 1);
              return (
                <div key={w.userId} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-slate-300 sm:w-48">{w.name}</span>
                  <div className="h-2 flex-1 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${(w.open / max) * 100}%` }} /></div>
                  <span className="w-8 text-right text-sm tabular-nums text-white">{w.open}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

interface TaskRow {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
  lastReportAt: string | null;
  project: { id: string; title: string } | null;
  pendingReports: number;
  assignees: Array<{ id?: string; name?: string; accepted: boolean }>;
  myRole: string | null;
  progress?: { overall: number; targets: Array<{ label: string; approved: number; quantity: number; unitLabel: string; pending: number }> };
}

const SCOPES = [
  { id: "mine", label: "Mine" },
  { id: "assigned", label: "Assigned to me" },
  { id: "created", label: "Created by me" },
  { id: "all", label: "All I can see" },
];

type View = "list" | "board" | "calendar";
const VIEWS: Array<{ id: View; label: string; Icon: typeof ListIcon }> = [
  { id: "list", label: "List", Icon: ListIcon },
  { id: "board", label: "Board", Icon: Columns3 },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
];
/** Board and calendar load up to this many tasks at once (the API's ceiling). */
const WIDE_PAGE = 200;
const VIEW_KEY = "work.taskView";
const SAVED_KEY = "work.savedViews";
interface SavedView { name: string; scope: string; status: string; priority: string; overdue: boolean; q: string }

// Per-browser conveniences only — a blocked or empty storage just means defaults.
function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** The task list — filters, search, pages. Cards on a phone, a table on desktop. */
export function TaskList({ fixedScope, projectId }: { fixedScope?: string; projectId?: string }) {
  const [scope, setScope] = useState(fixedScope ?? "mine");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ tasks: TaskRow[]; total: number; pageSize: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewPref, setViewPref] = useState<View>("list");
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  // The review queue is always a list; elsewhere the viewer's last choice.
  const view: View = fixedScope === "review" ? "list" : viewPref;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preferences, read once after mount
    setViewPref(readPref<View>(VIEW_KEY, "list"));
    setSaved(readPref<SavedView[]>(SAVED_KEY, []));
  }, []);

  /** The filters as query params — shared by the list, board, calendar and CSV. */
  const filterParams = useCallback(() => {
    const sp = new URLSearchParams({ scope });
    if (status) sp.set("status", status);
    if (priority) sp.set("priority", priority);
    if (overdue) sp.set("overdue", "1");
    if (q.trim()) sp.set("q", q.trim());
    if (projectId) sp.set("projectId", projectId);
    if (view === "calendar") {
      sp.set("dueFrom", month.toISOString());
      sp.set("dueTo", addMonths(month, 1).toISOString());
    }
    return sp;
  }, [scope, status, priority, overdue, q, projectId, view, month]);

  const load = useCallback(() => {
    const sp = filterParams();
    if (view === "list") sp.set("page", String(page));
    else sp.set("pageSize", String(WIDE_PAGE));
    setBusy(true);
    workFetch<{ tasks: TaskRow[]; total: number; pageSize: number }>(`/api/admin/work/tasks?${sp}`)
      .then(setData)
      .catch((e) => toast.error("Couldn't load tasks", { description: e.message }))
      .finally(() => setBusy(false));
  }, [filterParams, view, page]);

  const chooseView = (v: View) => {
    setViewPref(v);
    writePref(VIEW_KEY, v);
    setPage(1);
  };
  const saveView = () => {
    const name = (naming ?? "").trim().slice(0, 40);
    if (!name) return;
    const next = [...saved.filter((s) => s.name !== name), { name, scope, status, priority, overdue, q }].slice(-12);
    setSaved(next);
    writePref(SAVED_KEY, next);
    setNaming(null);
    toast.success("View saved", { description: "It is kept in this browser." });
  };
  const applyView = (s: SavedView) => {
    if (!fixedScope) setScope(s.scope);
    setStatus(s.status);
    setPriority(s.priority);
    setOverdue(s.overdue);
    setQ(s.q);
    setPage(1);
  };
  const removeView = (name: string) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    writePref(SAVED_KEY, next);
  };

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const clear = () => {
    setStatus("");
    setPriority("");
    setOverdue(false);
    setQ("");
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {!fixedScope && (
        <div className="flex gap-1 overflow-x-auto">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setScope(s.id);
                setPage(1);
              }}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", scope === s.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700")}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title or TW-number" className={`${input} pl-9`} />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={input} aria-label="Status">
          <option value="">Not archived</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className={input} aria-label="Priority">
          <option value="">Any priority</option>
          {WORK_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
          <input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(1); }} /> Overdue
        </label>
        <button onClick={clear} className={btnGhost}>Clear</button>
      </div>

      {fixedScope !== "review" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 p-0.5" role="tablist" aria-label="View">
            {VIEWS.map(({ id, label: l, Icon }) => (
              <button key={id} role="tab" aria-selected={view === id} onClick={() => chooseView(id)} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold", view === id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800")}>
                <Icon className="h-3.5 w-3.5" /> {l}
              </button>
            ))}
          </div>
          <a href={`/api/admin/work/tasks?${(() => { const sp = filterParams(); sp.set("format", "csv"); return sp; })()}`} download className={cn(btnGhost, "flex items-center gap-1.5")}>
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
          {naming === null ? (
            <button onClick={() => setNaming("")} className={cn(btnGhost, "flex items-center gap-1.5")}><Bookmark className="h-3.5 w-3.5" /> Save view</button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={naming} maxLength={40} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") setNaming(null); }} placeholder="Name this view" className={cn(input, "w-40 py-1.5")} />
              <button onClick={saveView} disabled={!naming.trim()} className={btnPrimary}>Save</button>
              <button onClick={() => setNaming(null)} className={btnGhost} aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      )}
      {fixedScope !== "review" && saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {saved.map((s) => (
            <span key={s.name} className="flex items-center rounded-full bg-slate-800 text-xs text-slate-200">
              <button onClick={() => applyView(s)} className="max-w-[12rem] truncate py-1 pl-3 pr-1 hover:text-white">{s.name}</button>
              <button onClick={() => removeView(s.name)} className="rounded-full p-1 pr-2 text-slate-500 hover:text-red-300" aria-label={`Remove ${s.name}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {!data ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : view === "calendar" ? (
        <TaskCalendar tasks={data.tasks} month={month} onMonth={setMonth} busy={busy} capped={data.total > data.tasks.length} />
      ) : data.tasks.length === 0 ? (
        <Note>{fixedScope === "review" ? "No reports are waiting for your review." : "No tasks match."}</Note>
      ) : view === "board" ? (
        <>
          <TaskBoard tasks={data.tasks} busy={busy} />
          {data.total > data.tasks.length && <p className="text-[11px] text-amber-300">Showing the first {data.tasks.length} of {data.total} — narrow the filters to see the rest.</p>}
        </>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className={cn("space-y-2 md:hidden", busy && "opacity-60")}>
            {data.tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/work/tasks/${t.id}`} className="block rounded-xl border border-slate-800 bg-slate-900 p-3 active:bg-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">{t.code}</span>
                    <StatusBadge status={t.status} />
                    <PriorityBadge priority={t.priority} />
                    {t.overdue && <OverdueBadge />}
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-white">{t.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar percent={t.progress?.overall ?? 0} />
                    <span className="text-xs tabular-nums text-slate-300">{t.progress?.overall ?? 0}%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Due {fmtDate(t.dueAt)} · {t.assignees.map((x) => x.name).join(", ") || "Unassigned"}
                    {t.pendingReports > 0 && <span className="ml-1 text-violet-300">· {t.pendingReports} to review</span>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className={cn("hidden overflow-x-auto rounded-xl border border-slate-800 md:block", busy && "opacity-60")}>
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Assignees</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last report</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks.map((t) => (
                  <tr key={t.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                    <td className="max-w-xs px-3 py-2">
                      <Link href={`/admin/work/tasks/${t.id}`} className="block">
                        <span className="font-mono text-[11px] text-slate-500">{t.code}</span>
                        <span className="block truncate font-medium text-white hover:underline">{t.title}</span>
                        {t.project && <span className="block truncate text-xs text-slate-500">{t.project.title}</span>}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      {t.assignees.map((x, i) => (
                        <span key={i} className={cn("block", !x.accepted && "text-amber-300")} title={x.accepted ? "Accepted" : "Not accepted yet"}>{x.name}</span>
                      ))}
                    </td>
                    <td className="w-40 px-3 py-2">
                      <div className="flex items-center gap-2"><ProgressBar percent={t.progress?.overall ?? 0} /><span className="text-xs tabular-nums text-slate-300">{t.progress?.overall ?? 0}%</span></div>
                      {t.progress?.targets[0] && (
                        <span className="text-[11px] text-slate-500">
                          {t.progress.targets.length === 1
                            ? `${t.progress.targets[0].approved}/${t.progress.targets[0].quantity} ${t.progress.targets[0].unitLabel}`
                            : `${t.progress.targets.length} targets`}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{t.overdue ? <OverdueBadge /> : <span className="text-slate-300">{fmtDate(t.dueAt)}</span>}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} /></div>{t.pendingReports > 0 && <span className="mt-1 block text-[11px] text-violet-300">{t.pendingReports} to review</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{fmtAgo(t.lastReportAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">{OVERALL_METHOD_NOTE}</p>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={btnGhost}>Previous</button>
              <span className="text-sm text-slate-400">Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={btnGhost}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Columns always shown on the board; any other status appears only when a task has it. */
const BOARD_BASE = ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "CHANGES_REQUESTED", "COMPLETED"];

/**
 * Board: one column per status. Read-only on purpose — a status changes only
 * through the task's own actions (accept, submit, approve…), which carry the
 * rules and the audit trail, so there is no drag-to-move here.
 */
function TaskBoard({ tasks, busy }: { tasks: TaskRow[]; busy: boolean }) {
  const cols = TASK_STATUSES.filter((s) => BOARD_BASE.includes(s) || tasks.some((t) => t.status === s));
  return (
    <div className={cn("flex max-w-full snap-x gap-3 overflow-x-auto pb-2", busy && "opacity-60")}>
      {cols.map((s) => {
        const items = tasks.filter((t) => t.status === s);
        return (
          <section key={s} className="w-[80vw] max-w-[18rem] shrink-0 snap-start rounded-xl border border-slate-800 bg-slate-900/50 p-2 sm:w-64">
            <header className="mb-2 flex items-center justify-between px-1">
              <StatusBadge status={s} />
              <span className="text-xs tabular-nums text-slate-400">{items.length}</span>
            </header>
            <ul className="space-y-2">
              {items.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/work/tasks/${t.id}`} className="block rounded-lg border border-slate-800 bg-slate-900 p-2.5 hover:border-slate-600 active:bg-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-500">{t.code}</span>
                      <PriorityBadge priority={t.priority} />
                      {t.overdue && <OverdueBadge />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-white">{t.title}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar percent={t.progress?.overall ?? 0} />
                      <span className="text-[11px] tabular-nums text-slate-400">{t.progress?.overall ?? 0}%</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {fmtDate(t.dueAt)} · {t.assignees.map((x) => x.name).join(", ") || "Unassigned"}
                    </p>
                    {t.pendingReports > 0 && <p className="mt-0.5 text-[11px] text-violet-300">{t.pendingReports} to review</p>}
                  </Link>
                </li>
              ))}
              {!items.length && <li className="px-1 py-4 text-center text-xs text-slate-600">Nothing here</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Calendar: tasks on their due date. A month grid on wider screens, a day-by-day agenda on a phone. */
function TaskCalendar({ tasks, month, onMonth, busy, capped }: { tasks: TaskRow[]; month: Date; onMonth: (d: Date) => void; busy: boolean; capped: boolean }) {
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const byDay = new Map<number, TaskRow[]>();
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const d = new Date(t.dueAt);
    if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) continue;
    byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), t]);
  }
  const cells: Array<number | null> = [...Array<null>(month.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const now = new Date();
  const isToday = (d: number) => now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth() && now.getDate() === d;
  const chip = (t: TaskRow) => (
    <Link key={t.id} href={`/admin/work/tasks/${t.id}`} title={`${t.code} · ${t.title}`} className={cn("block truncate rounded px-1.5 py-0.5 text-[11px]", t.overdue ? "bg-red-500/15 text-red-200" : t.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-200" : "bg-blue-500/10 text-blue-100", "hover:brightness-125")}>
      {t.title}
    </Link>
  );
  const withTasks = cells.filter((d): d is number => d !== null && byDay.has(d));

  return (
    <div className={cn("space-y-2", busy && "opacity-60")}>
      <div className="flex items-center gap-2">
        <button onClick={() => onMonth(addMonths(month, -1))} className={btnGhost} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <h3 className="min-w-[9rem] text-center text-sm font-semibold text-white">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <button onClick={() => onMonth(addMonths(month, 1))} className={btnGhost} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        <button onClick={() => onMonth(monthStart(new Date()))} className={btnGhost}>Today</button>
      </div>
      {capped && <p className="text-[11px] text-amber-300">Too many tasks this month to show them all — narrow the filters.</p>}

      {/* Phone: agenda */}
      <div className="sm:hidden">
        {withTasks.length === 0 ? (
          <Note>No tasks are due this month.</Note>
        ) : (
          <ul className="space-y-2">
            {withTasks.map((d) => (
              <li key={d} className={cn(card, "p-3")}>
                <p className={cn("mb-1.5 text-xs font-semibold", isToday(d) ? "text-blue-300" : "text-slate-400")}>
                  {new Date(month.getFullYear(), month.getMonth(), d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  {isToday(d) && " · Today"}
                </p>
                <div className="space-y-1">{byDay.get(d)!.map(chip)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Wider: month grid */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-800 sm:block">
        <div className="grid grid-cols-7 bg-slate-900 text-center text-[11px] font-semibold text-slate-400">
          {WEEKDAYS.map((w) => <div key={w} className="py-1.5">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div key={i} className={cn("min-h-24 min-w-0 border-t border-slate-800 p-1", i % 7 !== 0 && "border-l", d === null && "bg-slate-950/40")}>
              {d !== null && (
                <>
                  <span className={cn("mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums", isToday(d) ? "bg-blue-600 font-semibold text-white" : "text-slate-500")}>{d}</span>
                  <div className="max-h-28 space-y-0.5 overflow-y-auto">{(byDay.get(d) ?? []).map(chip)}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ProjectRow {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  lead: { name: string } | null;
  tasks: number;
  completed: number;
  overdue: number;
  percent: number;
  partial: boolean;
}

function ProjectsTab({ canCreate }: { canCreate: boolean }) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ title: "", dueAt: "", priority: "NORMAL", teamId: "" });
  const [teams, setTeams] = useState<Array<{ id: string; name: string; lead: boolean }>>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    workFetch<{ projects: ProjectRow[] }>(`/api/admin/work/projects${status ? `?status=${status}` : ""}`)
      .then((d) => setRows(d.projects))
      .catch((e) => toast.error("Couldn't load projects", { description: e.message }));
  }, [status]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (!showNew || teams.length) return;
    workFetch<{ teams: Array<{ id: string; name: string; lead: boolean }> }>("/api/admin/work/meta").then((d) => setTeams(d.teams)).catch(() => {});
  }, [showNew, teams.length]);

  const create = async () => {
    setSaving(true);
    try {
      await workFetch("/api/admin/work/projects", {
        method: "POST",
        body: JSON.stringify({ title: f.title, priority: f.priority, teamId: f.teamId || null, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null }),
      });
      toast.success("Project created");
      setShowNew(false);
      setF({ title: "", dueAt: "", priority: "NORMAL", teamId: "" });
      load();
    } catch (e) {
      toast.error("Couldn't create the project", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${input} w-auto`} aria-label="Project status">
          <option value="">Not archived</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        {canCreate && <button onClick={() => setShowNew((v) => !v)} className={btnGhost}><Plus className="h-4 w-4" /> New project</button>}
      </div>
      {showNew && (
        <div className={`${card} grid gap-3 sm:grid-cols-4`}>
          <div className="sm:col-span-2"><label className={label}>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={input} /></div>
          <div><label className={label}>Team</label>
            <select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })} className={input}>
              <option value="">— No team —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.lead ? " (you lead)" : ""}</option>)}
            </select>
          </div>
          <div><label className={label}>Deadline</label><input type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} className={input} /></div>
          <div className="sm:col-span-4 flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className={btnGhost}>Cancel</button>
            <button onClick={create} disabled={saving || f.title.trim().length < 3} className={btnPrimary}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create project</button>
          </div>
        </div>
      )}
      {!rows ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : rows.length === 0 ? (
        <Note>No projects yet.</Note>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => (
            <Link key={p.id} href={`/admin/work/projects/${p.id}`} className={`${card} block hover:border-slate-700`}>
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-blue-400" />
                <span className="font-mono text-[11px] text-slate-500">{p.code}</span>
                <StatusBadge status={p.status} />
              </div>
              <p className="mt-1.5 font-semibold text-white">{p.title}</p>
              <div className="mt-3 flex items-center gap-2"><ProgressBar percent={p.percent} /><span className="text-xs tabular-nums text-slate-300">{p.percent}%</span></div>
              <p className="mt-2 text-xs text-slate-400">
                {p.completed}/{p.tasks} tasks done
                {p.overdue > 0 && <span className="ml-1 text-red-300">· {p.overdue} overdue</span>} · due {fmtDate(p.dueAt)}
                {p.lead && <> · lead {p.lead.name}</>}
              </p>
              {p.partial && <p className="mt-1 text-[11px] text-slate-500">Counted over the tasks you can see.</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

