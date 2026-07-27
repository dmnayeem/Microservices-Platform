"use client";

import { useEffect, useState } from "react";
import { Loader2, Wallet, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import { newIdempotencyKey } from "@/lib/idempotency-key";

interface Deposit {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

const MANUAL_METHODS = [
  { key: "MANUAL_BKASH", label: "bKash", emoji: "📱" },
  { key: "MANUAL_NAGAD", label: "Nagad", emoji: "📲" },
  { key: "MANUAL_ROCKET", label: "Rocket", emoji: "🚀" },
  { key: "MANUAL_BANK", label: "Bank", emoji: "🏦" },
];

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
};

export function DepositView() {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("MANUAL_BKASH");
  const [txnId, setTxnId] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [gateways, setGateways] = useState<{ key: string; label: string }[]>([]);

  const load = () => {
    fetch("/api/deposits")
      .then((r) => r.json())
      .then((d) => setDeposits(d.deposits ?? []))
      .catch(() => setDeposits([]));
  };
  useEffect(() => {
    load();
    fetch("/api/deposits/gateway/providers")
      .then((r) => r.json())
      .then((d) => setGateways(d.providers ?? []))
      .catch(() => setGateways([]));
  }, []);

  const submitManual = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!txnId.trim()) {
      toast.error("Enter the transaction ID from your payment");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount: amt, method, txnId, proofUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success("Deposit submitted — awaiting approval");
      setAmount("");
      setTxnId("");
      setProofUrl("");
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const payOnline = async (provider?: string) => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/deposits/gateway/init", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount: amt, provider }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.redirectUrl) throw new Error(d.error ?? "Gateway unavailable");
      window.location.href = d.redirectUrl;
    } catch (err) {
      toast.error("Online payment unavailable", {
        description: err instanceof Error ? err.message : "Use a manual method",
      });
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-indigo-400" />
          Add Funds
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Top up your balance manually (admin-verified) or via online gateway.
        </p>
      </div>

      <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Amount (USD)
          </label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Manual method
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MANUAL_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={`p-2.5 rounded-lg border text-sm font-semibold ${
                  method === m.key
                    ? "border-indigo-500 bg-indigo-500/10 text-white"
                    : "border-gray-700 bg-gray-800 text-gray-300"
                }`}
              >
                <span className="mr-1">{m.emoji}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Transaction ID <span className="text-red-400">*</span>
          </label>
          <input
            value={txnId}
            onChange={(e) => setTxnId(e.target.value)}
            placeholder="e.g. TXN123456"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Payment screenshot (optional)
          </label>
          <ProofImageUpload value={proofUrl} onChange={setProofUrl} />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={submitManual}
            disabled={busy}
            className="flex-1 min-w-35 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit manual deposit
          </button>
          {gateways.length === 0 ? (
            <button
              onClick={() => payOnline()}
              disabled={busy}
              className="flex-1 min-w-35 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4" />
              Pay online
            </button>
          ) : (
            gateways.map((g) => (
              <button
                key={g.key}
                onClick={() => payOnline(g.key)}
                disabled={busy}
                className="flex-1 min-w-35 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                <ExternalLink className="w-4 h-4" />
                {g.label}
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-2">Recent deposits</h2>
        <div className="space-y-2">
          {deposits.length === 0 && (
            <p className="text-sm text-gray-500">No deposits yet.</p>
          )}
          {deposits.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  ${d.amount.toFixed(2)}{" "}
                  <span className="text-gray-500 font-normal">· {d.method.replace("MANUAL_", "")}</span>
                </p>
                <p className="text-[11px] text-gray-500">
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  STATUS_TONE[d.status] ?? "bg-gray-700 text-gray-300"
                }`}
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
