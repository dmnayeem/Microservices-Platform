"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Plus, Trash2, Loader2, Pencil, Shield, ChevronDown, ChevronRight, Check, Minus } from "lucide-react";
import {
  PERMISSION_CATALOG,
  FINANCE_PERMISSIONS,
  SUPERADMIN_ONLY_PERMISSIONS,
  permissionLabel,
  permissionDescription,
} from "@/lib/rbac";

interface CustomRole {
  id: string;
  name: string;
  color: string | null;
  permissions: string[];
  isActive: boolean;
  userCount: number;
}

// Permission groups a custom role may pick from — finance + admins.manage are
// hard-excluded (never grantable to a custom role).
const HIDDEN = new Set<string>([...FINANCE_PERMISSIONS, ...SUPERADMIN_ONLY_PERMISSIONS]);
const CATALOG = PERMISSION_CATALOG.map((c) => ({
  label: c.label,
  permissions: c.permissions.filter((p) => !HIDDEN.has(p)),
})).filter((c) => c.permissions.length > 0);

const inp = "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500";

export function CustomRolesManager({
  initial,
  canManage,
}: {
  initial: CustomRole[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const startCreate = () => {
    setEditing(null); setName(""); setColor("#6366f1"); setPerms(new Set()); setOpen(true);
  };
  const startEdit = (r: CustomRole) => {
    setEditing(r); setName(r.name); setColor(r.color ?? "#6366f1");
    setPerms(new Set(r.permissions)); setOpen(true);
  };

  const togglePerm = (p: string) =>
    setPerms((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const toggleCat = (cat: { permissions: string[] }, on: boolean) =>
    setPerms((prev) => {
      const n = new Set(prev);
      for (const p of cat.permissions) {
        if (on) n.add(p);
        else n.delete(p);
      }
      return n;
    });
  const catState = (cat: { permissions: string[] }) => {
    const has = cat.permissions.filter((p) => perms.has(p)).length;
    return has === 0 ? "none" : has === cat.permissions.length ? "all" : "some";
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      const url = editing ? `/api/admin/access/custom-roles/${editing.id}` : "/api/admin/access/custom-roles";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, permissions: Array.from(perms) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      toast.success(editing ? "Role updated" : "Role created");
      setOpen(false); router.refresh();
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "Try again" });
    } finally { setBusy(false); }
  };

  const remove = async (r: CustomRole) => {
    if (!confirm(`Delete "${r.name}"? ${r.userCount} user(s) will fall back to plain Admin.`)) return;
    const res = await fetch(`/api/admin/access/custom-roles/${r.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); router.refresh(); } else toast.error("Delete failed");
  };

  const totalSelectable = useMemo(() => CATALOG.reduce((n, c) => n + c.permissions.length, 0), []);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-300" /> Custom roles
          </h2>
          <p className="text-sm text-slate-400">
            Create named roles with any permissions (finance &amp; role-editing are never included). Assign them from a user&apos;s role dropdown.
          </p>
        </div>
        {canManage && (
          <button onClick={startCreate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shrink-0">
            <Plus className="w-4 h-4" /> New role
          </button>
        )}
      </div>

      {!canManage && <p className="text-xs text-amber-400/80">Read-only — only a super admin can edit custom roles.</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {initial.length === 0 && <p className="text-sm text-slate-500">No custom roles yet.</p>}
        {initial.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: (r.color ?? "#6366f1") + "22", color: r.color ?? "#a5b4fc" }}>
              {r.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white truncate">{r.name}{!r.isActive && <span className="text-xs text-amber-400"> (off)</span>}</p>
              <p className="text-xs text-slate-500">{r.permissions.length} perms · {r.userCount} user(s)</p>
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(r)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remove(r)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="mx-auto my-6 w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">{editing ? "Edit role" : "New role"}</h3>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="e.g. Support Level 2" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Color</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 bg-slate-800 border border-slate-700 rounded-lg" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">Permissions ({perms.size}/{totalSelectable})</p>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {CATALOG.map((cat) => {
                const st = catState(cat);
                const isOpen = expanded[cat.label] ?? false;
                return (
                  <div key={cat.label} className="rounded-lg border border-slate-800 bg-slate-950/40">
                    <div className="flex items-center justify-between px-3 py-2">
                      <button onClick={() => setExpanded((e) => ({ ...e, [cat.label]: !isOpen }))} className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        {cat.label}
                        <span className="text-xs font-normal text-slate-500">{cat.permissions.filter((p) => perms.has(p)).length}/{cat.permissions.length}</span>
                      </button>
                      <button onClick={() => toggleCat(cat, st !== "all")} className={`relative h-6 w-11 shrink-0 rounded-full ${st === "all" ? "bg-emerald-500" : st === "some" ? "bg-amber-500/70" : "bg-slate-700"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${st === "none" ? "left-0.5" : "left-0.5 translate-x-5"}`} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="grid grid-cols-1 gap-1 border-t border-slate-800 px-3 py-2 sm:grid-cols-2">
                        {cat.permissions.map((p) => {
                          const on = perms.has(p);
                          return (
                            <button key={p} onClick={() => togglePerm(p)} title={p} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800/60">
                              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-slate-600 text-transparent"}`}>
                                {on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-xs font-medium text-slate-200">{permissionLabel(p)}</span>
                                {permissionDescription(p) && (
                                  <span className="block text-[10px] text-slate-500 leading-tight">{permissionDescription(p)}</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-white text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
