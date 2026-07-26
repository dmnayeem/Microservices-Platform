"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Loader2,
  Save,
  Pencil,
  Trash2,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminTable,
  type AdminColumn,
} from "@/components/admin/ui/admin-table";

interface ProxyServer {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  country: string | null;
  status: string;
  loadPercent: number;
  maxConcurrent: number;
  bandwidthMbUser: number;
}

interface Props {
  initial: ProxyServer[];
  canManage: boolean;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  INACTIVE: "bg-slate-700 text-slate-300",
  ERROR: "bg-red-500/15 text-red-400",
};

export function ProxyClient({ initial, canManage }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProxyServer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (s: ProxyServer) => {
    if (!(await confirmDialog({ title: `Delete server "${s.name}"?`, description: `${s.host}:${s.port}`, tone: "danger", confirmLabel: "Delete" }))) return;
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/admin/proxy/servers/${s.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Server deleted");
      router.refresh();
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: AdminColumn<ProxyServer>[] = [
    {
      key: "name",
      header: "Name / Country",
      primary: true,
      cell: (s) => (
        <>
          <p className="text-white font-medium">{s.name}</p>
          <p className="text-xs text-slate-500">{s.country ?? "—"}</p>
        </>
      ),
    },
    {
      key: "hostPort",
      header: "Host:Port",
      className: "font-mono text-slate-300",
      cell: (s) => (
        <>
          {s.host}:{s.port}
        </>
      ),
    },
    {
      key: "protocol",
      header: "Protocol",
      className: "text-slate-300",
      cell: (s) => s.protocol,
    },
    {
      key: "load",
      header: "Load",
      cell: (s) => (
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                s.loadPercent < 50
                  ? "bg-emerald-500"
                  : s.loadPercent < 80
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${s.loadPercent}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {s.loadPercent}%
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            STATUS_TONE[s.status] ?? "bg-slate-700 text-slate-300"
          }`}
        >
          ● {s.status}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            cell: (s: ProxyServer) => (
              <div className="inline-flex gap-1">
                <button
                  onClick={() => setEditing(s)}
                  className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={busyId === s.id}
                  onClick={() => remove(s)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 disabled:opacity-50"
                  title="Delete"
                >
                  {busyId === s.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ),
          } as AdminColumn<ProxyServer>,
        ]
      : []),
  ];

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      )}

      <AdminTable<ProxyServer>
        columns={columns}
        rows={initial}
        getRowKey={(s) => s.id}
        empty={
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
            <Globe className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-white mb-1">
              No proxy servers
            </h3>
            <p className="text-sm text-slate-400">
              Add country-specific proxy servers for proxy tasks.
            </p>
          </div>
        }
      />

      {showCreate && <ServerModal onClose={() => setShowCreate(false)} />}
      {editing && (
        <ServerModal server={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ServerModal({
  server,
  onClose,
}: {
  server?: ProxyServer;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isEdit = !!server;
  const [form, setForm] = useState({
    name: server?.name ?? "",
    host: server?.host ?? "",
    port: server?.port ?? 8080,
    protocol: server?.protocol ?? "HTTPS",
    country: server?.country ?? "",
    status: server?.status ?? "ACTIVE",
    maxConcurrent: server?.maxConcurrent ?? 50,
    bandwidthMbUser: server?.bandwidthMbUser ?? 100,
  });

  const submit = async () => {
    if (!form.name.trim() || !form.host.trim()) {
      toast.error("Name and host required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        ...form,
        country: form.country.trim() || null,
      };
      const res = await fetch(
        isEdit
          ? `/api/admin/proxy/servers/${server.id}`
          : "/api/admin/proxy/servers",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(isEdit ? "Server updated" : "Server created");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Proxy Server" : "Add Proxy Server"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          <Field label="Name *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Singapore Premium"
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Host *">
              <input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="proxy.example.com"
                className={inp}
              />
            </Field>
            <Field label="Port *">
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: parseInt(e.target.value) || 0 })
                }
                className={inp}
              />
            </Field>
            <Field label="Protocol">
              <select
                value={form.protocol}
                onChange={(e) =>
                  setForm({ ...form, protocol: e.target.value })
                }
                className={inp}
              >
                <option value="HTTPS">HTTPS</option>
                <option value="HTTP">HTTP</option>
                <option value="SOCKS5">SOCKS5</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country (ISO code)">
              <input
                value={form.country}
                onChange={(e) =>
                  setForm({ ...form, country: e.target.value.toUpperCase() })
                }
                placeholder="US, IN, BD…"
                maxLength={4}
                className={inp + " font-mono"}
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inp}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ERROR">Error</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Concurrent Sessions">
              <input
                type="number"
                min={1}
                value={form.maxConcurrent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxConcurrent: parseInt(e.target.value) || 1,
                  })
                }
                className={inp}
              />
            </Field>
            <Field label="Bandwidth/User (MB)">
              <input
                type="number"
                min={1}
                value={form.bandwidthMbUser}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bandwidthMbUser: parseInt(e.target.value) || 1,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEdit ? "Save Changes" : "Create Server"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
