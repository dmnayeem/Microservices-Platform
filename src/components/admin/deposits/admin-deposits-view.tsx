"use client";

import { confirmDialog } from "@/lib/confirm";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, X, Download, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";

interface Person { name: string | null; email: string }
interface Deposit {
  id: string;
  amount: number;
  method: string;
  status: string;
  txnId: string | null;
  proofUrl: string | null;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: Person | null;
  reviewer: Person | null;
}

const STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
};

export function AdminDepositsView({ canProcess = false }: { canProcess?: boolean }) {
  const [status, setStatus] = useState("PENDING");
  const [method, setMethod] = useState("all");
  const [methods, setMethods] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/deposits?status=${status}&method=${method}`)
      .then((r) => r.json())
      .then((d) => {
        setDeposits(d.deposits ?? []);
        if (Array.isArray(d.methods)) setMethods((prev) => Array.from(new Set([...prev, ...d.methods])));
      })
      .catch(() => setDeposits([]))
      .finally(() => setLoading(false));
  }, [status, method]);
  useEffect(() => { load(); }, [load]);

  const review = async (id: string, action: "approve" | "reject") => {
    if (action === "reject" && !(await confirmDialog({ title: "Reject this deposit?", tone: "danger", confirmLabel: "Reject" }))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/deposits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success(action === "approve" ? "Approved & credited" : "Rejected");
      load();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/deposits/export?status=${status}&method=${method}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="(.+?)"/)?.[1] ?? "deposits.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't export");
    } finally {
      setExporting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const rows = q
    ? deposits.filter(
        (d) =>
          (d.user?.name ?? "").toLowerCase().includes(q) ||
          (d.user?.email ?? "").toLowerCase().includes(q) ||
          (d.txnId ?? "").toLowerCase().includes(q)
      )
    : deposits;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-white">Deposits</h1>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${status === s ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            {s}
          </button>
        ))}
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="ml-auto bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All methods</option>
          {methods.map((m) => <option key={m} value={m}>{m.replace("MANUAL_", "")}</option>)}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user / txn…"
            className="pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      )}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-slate-500 py-8 text-center">No {status.toLowerCase()} deposits.</p>
      )}

      <div className="space-y-2">
        {rows.map((d) => (
          <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-white">
                  ${d.amount.toFixed(2)}
                  <span className="ml-2 text-xs font-medium text-slate-400">{d.method.replace("MANUAL_", "")}</span>
                  <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONE[d.status] ?? "bg-slate-700 text-slate-300"}`}>{d.status}</span>
                </p>
                <p className="mt-0.5 text-sm text-white truncate">{d.user?.name ?? d.user?.email ?? "Unknown user"}</p>
                <p className="text-xs text-slate-500 truncate">
                  {d.user?.email ?? ""} · TXN {d.txnId ?? "—"} · {new Date(d.createdAt).toLocaleString()}
                </p>
                {d.reviewer && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Reviewed by {d.reviewer.name ?? d.reviewer.email}
                    {d.reviewedAt ? ` · ${new Date(d.reviewedAt).toLocaleDateString()}` : ""}
                    {d.adminNote ? ` · "${d.adminNote}"` : ""}
                  </p>
                )}
              </div>

              {canProcess && d.status === "PENDING" && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => review(d.id, "approve")} disabled={busyId === d.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => review(d.id, "reject")} disabled={busyId === d.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 text-xs font-semibold disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>

            {d.proofUrl && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-500 mb-1">Payment proof</p>
                <ImageZoomGallery images={[d.proofUrl]} size={64} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
