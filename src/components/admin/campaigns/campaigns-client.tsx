"use client";
import { usd } from "@/lib/utils";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Save, Megaphone, Pause, Play, Pencil, Trash2, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { format } from "date-fns";
import { DateField } from "@/components/ui/date-field";

/**
 * Admin → Campaigns. "Task points boost" and "XP boost" campaigns really
 * change task rewards while they run (lib/campaigns.ts); the other types are
 * kept for old records and marked as having no effect.
 */

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  type: string;
  value: number;
  startDate: Date | string;
  endDate: Date | string;
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

const TYPES: { key: string; label: string; effect: string | null }[] = [
  { key: "BONUS_POINTS", label: "Task points boost", effect: "Points from tasks × value while it runs." },
  { key: "XP_MULTIPLIER", label: "XP boost", effect: "XP from tasks × value while it runs." },
  { key: "FREE_TICKETS", label: "Free tickets", effect: null },
  { key: "DISCOUNT", label: "Discount", effect: null },
  { key: "REFERRAL_BOOST", label: "Referral boost", effect: null },
  { key: "SEASONAL", label: "Seasonal", effect: null },
];
const typeOf = (k: string) => TYPES.find((t) => t.key === k);
const BOOST = new Set(["BONUS_POINTS", "XP_MULTIPLIER"]);

const TARGETS: { key: string; label: string; hint: string | null; placeholder?: string }[] = [
  { key: "ALL", label: "Everyone", hint: null },
  { key: "TIER", label: "Only some plans", hint: "Plan names or slugs, separated by commas.", placeholder: "premium, standard" },
  { key: "NEW_USERS", label: "New accounts", hint: "Accounts created within this many days.", placeholder: "30" },
  { key: "COUNTRY", label: "Only some countries", hint: "Country codes, separated by commas.", placeholder: "BD, IN" },
];

/** What the card shows as the state, from status + dates. */
function liveState(c: Campaign): { label: string; tone: string } {
  const now = Date.now();
  const start = new Date(c.startDate).getTime();
  const end = new Date(c.endDate).getTime();
  if (c.status === "PAUSED") return { label: "PAUSED", tone: "bg-slate-700/40 text-slate-300" };
  if (c.status === "ENDED" || end < now) return { label: "ENDED", tone: "bg-red-500/10 text-red-400" };
  if (start > now) return { label: "SCHEDULED", tone: "bg-amber-500/15 text-amber-400" };
  return { label: "LIVE", tone: "bg-emerald-500/15 text-emerald-400" };
}

const toLocal = (d: Date | string) => {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function CampaignsClient({ initial, canManage }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (c: Campaign, body: Record<string, unknown>, done: string) => {
    setBusy(c.id);
    try {
      const r = await fetch(`/api/admin/campaigns/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(done);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (c: Campaign) => {
    if (!(await confirmDialog({ title: "Delete campaign?", description: `"${c.title}" will be removed.`, tone: "danger", confirmLabel: "Delete" })))
      return;
    setBusy(c.id);
    const r = await fetch(`/api/admin/campaigns/${c.id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) {
      toast.success("Campaign deleted");
      router.refresh();
    } else toast.error("Couldn't delete");
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-slate-300">
        <p className="inline-flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-sky-400" />
          <span>
            <b className="text-white">Task points boost</b> and <b className="text-white">XP boost</b> change task rewards
            while they run (×1–×5). The other types are old records with no effect.
          </span>
        </p>
        {canManage && (
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        )}
      </div>

      {initial.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initial.map((c) => {
            const st = liveState(c);
            const t = typeOf(c.type);
            const target = TARGETS.find((x) => x.key === c.targetType);
            return (
              <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold">{c.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t?.label ?? c.type}
                      {BOOST.has(c.type) ? ` · ×${c.value}` : ""}
                      {!t?.effect && <span className="ml-1.5 rounded bg-slate-700 px-1 text-[10px] text-slate-300">no effect</span>}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.tone}`}>{st.label}</span>
                </div>
                {c.description && <p className="text-sm text-slate-400 mb-3 line-clamp-2">{c.description}</p>}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Start</p>
                    <p className="text-slate-300">{format(new Date(c.startDate), "MMM d, HH:mm")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">End</p>
                    <p className="text-slate-300">{format(new Date(c.endDate), "MMM d, HH:mm")}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500">Who</p>
                    <p className="text-slate-300">
                      {target?.label ?? c.targetType}
                      {c.targetValue ? `: ${c.targetValue}` : ""}
                    </p>
                  </div>
                  {c.budget ? (
                    <div>
                      <p className="text-xs text-slate-500">Budget (note)</p>
                      <p className="text-slate-300 tabular-nums">{usd(c.budget)}</p>
                    </div>
                  ) : null}
                </div>
                {canManage && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                    {c.status === "PAUSED" ? (
                      <button
                        disabled={busy === c.id}
                        onClick={() => patch(c, { status: "ACTIVE" }, "Campaign resumed")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
                      >
                        <Play className="h-3.5 w-3.5" /> Resume
                      </button>
                    ) : st.label !== "ENDED" ? (
                      <button
                        disabled={busy === c.id}
                        onClick={() => patch(c, { status: "PAUSED" }, "Campaign paused")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </button>
                    ) : null}
                    <button
                      onClick={() => setEditing(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      disabled={busy === c.id}
                      onClick={() => remove(c)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && <CampaignModal campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CampaignModal({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: campaign?.title ?? "",
    description: campaign?.description ?? "",
    type: campaign?.type ?? "BONUS_POINTS",
    value: campaign?.value ?? 1.5,
    startDate: campaign ? toLocal(campaign.startDate) : toLocal(new Date()),
    endDate: campaign ? toLocal(campaign.endDate) : toLocal(new Date(Date.now() + 7 * 86_400_000)),
    targetType: campaign?.targetType ?? "ALL",
    targetValue: campaign?.targetValue ?? "",
    budget: campaign?.budget ?? 0,
  });
  const isBoost = BOOST.has(form.type);
  const target = TARGETS.find((t) => t.key === form.targetType);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(campaign ? `/api/admin/campaigns/${campaign.id}` : "/api/admin/campaigns", {
        method: campaign ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          description: form.description || undefined,
          targetValue: form.targetType === "ALL" ? null : form.targetValue,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          budget: form.budget || null,
          ...(campaign ? {} : { status: "SCHEDULED" }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(campaign ? "Campaign saved" : "Campaign created");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : String(err) });
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
            {campaign ? "Edit campaign" : "New campaign"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto">
          <Field label="Title *">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} />
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
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inp}>
                {TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                    {t.effect ? "" : " (no effect)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={isBoost ? "Multiplier (×1 – ×5)" : "Value"}>
              <input
                type="number"
                step={0.1}
                min={isBoost ? 1 : 0}
                max={isBoost ? 5 : undefined}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                className={inp}
              />
            </Field>
          </div>
          <p className={`text-[11px] ${typeOf(form.type)?.effect ? "text-emerald-300" : "text-amber-300"}`}>
            {typeOf(form.type)?.effect ?? "This type is kept for old records — it doesn't change anything for users."}
            {isBoost ? ` e.g. 1.5 = +50%, 2 = double.` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <DateField type="datetime-local" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} className={inp} />
            </Field>
            <Field label="End">
              <DateField type="datetime-local" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} className={inp} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who">
              <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })} className={inp}>
                {TARGETS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            {target?.hint ? (
              <Field label={target.hint}>
                <input
                  value={form.targetValue}
                  placeholder={target.placeholder}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                  className={inp}
                />
              </Field>
            ) : (
              <Field label="Budget note ($, optional)">
                <input
                  type="number"
                  step={0.01}
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: parseFloat(e.target.value) || 0 })}
                  className={inp}
                />
              </Field>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {campaign ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
