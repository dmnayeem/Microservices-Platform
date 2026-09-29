"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { usd, pts } from "@/lib/utils";
import { buildCpaTrackingUrl, isValidCpaTemplate, CPA_MACROS } from "@/lib/cpa/link";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";
import { OFFER_STATUSES, errorOf, inp, lbl, type OfferStatus } from "./cpa-shared";

/** The offer as the admin API returns it (payoutUsd already a number). */
export interface CpaOfferRow extends TaskAudienceValue {
  id: string;
  title: string;
  network: string;
  category: string | null;
  description: string | null;
  steps: string[];
  logoUrl: string | null;
  trackingUrl: string;
  points: number;
  payoutUsd: number | null;
  estMinutes: number | null;
  difficulty: string;
  completionMode: string;
  autoApproveOnPostback: boolean;
  proofRequired: boolean;
  proofInstructions: string | null;
  holdHours: number;
  dailyCap: number | null;
  totalCap: number | null;
  conversionsCount: number;
  status: string;
  featured: boolean;
  order: number;
  conversionsByStatus?: Record<string, number>;
  warnings?: string[];
}

/**
 * Network presets. The links are EXAMPLES — each network names its sub-id
 * parameters differently and publisher ids differ, so the admin must check the
 * link against the network's own dashboard.
 */
const PRESETS: { id: string; label: string; example: string }[] = [
  {
    id: "CPAGrip",
    label: "CPAGrip",
    example: "https://www.cpagrip.com/show.php?l=0&u=YOUR_PUB_ID&id=OFFER_ID&tracking_id={clickId}",
  },
  {
    id: "OGAds",
    label: "OGAds",
    example: "https://YOUR_OGADS_DOMAIN/cl/i/OFFER_CODE?aff_sub4={clickId}&aff_sub5={username}",
  },
  {
    id: "CPALead",
    label: "CPALead",
    example: "https://www.cpalead.com/view.php?id=OFFER_ID&pub=YOUR_PUB_ID&subid={clickId}&subid2={username}",
  },
  {
    id: "AdGate",
    label: "AdGate",
    example: "https://wall.adgaterewards.com/YOUR_WALL_CODE/{userId}?s2={clickId}",
  },
];
const PRESET_EXAMPLES = new Set(PRESETS.map((p) => p.example));

const SAMPLE = {
  username: "sample_user",
  userId: "cmuser0sample0id",
  clickId: "cmclick0sample0id",
  country: "BD",
};

type Form = Omit<CpaOfferRow, "id" | "conversionsCount" | "conversionsByStatus" | "warnings"> & {
  id?: string;
};

function toForm(o: CpaOfferRow | null): Form {
  if (o) {
    return {
      ...o,
      steps: o.steps.length ? o.steps : [""],
    };
  }
  return {
    title: "",
    network: "CPAGrip",
    category: "",
    description: "",
    steps: [""],
    logoUrl: "",
    trackingUrl: "",
    points: 0,
    payoutUsd: null,
    estMinutes: null,
    difficulty: "EASY",
    completionMode: "PROOF",
    autoApproveOnPostback: false,
    proofRequired: true,
    proofInstructions: "",
    holdHours: 0,
    dailyCap: null,
    totalCap: null,
    status: "DRAFT",
    featured: false,
    order: 0,
    countries: [],
    genders: [],
    minAge: null,
    maxAge: null,
    regions: [],
    divisions: [],
    districts: [],
    subDistricts: [],
    postalCodes: [],
  };
}

const AUDIENCE_KEYS = [
  "countries", "genders", "regions", "divisions", "districts",
  "subDistricts", "postalCodes", "minAge", "maxAge",
] as const satisfies readonly (keyof TaskAudienceValue)[];

const numOrNull =(v: string) => (v.trim() === "" ? null : Number(v));

export function CpaOfferForm({
  offer,
  canManage,
  pointsPerUsd,
  categories,
  onClose,
  onSaved,
}: {
  offer: CpaOfferRow | null;
  canManage: boolean;
  pointsPerUsd: number;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(offer));
  const [serverWarnings, setServerWarnings] = useState<string[]>(offer?.warnings ?? []);
  const [saving, setSaving] = useState(false);
  const [audience, setAudience] = useState<{ count: number; total: number } | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const ro = !canManage;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const presetId = PRESETS.some((p) => p.id === form.network) ? form.network : "Other";

  const choosePreset = (id: string) => {
    if (id === "Other") {
      setForm((f) => ({ ...f, network: PRESETS.some((p) => p.id === f.network) ? "" : f.network }));
      return;
    }
    const p = PRESETS.find((x) => x.id === id)!;
    setForm((f) => ({
      ...f,
      network: p.id,
      // Only replace an empty link or another preset's untouched example.
      trackingUrl: !f.trackingUrl.trim() || PRESET_EXAMPLES.has(f.trackingUrl.trim()) ? p.example : f.trackingUrl,
    }));
  };

  const insertMacro = (m: string) => {
    const token = `{${m}}`;
    const el = urlRef.current;
    const cur = form.trackingUrl;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    set("trackingUrl", next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const preview = useMemo(
    () => (form.trackingUrl.trim() ? buildCpaTrackingUrl(form.trackingUrl, SAMPLE) : null),
    [form.trackingUrl]
  );
  const urlValid = isValidCpaTemplate(form.trackingUrl);
  const hasClickMacro = /\{clickid\}/i.test(form.trackingUrl);
  const exampleLink = PRESET_EXAMPLES.has(form.trackingUrl.trim());

  // Live loss check (the server repeats it on save).
  const costUsd = pointsPerUsd > 0 ? form.points / pointsPerUsd : 0;
  const losing = form.payoutUsd != null && costUsd > form.payoutUsd;

  // Live eligible-user count.
  const audienceKey = JSON.stringify(AUDIENCE_KEYS.map((k) => form[k]));
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setAudienceLoading(true);
      try {
        const res = await fetch("/api/admin/cpa/offers/audience-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            Object.fromEntries(AUDIENCE_KEYS.map((k, i) => [k, (JSON.parse(audienceKey) as unknown[])[i]]))
          ),
        });
        if (res.ok && alive) setAudience((await res.json()) as { count: number; total: number });
      } catch {
        /* estimate only */
      } finally {
        if (alive) setAudienceLoading(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [audienceKey]);

  const steps = form.steps;
  const moveStep = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    set("steps", next);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.network.trim()) return toast.error("Network is required");
    if (!urlValid) return toast.error("Tracking link must be an http(s) URL");
    setSaving(true);
    try {
      const { id, ...rest } = form;
      const body = {
        ...rest,
        category: rest.category || null,
        description: rest.description || null,
        logoUrl: rest.logoUrl || null,
        proofInstructions: rest.proofInstructions || null,
        steps: rest.steps.map((s) => s.trim()).filter(Boolean),
      };
      const res = await fetch(id ? `/api/admin/cpa/offers/${id}` : "/api/admin/cpa/offers", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      const j = (await res.json()) as { offer: CpaOfferRow; warnings: string[] };
      onSaved();
      if (j.warnings?.length) {
        // Stay open on the saved offer so the warnings can be read and acted on.
        setServerWarnings(j.warnings);
        setForm((f) => ({ ...f, id: j.offer.id }));
        toast.warning(id ? "Saved — with warnings" : "Created — with warnings", {
          description: j.warnings[0],
        });
      } else {
        toast.success(id ? "Offer updated" : "Offer created");
        onClose();
      }
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-2 sm:p-4" onClick={onClose}>
      <div
        className="mx-auto my-4 w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-white">
            {form.id ? (ro ? "View CPA offer" : "Edit CPA offer") : "New CPA offer"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {(serverWarnings.length > 0 || losing) && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
            {losing && !serverWarnings.some((w) => w.startsWith("Users get")) && (
              <p className="flex gap-2 text-sm text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                Users get {usd(costUsd)} in points but the network pays {usd(form.payoutUsd)} — every
                conversion loses {usd(costUsd - (form.payoutUsd ?? 0))}.
              </p>
            )}
            {serverWarnings.map((w) => (
              <p key={w} className="flex gap-2 text-sm text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}

        <fieldset disabled={ro} className="space-y-5">
          {/* Details */}
          <section className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-4">
              <div>
                <label className={lbl}>Logo</label>
                <ImageUploadField
                  value={form.logoUrl ?? ""}
                  onChange={(url) => set("logoUrl", url)}
                  previewSize="square"
                  title="Select offer logo"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Title *</label>
                  <input className={inp} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Sign up for Survey Junkie" maxLength={120} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Network *</label>
                    <select className={inp} value={presetId} onChange={(e) => choosePreset(e.target.value)}>
                      {PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                    {presetId === "Other" && (
                      <input className={`${inp} mt-2`} value={form.network} onChange={(e) => set("network", e.target.value)} placeholder="Network name" maxLength={80} />
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Category</label>
                    <input className={inp} list="cpa-categories" value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Surveys, Apps, Sign-ups" maxLength={60} />
                    <datalist id="cpa-categories">
                      {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={lbl}>Description</label>
              <textarea rows={3} className={`${inp} resize-y`} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
            </div>

            <div>
              <label className={lbl}>Steps (shown to the user, in order)</label>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div key={i} className="flex gap-1.5">
                    <span className="w-6 h-9 grid place-items-center text-xs text-slate-500 shrink-0">{i + 1}.</span>
                    <input className={inp} value={s} maxLength={300} onChange={(e) => set("steps", steps.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder="e.g. Register with a real email" />
                    <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 shrink-0" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 shrink-0" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => set("steps", steps.length > 1 ? steps.filter((_, idx) => idx !== i) : [""])} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 shrink-0" aria-label="Remove step"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                {steps.length < 20 && (
                  <button type="button" onClick={() => set("steps", [...steps, ""])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <Plus className="w-4 h-4" /> Add step
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={lbl}>Points *</label>
                <input type="number" min={0} className={inp} value={form.points} onChange={(e) => set("points", Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                {pointsPerUsd > 0 && <p className="text-[11px] text-slate-500 mt-1">≈ {usd(costUsd)} to the user</p>}
              </div>
              <div>
                <label className={lbl}>Network payout ($)</label>
                <input type="number" min={0} step="0.01" className={inp} value={form.payoutUsd ?? ""} onChange={(e) => set("payoutUsd", numOrNull(e.target.value))} />
              </div>
              <div>
                <label className={lbl}>Est. minutes</label>
                <input type="number" min={0} className={inp} value={form.estMinutes ?? ""} onChange={(e) => set("estMinutes", numOrNull(e.target.value))} />
              </div>
              <div>
                <label className={lbl}>Difficulty</label>
                <select className={inp} value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
            </div>
          </section>

          {/* Tracking link */}
          <section className="space-y-2 border-t border-slate-800 pt-4">
            <h4 className="text-sm font-semibold text-white">Tracking link</h4>
            <p className="text-[11px] text-slate-500">
              Never shown to users — they are sent to it through <code>/go/cpa/…</code> with the macros filled in.
              Put <code>{"{clickId}"}</code> in the network&apos;s sub-id parameter so its postback can be matched.
            </p>
            <input
              ref={urlRef}
              className={`${inp} font-mono text-xs`}
              value={form.trackingUrl}
              onChange={(e) => set("trackingUrl", e.target.value)}
              placeholder="https://network.example/offer?sub1={clickId}"
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-1.5">
              {CPA_MACROS.map((m) => (
                <button key={m} type="button" onClick={() => insertMacro(m)} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-mono text-emerald-300">
                  {`{${m}}`}
                </button>
              ))}
            </div>
            {exampleLink && (
              <p className="text-[11px] text-amber-300">
                Example link for {form.network}. Replace the placeholders (YOUR_PUB_ID, OFFER_ID…) and check the sub-id parameter names against your {form.network} dashboard.
              </p>
            )}
            {form.trackingUrl.trim() && !urlValid && (
              <p className="text-[11px] text-red-400">Not a valid http(s) link (no spaces allowed).</p>
            )}
            {urlValid && !hasClickMacro && (
              <p className="text-[11px] text-amber-300">No {"{clickId}"} macro — postbacks from this network can&apos;t be matched to a user.</p>
            )}
            {preview && (
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Preview for user “{SAMPLE.username}” ({SAMPLE.country})
                </p>
                <p className="text-xs font-mono text-slate-300 break-all">{preview}</p>
              </div>
            )}
          </section>

          {/* Completion */}
          <section className="space-y-3 border-t border-slate-800 pt-4">
            <h4 className="text-sm font-semibold text-white">Completion</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Mode</label>
                <select className={inp} value={form.completionMode} onChange={(e) => set("completionMode", e.target.value)}>
                  <option value="PROOF">Proof — admin approves</option>
                  <option value="POSTBACK">Postback — network confirms</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Hold hours (0 = pay at once)</label>
                <input type="number" min={0} max={2160} className={inp} value={form.holdHours} onChange={(e) => set("holdHours", Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Toggle checked={form.proofRequired} onChange={(v) => set("proofRequired", v)} label="Proof required (screenshot / text)" />
              <Toggle
                checked={form.autoApproveOnPostback}
                onChange={(v) => set("autoApproveOnPostback", v)}
                label="Auto-approve when the postback arrives"
                hint={form.completionMode !== "POSTBACK" ? "Only applies in Postback mode." : undefined}
              />
            </div>
            {form.proofRequired && (
              <div>
                <label className={lbl}>Proof instructions</label>
                <textarea rows={2} className={`${inp} resize-y`} value={form.proofInstructions ?? ""} onChange={(e) => set("proofInstructions", e.target.value)} placeholder="e.g. Screenshot the confirmation page showing your username" maxLength={2000} />
              </div>
            )}
          </section>

          {/* Limits & listing */}
          <section className="space-y-3 border-t border-slate-800 pt-4">
            <h4 className="text-sm font-semibold text-white">Limits &amp; listing</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={lbl}>Daily cap</label>
                <input type="number" min={1} className={inp} value={form.dailyCap ?? ""} onChange={(e) => set("dailyCap", numOrNull(e.target.value))} placeholder="∞" />
              </div>
              <div>
                <label className={lbl}>Total cap</label>
                <input type="number" min={1} className={inp} value={form.totalCap ?? ""} onChange={(e) => set("totalCap", numOrNull(e.target.value))} placeholder="∞" />
              </div>
              <div>
                <label className={lbl}>Status</label>
                <select className={inp} value={form.status} onChange={(e) => set("status", e.target.value as OfferStatus)}>
                  {OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Order</label>
                <input type="number" min={0} className={inp} value={form.order} onChange={(e) => set("order", Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
              </div>
            </div>
            <Toggle checked={form.featured} onChange={(v) => set("featured", v)} label="Featured" />
            <p className="text-[11px] text-slate-500">One conversion per user per offer is always enforced.</p>
          </section>

          {/* Audience */}
          <section className="space-y-3 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">Audience targeting</h4>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                {audienceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                {audience ? `${pts(audience.count)} of ${pts(audience.total)} active users` : "Counting…"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Empty everywhere = everyone. Matching is strict — a user whose profile is missing a targeted field won&apos;t see the offer. The count is an estimate.
            </p>
            <TaskAudienceTargeting
              value={{
                countries: form.countries,
                genders: form.genders,
                minAge: form.minAge,
                maxAge: form.maxAge,
                regions: form.regions,
                divisions: form.divisions,
                districts: form.districts,
                subDistricts: form.subDistricts,
                postalCodes: form.postalCodes,
              }}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              disabled={ro}
            />
          </section>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold">
            {ro ? "Close" : "Cancel"}
          </button>
          {!ro && (
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {form.id ? "Save" : "Create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
      <span className="text-sm text-slate-200">
        {label}
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
