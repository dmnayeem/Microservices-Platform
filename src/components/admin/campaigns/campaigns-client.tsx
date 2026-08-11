"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Save, Megaphone } from "lucide-react";
import { toast } from "@/lib/toast";
import { format } from "date-fns";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  type: string;
  value: number;
  startDate: Date;
  endDate: Date;
  targetType: string;
  targetValue: string | null;
  budget: number | null;
  status: string;
  participantCount: number;
  rewardsDistributed: number;
}

interface Props {
  initial: Campaign[];
  canManage: boolean;
}

const STATUS_BADGES: Record<string, string> = {
  SCHEDULED: "bg-amber-500/15 text-amber-400",
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-slate-700/40 text-slate-300",
  ENDED: "bg-red-500/10 text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  XP_MULTIPLIER: "XP Multiplier",
  BONUS_POINTS: "Bonus Points",
  FREE_TICKETS: "Free Tickets",
  DISCOUNT: "Discount",
  REFERRAL_BOOST: "Referral Boost",
  SEASONAL: "Seasonal",
};

export function CampaignsClient({ initial, canManage }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      )}

      {initial.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initial.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-white font-semibold">{c.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {TYPE_LABELS[c.type] ?? c.type} · {c.value}×
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    STATUS_BADGES[c.status] ?? "bg-slate-700"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              {c.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                  {c.description}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Start</p>
                  <p className="text-slate-300">
                    {format(c.startDate, "MMM d")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">End</p>
                  <p className="text-slate-300">
                    {format(c.endDate, "MMM d")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Target</p>
                  <p className="text-slate-300">{c.targetType}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Budget</p>
                  <p className="text-slate-300 tabular-nums">
                    {c.budget ? `$${c.budget.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {c.participantCount} participants
                </span>
                <span className="text-emerald-400 tabular-nums">
                  ${c.rewardsDistributed.toFixed(2)} distributed
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCampaignModal onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "BONUS_POINTS",
    value: 100,
    startDate: new Date().toISOString().slice(0, 16),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16),
    targetType: "ALL",
    targetValue: "",
    budget: 0,
    status: "SCHEDULED",
  });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          budget: form.budget || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Campaign created");
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
          <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-pink-400" />
            New Campaign
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto">
          <Field label="Title *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inp}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inp + " resize-none"}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={inp}
              >
                <option value="BONUS_POINTS">Bonus Points</option>
                <option value="XP_MULTIPLIER">XP Multiplier</option>
                <option value="FREE_TICKETS">Free Tickets</option>
                <option value="DISCOUNT">Discount</option>
                <option value="REFERRAL_BOOST">Referral Boost</option>
                <option value="SEASONAL">Seasonal</option>
              </select>
            </Field>
            <Field label="Value">
              <input
                type="number"
                step={0.1}
                value={form.value}
                onChange={(e) =>
                  setForm({ ...form, value: parseFloat(e.target.value) || 0 })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className={inp}
              />
            </Field>
            <Field label="End Date">
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target">
              <select
                value={form.targetType}
                onChange={(e) =>
                  setForm({ ...form, targetType: e.target.value })
                }
                className={inp}
              >
                <option value="ALL">All Users</option>
                <option value="TIER">By Tier</option>
                <option value="NEW_USERS">New Users (last 30d)</option>
                <option value="COUNTRY">By Country</option>
              </select>
            </Field>
            <Field label="Budget ($)">
              <input
                type="number"
                step={0.01}
                value={form.budget}
                onChange={(e) =>
                  setForm({ ...form, budget: parseFloat(e.target.value) || 0 })
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
            Create
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
