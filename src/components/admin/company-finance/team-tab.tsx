"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, ShieldCheck, Search, KeyRound } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { api, btnGhost, btnPrimary, cardCls, Empty, Field, inputCls, Loading, Modal, Pill } from "./ui";

type Grant = { key: string; label: string };
type Member = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  financeGrants: string[];
  lastLoginAt: string | null;
  grantable: Grant[];
};
type Resp = {
  team: Member[];
  candidates: Member[];
  newModeratorGrantable: Grant[];
  actorRole: string;
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  FINANCE_ADMIN: "Finance admin",
  FINANCE_MODERATOR: "Finance moderator",
};

/**
 * Who works on the books.
 *
 * A super admin sees everyone and may grant finance access to ANY staff member.
 * A finance admin sees the same list but may only create, widen and suspend
 * finance moderators. Nobody else reaches this screen at all.
 */
export function TeamTab() {
  const [data, setData] = useState<Resp | null>(null);
  const [q, setQ] = useState("");
  const [grantFor, setGrantFor] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    try {
      setData(await api<Resp>(`/api/admin/company-finance/team${search ? `?q=${encodeURIComponent(search)}` : ""}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the team");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const isSuper = data?.actorRole === "SUPER_ADMIN";

  const act = async (m: Member, action: string, question: string, detail: string) => {
    if (!(await confirmDialog({ title: question, description: detail, tone: action === "activate" ? "info" : "danger" }))) return;
    setBusy(m.id);
    try {
      await api("/api/admin/company-finance/team", { method: "POST", body: JSON.stringify({ action, userId: m.id }) });
      toast.success("Done");
      await load(q);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not do that");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Loading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-400">
          Only a super admin and a finance admin see the books. Finance moderators record entries; what else they can do is
          decided here, one permission at a time. A manager cannot touch any of this.
        </p>
        <button className={btnPrimary} onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" /> New finance moderator
        </button>
      </div>

      <div className={`${cardCls} divide-y divide-slate-800`}>
        {data.team.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">
                {m.name ?? m.email}
                <span className="ml-2 text-xs font-normal text-slate-500">{m.email}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{ROLE_LABEL[m.role] ?? m.role.replace(/_/g, " ").toLowerCase()}</span>
                {m.status !== "ACTIVE" && <Pill value={m.status} />}
                {m.financeGrants.map((g) => (
                  <span key={g} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {m.grantable.find((x) => x.key === g)?.label ?? g}
                  </span>
                ))}
                {m.role !== "SUPER_ADMIN" && m.role !== "FINANCE_ADMIN" && m.financeGrants.length === 0 && m.role !== "FINANCE_MODERATOR" && (
                  <span className="text-[10px] text-slate-600">no finance access</span>
                )}
              </div>
            </div>
            <div className="flex gap-1.5">
              {m.grantable.length > 0 && (
                <button className={btnGhost} onClick={() => setGrantFor(m)} disabled={busy === m.id}>
                  <KeyRound className="h-4 w-4" /> Access
                </button>
              )}
              {m.role === "FINANCE_MODERATOR" && (
                <>
                  {m.status === "ACTIVE" ? (
                    <button className={btnGhost} disabled={busy === m.id} onClick={() => act(m, "suspend", `Suspend ${m.name ?? m.email}?`, "They are signed out of finance until reactivated.")}>Suspend</button>
                  ) : (
                    <button className={btnGhost} disabled={busy === m.id} onClick={() => act(m, "activate", `Reactivate ${m.name ?? m.email}?`, "They regain the access listed here.")}>Reactivate</button>
                  )}
                  <button className={btnGhost} disabled={busy === m.id} onClick={() => act(m, "demote", `Remove ${m.name ?? m.email} from the finance team?`, "Their account becomes a regular user and every finance permission they held is removed.")}>
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {isSuper && (
        <div className={`${cardCls} p-4`}>
          <p className="mb-1 text-sm font-semibold text-white">Grant finance access to another staff member</p>
          <p className="mb-3 text-xs text-slate-500">
            By default no admin, manager or moderator sees finance. Search a staff member to give them specific permissions.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input className={`${inputCls} pl-9`} placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load(q)} />
            </div>
            <button className={btnGhost} onClick={() => void load(q)}>Search</button>
          </div>
          {q && data.candidates.length === 0 && <p className="mt-2 text-xs text-slate-500">No staff found — press Search after typing.</p>}
          <div className="mt-2 space-y-1">
            {data.candidates.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/50">
                <span className="truncate text-sm text-slate-200">
                  {c.name ?? c.email} <span className="text-xs text-slate-500">· {c.role.replace(/_/g, " ").toLowerCase()}</span>
                </span>
                <button className={btnGhost} onClick={() => setGrantFor(c)}>
                  <KeyRound className="h-4 w-4" /> Access
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.team.length === 0 && <Empty>No one yet.</Empty>}

      {grantFor && (
        <GrantModal
          member={grantFor}
          onClose={() => setGrantFor(null)}
          onSaved={async () => {
            setGrantFor(null);
            await load(q);
          }}
        />
      )}
      {creating && (
        <CreateModal
          grantable={data.newModeratorGrantable}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load(q);
          }}
        />
      )}
    </div>
  );
}

function GrantModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [sel, setSel] = useState<Set<string>>(new Set(member.financeGrants));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/company-finance/team", {
        method: "POST",
        body: JSON.stringify({ action: "grants", userId: member.id, grants: [...sel] }),
      });
      toast.success("Access updated");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Finance access — ${member.name ?? member.email}`} onClose={onClose}>
      <div className="space-y-2">
        {member.role === "FINANCE_MODERATOR" && (
          <p className="text-xs text-slate-500">Finance moderators always see the books and can record entries. Add more below.</p>
        )}
        {member.grantable.map((g) => (
          <label key={g.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800/50">
            <input
              type="checkbox"
              checked={sel.has(g.key)}
              onChange={(e) => {
                const next = new Set(sel);
                if (e.target.checked) next.add(g.key);
                else next.delete(g.key);
                setSel(next);
              }}
            />
            {g.label}
          </label>
        ))}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save access</button>
        </div>
      </div>
    </Modal>
  );
}

function CreateModal({ grantable, onClose, onSaved }: { grantable: Grant[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const extra = grantable.filter((g) => g.key !== "finance.view" && g.key !== "finance.entries.create");
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/company-finance/team", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...f, grants: [...sel] }),
      });
      toast.success("Finance moderator created");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="New finance moderator" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" hint="Follows the platform password policy. Share it privately.">
          <input className={inputCls} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <p className="text-xs text-slate-500">They can see the books and record entries. Also allow:</p>
        {extra.map((g) => (
          <label key={g.key} className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={sel.has(g.key)}
              onChange={(e) => {
                const next = new Set(sel);
                if (e.target.checked) next.add(g.key);
                else next.delete(g.key);
                setSel(next);
              }}
            />
            {g.label}
          </label>
        ))}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create</button>
        </div>
      </div>
    </Modal>
  );
}
