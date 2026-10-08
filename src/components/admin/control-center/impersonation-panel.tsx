"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, LogIn, ShieldOff } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Control Center → "Login as user": which admins may sign in as a user, and
 * which accounts nobody may sign in as. Super admin only (the page is).
 * Rules themselves: src/lib/impersonation.ts.
 */

interface StaffLite {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface BlockedRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

const roleLabel = (r: string) => r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function ImpersonationPanel({ staff }: { staff: StaffLite[] }) {
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/impersonation", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { adminIds: string[]; blocked: BlockedRow[] };
      setAllowed(new Set(d.adminIds));
      setSaved(new Set(d.adminIds));
      setBlocked(d.blocked);
    } catch {
      toast.error("Couldn't load Login-as-user access.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!allowed) return false;
    if (allowed.size !== saved.size) return true;
    for (const id of allowed) if (!saved.has(id)) return true;
    return false;
  }, [allowed, saved]);

  const save = async () => {
    if (!allowed) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/impersonation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminIds: [...allowed] }),
      });
      if (!r.ok) throw new Error();
      toast.success("Login-as-user access saved.");
      await load();
    } catch {
      toast.error("Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const unblock = async (id: string) => {
    const r = await fetch(`/api/admin/users/${id}/impersonation-block`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocked: false }),
    });
    if (r.ok) {
      setBlocked((b) => b.filter((x) => x.id !== id));
      toast.success("Login as user allowed for that account again.");
    } else toast.error("Couldn't change it.");
  };

  if (!allowed) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <LogIn className="h-4 w-4 text-sky-400" /> Admins who may use &ldquo;Login as user&rdquo;
        </p>
        <p className="mt-1 text-xs text-slate-400">
          You always can. Anyone ticked here can sign in as an <strong>ordinary user</strong> — never as a staff
          account or a super admin. Every sign-in is in the admin activity log and on that user&apos;s own activity.
        </p>
        {staff.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">There are no other staff accounts.</p>
        ) : (
          <ul className="mt-3 max-h-80 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
            {staff.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-800/40">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allowed.has(s.id)}
                    onChange={(e) =>
                      setAllowed((prev) => {
                        const next = new Set(prev ?? []);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{s.name || s.email}</span>
                    <span className="block truncate text-[11px] text-slate-500">{s.email}</span>
                  </span>
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                    {roleLabel(s.role)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
          {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldOff className="h-4 w-4 text-rose-400" /> Accounts nobody may log in as
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Protect an account from its page (Users → the user → &ldquo;Block login as user&rdquo;). A protected
          account can&apos;t be signed into by anyone, you included, until you allow it again. Super admins are always
          protected.
        </p>
        {blocked.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No accounts are protected yet.</p>
        ) : (
          <ul className="mt-3 max-h-80 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                <Link href={`/admin/users/${b.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-sm text-white">{b.name || b.email}</span>
                  <span className="block truncate text-[11px] text-slate-500">{b.email}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => unblock(b.id)}
                  className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Allow again
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
