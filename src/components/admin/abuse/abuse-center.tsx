"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, X, Copy, Plus, ShieldCheck, FileText, StickyNote, Zap, Radio } from "lucide-react";
import { toast } from "@/lib/toast";
import { ABUSE_ACTIONS, providerResponseText, type AbuseAction } from "@/lib/abuse/policy";

/* ── Shared ─────────────────────────────────────────────────────────────── */

interface Evidence {
  id: string;
  kind: "SIGNAL" | "SNAPSHOT" | "NOTE" | "ACTION";
  data: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
}
interface CaseDetail {
  id: string;
  status: string;
  severity: string;
  kind: string;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  signalCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  assignedToId: string | null;
  resolution: string | null;
  providerRef: string | null;
  withdrawalsHeld: boolean;
  evidence: Evidence[];
}
interface Person {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  status: string;
  role: string;
}
interface Detail {
  case: CaseDetail;
  users: Person[];
  contactEmail: string;
  platform: string;
  access: { manage: boolean; account: boolean };
}

async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error((j as { error?: string }).error ?? "Something went wrong");
    return null;
  }
  return j as T;
}

function useCase(caseId: string | null) {
  const [loaded, setLoaded] = useState<Detail | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!caseId) return;
    let alive = true;
    void api<Detail>(`/api/admin/abuse/cases/${caseId}`).then((d) => {
      if (alive) setLoaded(d);
    });
    return () => {
      alive = false;
    };
  }, [caseId, nonce]);
  // Only ever show the case that was asked for — never a stale one.
  const data = loaded && loaded.case.id === caseId ? loaded : null;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading: !!caseId && !data, reload };
}

const when = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const inp = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder-slate-500";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50";

const ACT_GROUPS: Array<{ title: string; items: AbuseAction[] }> = [
  { title: "Preserve", items: ["preserve_evidence"] },
  { title: "Account", items: ["suspend_user", "ban_user"] },
  { title: "Content & listings", items: ["hide_item", "hide_content", "unpublish_listings", "pause_ads", "pause_tasks"] },
  { title: "Money (nothing moves)", items: ["hold_withdrawals"] },
  { title: "Undo what this case did", items: ["restore_user", "restore_content", "restore_listings", "resume_ads", "resume_tasks", "release_withdrawals"] },
];

/* ── Case drawer ────────────────────────────────────────────────────────── */

export function CaseDrawerHost({ openCaseId }: { openCaseId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const close = () => {
    const p = new URLSearchParams(params.toString());
    p.delete("case");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  if (!openCaseId) return null;
  return <CaseDrawer caseId={openCaseId} onClose={close} />;
}

function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const { data, loading, reload } = useCase(caseId);
  const [picked, setPicked] = useState<Set<AbuseAction>>(new Set());
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ action: AbuseAction; ok: boolean; message: string }>>([]);
  const [note, setNote] = useState("");
  const [resolutionDraft, setResolution] = useState<string | null>(null);
  const resolution = resolutionDraft ?? data?.case.resolution ?? "";

  const people = useMemo(() => new Map((data?.users ?? []).map((u) => [u.id, u])), [data]);
  const c = data?.case;
  const account = c?.userId ? people.get(c.userId) : null;

  const toggle = (a: AbuseAction) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  const run = async () => {
    if (!picked.size || !confirmed) return;
    const labels = [...picked].map((a) => `• ${ABUSE_ACTIONS[a].label}`).join("\n");
    if (!window.confirm(`Run these on the case?\n\n${labels}`)) return;
    setBusy(true);
    const r = await api<{ results: Array<{ action: AbuseAction; ok: boolean; message: string }> }>(
      `/api/admin/abuse/cases/${caseId}/actions`,
      { method: "POST", body: JSON.stringify({ actions: [...picked], reason: reason.trim() || undefined, confirm: true }) }
    );
    setBusy(false);
    if (r) {
      setResults(r.results);
      setPicked(new Set());
      setConfirmed(false);
      toast.success("Done — see the results below");
      reload();
      router.refresh();
    }
  };

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const r = await api(`/api/admin/abuse/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusy(false);
    if (r) {
      toast.success(ok);
      reload();
      router.refresh();
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    const r = await api(`/api/admin/abuse/cases/${caseId}/notes`, { method: "POST", body: JSON.stringify({ note }) });
    setBusy(false);
    if (r) {
      setNote("");
      reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Case {caseId.slice(-8).toUpperCase()} {c ? `· ${c.kind.replace(/_/g, " ").toLowerCase()} · ${c.severity}` : ""}
            </p>
            <h2 className="mt-1 break-words text-lg font-bold text-white">{c?.summary ?? "Loading…"}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && !c && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}

        {c && data && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Status" value={c.status} />
              <Info label="Signals" value={`${c.signalCount} · first ${when(c.firstSeenAt)}`} />
              <Info
                label="Account"
                value={
                  account ? (
                    <Link href={`/admin/users/${account.id}`} className="text-blue-300 hover:underline">
                      {account.name ?? account.email} ({account.status.toLowerCase()})
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Info label="Item" value={c.entityType ? `${c.entityType} ${c.entityId ?? ""}` : "—"} />
              <Info label="Assigned" value={c.assignedToId ? people.get(c.assignedToId)?.name ?? people.get(c.assignedToId)?.email ?? "someone" : "nobody"} />
              <Info label="Provider ref" value={c.providerRef ?? "—"} />
              {c.withdrawalsHeld && <Info label="Withdrawals" value="On hold while this case is open" />}
            </div>

            {data.access.manage && (
              <div className="flex flex-wrap gap-2">
                {c.status !== "RESOLVED" && (
                  <button disabled={busy} onClick={() => patch({ status: "RESOLVED", resolution }, "Case resolved")} className={`${btn} bg-emerald-600 hover:bg-emerald-700`}>
                    Resolve
                  </button>
                )}
                {c.status !== "DISMISSED" && (
                  <button disabled={busy} onClick={() => patch({ status: "DISMISSED", resolution }, "Case dismissed")} className={`${btn} bg-slate-700 hover:bg-slate-600`}>
                    Dismiss (false alarm)
                  </button>
                )}
                {(c.status === "RESOLVED" || c.status === "DISMISSED") && (
                  <button disabled={busy} onClick={() => patch({ status: "ACTIONED" }, "Case reopened")} className={`${btn} bg-slate-700 hover:bg-slate-600`}>
                    Reopen
                  </button>
                )}
                <button disabled={busy} onClick={() => patch({ assignToMe: true }, "Assigned to you")} className={`${btn} bg-slate-800 hover:bg-slate-700`}>
                  Assign to me
                </button>
                <Link href={`/admin/abuse?tab=provider&case=${c.id}`} className={`${btn} bg-blue-600 hover:bg-blue-700`}>
                  Provider response
                </Link>
              </div>
            )}
            {data.access.manage && (
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={2}
                maxLength={5000}
                placeholder="Resolution (saved with Resolve / Dismiss)"
                className={inp}
              />
            )}

            {data.access.manage && (
              <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Zap className="h-4 w-4 text-amber-400" /> Actions
                </h3>
                {!c.userId && (
                  <p className="mb-2 text-xs text-slate-500">No account is attached to this case, so only item-level actions apply.</p>
                )}
                <div className="space-y-3">
                  {ACT_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{g.title}</p>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {g.items.map((a) => {
                          const def = ABUSE_ACTIONS[a];
                          const disabled =
                            (def.needsUser && !c.userId) ||
                            (a === "hide_item" && !c.entityId) ||
                            (["suspend_user", "ban_user", "restore_user"].includes(a) && !data.access.account);
                          return (
                            <label key={a} className={`flex items-center gap-2 text-sm ${disabled ? "text-slate-600" : "text-slate-200"}`}>
                              <input type="checkbox" disabled={disabled} checked={picked.has(a)} onChange={() => toggle(a)} />
                              {def.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  placeholder="Reason (shown to the user on a suspension, kept on the case)"
                  className={`${inp} mt-3`}
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  I have checked the evidence and want to run the ticked actions.
                </label>
                <button
                  disabled={busy || !picked.size || !confirmed}
                  onClick={run}
                  className={`${btn} mt-3 bg-red-600 hover:bg-red-700`}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Run {picked.size || ""} action{picked.size === 1 ? "" : "s"}
                </button>
                {results.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs">
                    {results.map((r) => (
                      <li key={r.action} className={r.ok ? "text-emerald-300" : "text-red-300"}>
                        {ABUSE_ACTIONS[r.action].label}: {r.message}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {data.access.manage && (
              <div className="flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} placeholder="Add a note…" className={inp} />
                <button disabled={busy || !note.trim()} onClick={addNote} className={`${btn} bg-slate-700 hover:bg-slate-600`}>
                  Add
                </button>
              </div>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Timeline (evidence is never edited or deleted)</h3>
              <ol className="space-y-2">
                {[...c.evidence].reverse().map((e) => (
                  <EvidenceRow key={e.id} e={e} by={e.createdById ? people.get(e.createdById) : undefined} />
                ))}
              </ol>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="break-words text-slate-200">{value}</div>
    </div>
  );
}

const EV_ICON = { SIGNAL: Radio, SNAPSHOT: FileText, NOTE: StickyNote, ACTION: Zap } as const;

function EvidenceRow({ e, by }: { e: Evidence; by?: Person }) {
  const [open, setOpen] = useState(false);
  const Icon = EV_ICON[e.kind] ?? FileText;
  const d = e.data as Record<string, unknown>;
  const line =
    e.kind === "SIGNAL"
      ? String(d.summary ?? "")
      : e.kind === "ACTION"
        ? `${String(d.label ?? d.action)} — ${String(d.message ?? (d.changed != null ? `${d.changed} changed` : ""))}`
        : e.kind === "NOTE"
          ? String(d.note ?? (d.change ? `Changed: ${JSON.stringify(d.change)}` : ""))
          : `Snapshot: ${countSnapshot(d)}`;
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {e.kind} · {when(e.createdAt)} · {by ? by.name ?? by.email : d.auto ? "automatic" : "system"}
          </p>
          <p className="break-words text-sm text-slate-200">{line}</p>
          <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-blue-300 hover:underline">
            {open ? "Hide data" : "Show data"}
          </button>
          {open && (
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-white/5 p-2 text-[11px] text-slate-300">
              {JSON.stringify(e.data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </li>
  );
}

function countSnapshot(d: Record<string, unknown>): string {
  const n = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0);
  return `${n("posts")} posts, ${n("comments")} comments, ${n("listings")} listings, ${n("ads")} ads, ${n("tasks")} tasks, ${n("ips")} IPs, ${n("devices")} devices, ${n("fraudEvents")} fraud events`;
}

/* ── Log a complaint by hand ────────────────────────────────────────────── */

export function LogComplaintButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ summary: "", providerRef: "", userId: "", entityType: "", entityId: "", severity: "HIGH", details: "" });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async () => {
    setBusy(true);
    const r = await api<{ caseId: string }>("/api/admin/abuse/cases", {
      method: "POST",
      body: JSON.stringify({
        kind: "PROVIDER_COMPLAINT",
        severity: f.severity,
        summary: f.summary,
        providerRef: f.providerRef || undefined,
        userId: f.userId || undefined,
        entityType: f.entityType || undefined,
        entityId: f.entityId || undefined,
        details: f.details || undefined,
      }),
    });
    setBusy(false);
    if (r) {
      setOpen(false);
      router.push(`/admin/abuse?status=ALL&case=${r.caseId}`);
      router.refresh();
    }
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${btn} bg-blue-600 hover:bg-blue-700`}>
        <Plus className="h-4 w-4" /> Log a provider complaint
      </button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm font-semibold text-white">Log a complaint from a host, network or advertiser</p>
      <input className={inp} placeholder="What they reported (one line)" value={f.summary} onChange={(e) => set("summary", e.target.value)} maxLength={1000} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inp} placeholder="Their ticket / complaint id" value={f.providerRef} onChange={(e) => set("providerRef", e.target.value)} maxLength={200} />
        <select className={inp} value={f.severity} onChange={(e) => set("severity", e.target.value)}>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input className={inp} placeholder="User id (if known)" value={f.userId} onChange={(e) => set("userId", e.target.value)} maxLength={64} />
        <div className="flex gap-2">
          <select className={inp} value={f.entityType} onChange={(e) => set("entityType", e.target.value)}>
            <option value="">Item type…</option>
            {["post", "comment", "listing", "task", "ad", "upload", "profile"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input className={inp} placeholder="Item id" value={f.entityId} onChange={(e) => set("entityId", e.target.value)} maxLength={64} />
        </div>
      </div>
      <textarea className={inp} rows={4} placeholder="Paste the complaint (kept as evidence)" value={f.details} onChange={(e) => set("details", e.target.value)} maxLength={10000} />
      <div className="flex gap-2">
        <button disabled={busy || f.summary.trim().length < 3} onClick={submit} className={`${btn} bg-blue-600 hover:bg-blue-700`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open case
        </button>
        <button onClick={() => setOpen(false)} className={`${btn} bg-slate-700 hover:bg-slate-600`}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-500">
        CRITICAL runs the critical-signal rules (hide the item; suspend only if that setting is on).
      </p>
    </div>
  );
}

/* ── Provider response ─────────────────────────────────────────────────── */

interface CaseOption {
  id: string;
  kind: string;
  severity: string;
  status: string;
  summary: string;
  providerRef: string | null;
  lastSeenAt: string;
}

export function ProviderResponse({ cases, initialCaseId, canEdit }: { cases: CaseOption[]; initialCaseId: string | null; canEdit: boolean }) {
  const [caseId, setCaseId] = useState<string | null>(initialCaseId ?? cases[0]?.id ?? null);
  const { data, reload } = useCase(caseId);
  // What the admin typed, per case; anything untouched falls back to what the
  // case itself says.
  const [edits, setEdits] = useState<Record<string, { reported?: string; found?: string; ref?: string }>>({});
  const edit = (k: "reported" | "found" | "ref", v: string) => {
    if (caseId) setEdits((e) => ({ ...e, [caseId]: { ...e[caseId], [k]: v } }));
  };

  const defaults = useMemo(() => {
    if (!data) return { reported: "", found: "", ref: "" };
    const ev = data.case.evidence;
    const signals = ev.filter((e) => e.kind === "SIGNAL");
    const pub = signals.map((s) => (s.data.evidence ?? {}) as Record<string, unknown>).find((x) => x.source === "public_form" || x.details);
    const reportedLines = [
      ...new Set(signals.map((s) => String(s.data.summary ?? "")).filter(Boolean)),
    ].slice(0, 5);
    if (pub?.urls) reportedLines.push(`URLs: ${String(pub.urls)}`);
    if (pub?.description) reportedLines.push(String(pub.description));
    if (pub?.details) reportedLines.push(String(pub.details));
    const reported = reportedLines.join("\n");

    const snap = [...ev].reverse().find((e) => e.kind === "SNAPSHOT");
    const kinds = [...new Set(signals.map((s) => String(s.data.kind ?? "")))].join(", ");
    const found = [
        `${data.case.signalCount} signal(s) (${kinds || data.case.kind}) between ${when(data.case.firstSeenAt)} and ${when(data.case.lastSeenAt)}.`,
        data.case.entityType ? `Concerned item: ${data.case.entityType} ${data.case.entityId ?? ""}.` : "",
        snap ? `Account activity preserved: ${countSnapshot(snap.data)}.` : "",
        data.case.resolution ?? "",
      ]
        .filter(Boolean)
        .join("\n");
    return { reported, found, ref: data.case.providerRef ?? "" };
  }, [data]);
  const mine = (caseId && edits[caseId]) || {};
  const reported = mine.reported ?? defaults.reported;
  const found = mine.found ?? defaults.found;
  const ref = mine.ref ?? defaults.ref;

  const actions = useMemo(
    () =>
      (data?.case.evidence ?? [])
        .filter((e) => e.kind === "ACTION" && e.data.ok !== false && (e.data.action === "preserve_evidence" || Number(e.data.changed ?? 0) > 0))
        .map((e) => ({ at: e.createdAt, label: String(e.data.label ?? e.data.action), detail: String(e.data.message ?? "") || undefined })),
    [data]
  );

  const text = data
    ? providerResponseText({
        platform: data.platform,
        contactEmail: data.contactEmail,
        providerRef: ref || null,
        caseId: data.case.id.slice(-8).toUpperCase(),
        reported,
        found,
        actions,
      })
    : "";

  const saveRef = async () => {
    if (!caseId) return;
    const r = await api(`/api/admin/abuse/cases/${caseId}`, { method: "PATCH", body: JSON.stringify({ providerRef: ref }) });
    if (r) {
      toast.success("Provider ticket saved on the case");
      reload();
    }
  };

  if (cases.length === 0) return <p className="text-sm text-slate-500">No cases yet.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-xs text-slate-400">
          Case
          <select className={`${inp} mt-1`} value={caseId ?? ""} onChange={(e) => setCaseId(e.target.value)}>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id.slice(-8).toUpperCase()} · {c.severity} · {c.status} · {c.summary.slice(0, 70)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Provider ticket / complaint id
          <div className="mt-1 flex gap-2">
            <input className={inp} value={ref} onChange={(e) => edit("ref", e.target.value)} maxLength={200} />
            {canEdit && (
              <button onClick={saveRef} className={`${btn} bg-slate-700 hover:bg-slate-600`}>
                Save
              </button>
            )}
          </div>
        </label>
        <label className="block text-xs text-slate-400">
          What was reported
          <textarea className={`${inp} mt-1`} rows={5} value={reported} onChange={(e) => edit("reported", e.target.value)} />
        </label>
        <label className="block text-xs text-slate-400">
          What we found
          <textarea className={`${inp} mt-1`} rows={5} value={found} onChange={(e) => edit("found", e.target.value)} />
        </label>
        <p className="text-xs text-slate-500">
          Actions are filled from the case timeline with their times. Take them on the Cases tab first; each one is logged.
        </p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Reply</p>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success("Copied");
              } catch {
                toast.error("Couldn't copy — select the text instead");
              }
            }}
            className={`${btn} bg-blue-600 hover:bg-blue-700`}
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
        </div>
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-200">
          {text || "Loading…"}
        </pre>
      </div>
    </div>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────── */

export function AbuseSettingsForm({
  initial,
  canEdit,
}: {
  initial: { email: string; autoHideOnCritical: boolean; autoSuspendOnCritical: boolean; notifyAdmins: boolean };
  canEdit: boolean;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await api<{ settings: typeof initial }>("/api/admin/abuse/settings", { method: "POST", body: JSON.stringify(s) });
    setBusy(false);
    if (r) {
      setS(r.settings);
      toast.success("Settings saved");
    }
  };
  const toggleRow = (k: "autoHideOnCritical" | "autoSuspendOnCritical" | "notifyAdmins", title: string, help: string) => (
    <label key={k} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <input type="checkbox" className="mt-1" disabled={!canEdit} checked={s[k]} onChange={(e) => setS((x) => ({ ...x, [k]: e.target.checked }))} />
      <span>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-slate-400">{help}</span>
      </span>
    </label>
  );
  return (
    <div className="max-w-2xl space-y-3">
      {toggleRow("autoHideOnCritical", "Hide the item on a critical signal", "A confirmed malware upload, a phishing post and the like are hidden at once (only that one item). Undo from the case. On by default.")}
      {toggleRow("autoSuspendOnCritical", "Suspend the account on a critical signal", "Off by default. When on, a critical signal suspends the account (appealable). Staff are never suspended automatically.")}
      {toggleRow("notifyAdmins", "Notify admins on high and critical cases", "A bell notification to staff who can see this page, when such a case opens or escalates.")}
      <label className="block rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <span className="block text-sm font-semibold text-white">Abuse contact email</span>
        <span className="block text-xs text-slate-400">Shown on the public /abuse page and in provider replies.</span>
        <input className={`${inp} mt-2`} disabled={!canEdit} value={s.email} onChange={(e) => setS((x) => ({ ...x, email: e.target.value }))} maxLength={200} />
      </label>
      {canEdit && (
        <button disabled={busy} onClick={save} className={`${btn} bg-blue-600 hover:bg-blue-700`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      )}
    </div>
  );
}
