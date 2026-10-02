"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { PWA_PLATFORM_LABEL, type PwaPlatform } from "@/lib/pwa-shared";

export interface ReachTableRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  status: string;
  pushState: "on" | "off" | "notset";
  devices: number;
  emailOn: boolean;
  installed: boolean;
  platform: string | null;
  /** YYYY-MM-DD (UTC day) */
  lastActive: string | null;
}

const PUSH_BADGE: Record<ReachTableRow["pushState"], { label: string; cls: string }> = {
  on: { label: "On", cls: "bg-emerald-500/10 text-emerald-400" },
  off: { label: "Off (setting)", cls: "bg-rose-500/10 text-rose-400" },
  notset: { label: "Not set up", cls: "bg-amber-500/10 text-amber-400" },
};

interface RemindResult {
  sent: number;
  skippedRecent: number;
  skippedOther: number;
  capped: boolean;
  error?: string;
}

export function NotificationReachTable({
  rows,
  total,
  filters,
  canRemind,
  remindAllowedForFilter,
  cooldownDays,
  emptyText,
}: {
  rows: ReachTableRow[];
  total: number;
  filters: Record<string, string>;
  canRemind: boolean;
  remindAllowedForFilter: boolean;
  cooldownDays: number;
  emptyText: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Only users who are NOT on can be reminded.
  const selectable = rows.filter((r) => r.pushState !== "on");
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));

  const send = async (body: { userIds: string[] } | { filters: Record<string, string> }, what: string) => {
    const ok = await confirmDialog({
      title: "Send reminder?",
      description: `${what} will get an in-app notification: "Turn on notifications". Anyone reminded in the last ${cooldownDays} days is skipped.`,
      confirmLabel: "Send reminder",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/notification-reach/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as RemindResult;
      if (!res.ok) throw new Error(data.error || "Try again");
      const parts = [
        data.skippedRecent ? `${data.skippedRecent.toLocaleString()} skipped (reminded in the last ${cooldownDays} days)` : "",
        data.skippedOther ? `${data.skippedOther.toLocaleString()} skipped (already on or not active)` : "",
        data.capped ? "capped at 5,000 — send again for the rest" : "",
      ].filter(Boolean);
      toast.success(`Reminder sent to ${data.sent.toLocaleString()} user(s)`, {
        description: parts.join(" · ") || undefined,
      });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error("Couldn't send the reminder", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-3 text-sm text-white">
        <span>
          <span className="font-semibold tabular-nums">{total.toLocaleString()}</span> users
        </span>
        {canRemind && (
          <span className="ml-auto flex flex-wrap gap-2">
            <button
              disabled={busy || selected.size === 0}
              onClick={() => send({ userIds: [...selected] }, `${selected.size} selected user(s)`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Remind selected ({selected.size})
            </button>
            {remindAllowedForFilter && total > 0 && (
              <button
                disabled={busy}
                onClick={() =>
                  send(
                    { filters },
                    `Everyone matching this filter who doesn't have push on (${Math.min(total, 5000).toLocaleString()} at most${total > 5000 ? ", capped at 5,000" : ""})`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                <BellRing className="h-4 w-4" /> Remind all matching
              </button>
            )}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                {canRemind && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={selectable.length === 0}
                    />
                  </th>
                )}
                <th className="px-4 py-3">User</th>
                <th className="px-3 py-3">Push</th>
                <th className="px-3 py-3">Devices</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">App</th>
                <th className="px-3 py-3">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const badge = PUSH_BADGE[u.pushState];
                return (
                  <tr key={u.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    {canRemind && (
                      <td className="px-4 py-3">
                        {u.pushState !== "on" && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${u.name || u.email}`}
                            checked={selected.has(u.id)}
                            onChange={() => toggle(u.id)}
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="group block min-w-0">
                        <span className="font-medium text-white group-hover:underline">{u.name || u.username || "—"}</span>
                        <span className="block max-w-[14rem] truncate text-xs text-gray-500">{u.email}</span>
                        {u.status !== "ACTIVE" && <span className="text-[10px] uppercase text-gray-500">{u.status}</span>}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-white">{u.devices}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {u.emailOn ? (
                        <span className="text-xs text-sky-400">On</span>
                      ) : (
                        <span className="text-xs text-gray-500">Off</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-300">
                      {u.installed
                        ? u.platform
                          ? PWA_PLATFORM_LABEL[u.platform as PwaPlatform] ?? u.platform
                          : "Yes"
                        : <span className="text-xs text-gray-600">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-400">
                      {u.lastActive ? format(new Date(`${u.lastActive}T00:00:00Z`), "MMM d, yyyy") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
