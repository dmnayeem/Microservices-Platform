"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Plus,
  Loader2,
  Trash2,
  Star,
  ShieldCheck,
  Info,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { BrandIcon } from "@/components/ui/brand-icon";

interface SavedMethod {
  id: string;
  method: string;
  accountNumber: string; // already masked by the API
  accountName: string | null;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
}

interface AvailableMethod {
  method: string;
  name: string;
  icon: string;
  minWithdrawal: number;
  fee: { percentage: number; fixed: number };
}

export function PaymentMethodsView() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SavedMethod[]>([]);
  const [available, setAvailable] = useState<AvailableMethod[]>([]);

  // Add-form state
  const [method, setMethod] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [setDefault, setSetDefault] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payment-methods");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSaved(data.paymentMethods ?? []);
      setAvailable(data.availableMethods ?? []);
      if (!method && data.availableMethods?.[0]) {
        setMethod(data.availableMethods[0].method);
      }
    } catch {
      toast.error("Couldn't load payment methods");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = available.find((a) => a.method === method);

  const handleAdd = async () => {
    if (!method) {
      toast.error("Choose a payment method");
      return;
    }
    if (accountNumber.trim().length < 5) {
      toast.error("Enter a valid account number");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim() || undefined,
          setAsDefault: setDefault,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      toast.success("Payment method added");
      setAccountNumber("");
      setAccountName("");
      setSetDefault(false);
      await load();
    } catch (err) {
      toast.error("Couldn't add method", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, setAsDefault: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch {
      toast.error("Couldn't set default");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: "Remove this payment method?", tone: "danger", confirmLabel: "Remove" }))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/payment-methods?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Payment method removed");
      await load();
    } catch {
      toast.error("Couldn't remove method");
    } finally {
      setBusyId(null);
    }
  };

  const iconFor = (m: string) => available.find((a) => a.method === m)?.icon ?? "💳";
  const nameFor = (m: string) => available.find((a) => a.method === m)?.name ?? m;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to profile
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-amber-400" />
          Payment Methods
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage your payout destinations for withdrawals.
        </p>
      </div>

      {/* Saved methods */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Saved methods</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : saved.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            You haven&apos;t added any payment methods yet. Add one below.
          </p>
        ) : (
          <div className="space-y-2">
            {saved.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800"
              >
                <BrandIcon brand={m.method} fallback={iconFor(m.method)} colored className="w-5 h-5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-white font-medium">
                      {nameFor(m.method)}
                    </p>
                    {m.isDefault && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        DEFAULT
                      </span>
                    )}
                    {m.isVerified && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-400">
                        <ShieldCheck className="w-3 h-3" />
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono truncate">
                    {m.accountNumber}
                    {m.accountName ? ` · ${m.accountName}` : ""}
                  </p>
                </div>
                {!m.isDefault && (
                  <button
                    onClick={() => handleSetDefault(m.id)}
                    disabled={busyId === m.id}
                    title="Set as default"
                    className="p-2 rounded-lg text-gray-400 hover:text-emerald-400 hover:bg-gray-800 disabled:opacity-50"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={busyId === m.id}
                  title="Remove"
                  className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 disabled:opacity-50"
                >
                  {busyId === m.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add method */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-indigo-400" />
          Add a method
        </h2>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Method
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {available.map((a) => (
              <option key={a.method} value={a.method}>
                {a.icon} {a.name} — min ${a.minWithdrawal}, fee {a.fee.percentage}%
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Account number{" "}
            {selected && (
              <span className="text-gray-600">
                ({selected.name} number / wallet)
              </span>
            )}
          </label>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="e.g. 01XXXXXXXXX"
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Account name{" "}
            <span className="text-gray-600">(optional)</span>
          </label>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Name on the account"
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={setDefault}
            onChange={(e) => setSetDefault(e.target.checked)}
            className="accent-indigo-500"
          />
          Set as default payout method
        </label>

        <div className="flex items-start gap-2 text-[11px] text-gray-500 rounded-lg bg-gray-950 border border-gray-800 p-2.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Double-check your account details — withdrawals sent to a wrong number
            can&apos;t be reversed.
          </span>
        </div>

        <button
          onClick={handleAdd}
          disabled={adding}
          className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {adding ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Add method
        </button>
      </section>
    </div>
  );
}
