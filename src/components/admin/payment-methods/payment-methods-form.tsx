"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface PaymentMethod {
  key: string;
  name: string;
  category: "mobile" | "bank" | "wallet" | "crypto" | string;
  icon: string;
  enabled: boolean;
  minAmount: number;
  maxAmount: number;
  feePct: number;
  feeFlat: number;
  processingTime: string;
  requiredFields: string[];
  countries: string[];
  instructions: string;
}

interface Props {
  initial: PaymentMethod[];
  canEdit: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  mobile: "Mobile Banking",
  bank: "Bank Transfer",
  wallet: "Digital Wallet",
  crypto: "Cryptocurrency",
};

export function PaymentMethodsForm({ initial, canEdit }: Props) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethod[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const update = (key: string, patch: Partial<PaymentMethod>) =>
    setMethods((p) => p.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const save = async (m: PaymentMethod) => {
    setBusy(m.key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "payment_methods",
          settings: { [`pm_${m.key}`]: m },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${m.name} saved`);
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const grouped = methods.reduce<Record<string, PaymentMethod[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] ?? []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, list]) => (
        <section key={category}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {list.map((m) => (
              <div
                key={m.key}
                className={cn(
                  "rounded-xl border bg-slate-900 p-5",
                  m.enabled
                    ? "border-emerald-500/30"
                    : "border-slate-800"
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-xl">
                      {m.icon}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-white">
                        {m.name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {m.key}
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) =>
                        update(m.key, { enabled: e.target.checked })
                      }
                      disabled={!canEdit}
                      className="rounded bg-slate-800 border-slate-600 text-emerald-500"
                    />
                    <span className="text-xs text-slate-400">Active</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Min Amount ($)">
                    <input
                      type="number"
                      step={0.01}
                      value={m.minAmount}
                      onChange={(e) =>
                        update(m.key, {
                          minAmount: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={!canEdit}
                      className={inp}
                    />
                  </Field>
                  <Field label="Max Amount ($)">
                    <input
                      type="number"
                      step={0.01}
                      value={m.maxAmount}
                      onChange={(e) =>
                        update(m.key, {
                          maxAmount: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={!canEdit}
                      className={inp}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Fee (%)">
                    <input
                      type="number"
                      step={0.1}
                      value={m.feePct}
                      onChange={(e) =>
                        update(m.key, {
                          feePct: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={!canEdit}
                      className={inp}
                    />
                  </Field>
                  <Field label="Flat Fee ($)">
                    <input
                      type="number"
                      step={0.01}
                      value={m.feeFlat}
                      onChange={(e) =>
                        update(m.key, {
                          feeFlat: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={!canEdit}
                      className={inp}
                    />
                  </Field>
                </div>

                <Field label="Processing Time">
                  <input
                    value={m.processingTime}
                    onChange={(e) =>
                      update(m.key, { processingTime: e.target.value })
                    }
                    disabled={!canEdit}
                    className={inp}
                    placeholder="e.g. 1-3 business days"
                  />
                </Field>

                <Field label="User Instructions">
                  <textarea
                    rows={2}
                    value={m.instructions}
                    onChange={(e) =>
                      update(m.key, { instructions: e.target.value })
                    }
                    disabled={!canEdit}
                    className={inp + " resize-none"}
                  />
                </Field>

                <Field label="Required fields (comma-separated)">
                  <input
                    value={m.requiredFields.join(", ")}
                    onChange={(e) =>
                      update(m.key, {
                        requiredFields: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    disabled={!canEdit}
                    className={inp + " font-mono text-xs"}
                  />
                </Field>

                <Field label="Allowed countries (comma-separated, ISO codes or WORLDWIDE)">
                  <input
                    value={m.countries.join(", ")}
                    onChange={(e) =>
                      update(m.key, {
                        countries: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    disabled={!canEdit}
                    className={inp + " font-mono text-xs"}
                  />
                </Field>

                {canEdit && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => save(m)}
                      disabled={busy === m.key}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy === m.key ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
