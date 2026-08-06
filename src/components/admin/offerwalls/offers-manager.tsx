"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { CountryPicker } from "@/components/admin/shared/country-picker";

interface Offer {
  id: string;
  categoryId: string;
  title: string;
  description: string | null;
  instructions: string[];
  imageUrl: string | null;
  points: number;
  payoutUsd: number | null;
  countries: string[];
  order: number;
  trackingUrlTemplate: string | null;
  source: string;
  providerId: string | null;
  externalOfferId: string | null;
  completionMode: string;
  proofScreenshot: boolean;
  dailyLimit: number | null;
  oneTimePerUser: boolean;
  holdHours: number;
  featured: boolean;
  isActive: boolean;
}
type NameId = { id: string; name: string };
type ProviderOpt = { id: string; provider: string };

const inp =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500";

function emptyOffer(categoryId: string): Offer {
  return {
    id: "", categoryId, title: "", description: "", instructions: [""], imageUrl: null,
    points: 100, payoutUsd: null, countries: [], order: 0, trackingUrlTemplate: "",
    source: "MANUAL", providerId: null, externalOfferId: null, completionMode: "PROOF",
    proofScreenshot: true, dailyLimit: null, oneTimePerUser: true, holdHours: 0,
    featured: false, isActive: true,
  };
}

export function OfferwallOffersManager({
  initialOffers,
  categories,
  providers,
  canManage,
}: {
  initialOffers: Offer[];
  categories: NameId[];
  providers: ProviderOpt[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const set = <K extends keyof Offer>(k: K, v: Offer[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    if (!form.categoryId) return toast.error("Pick a category");
    if (!form.title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      const url = form.id
        ? `/api/admin/offerwall/offers/${form.id}`
        : "/api/admin/offerwall/offers";
      const res = await fetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      toast.success(form.id ? "Offer updated" : "Offer created");
      setForm(null);
      router.refresh();
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (o: Offer) => {
    if (!confirm(`Delete "${o.title}"?`)) return;
    const res = await fetch(`/api/admin/offerwall/offers/${o.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); router.refresh(); } else toast.error("Delete failed");
  };

  if (categories.length === 0) {
    return <p className="text-sm text-slate-400">Create a category first (Categories tab), then add offers to it.</p>;
  }

  const byCat = new Map<string, Offer[]>();
  for (const o of initialOffers) {
    if (!byCat.has(o.categoryId)) byCat.set(o.categoryId, []);
    byCat.get(o.categoryId)!.push(o);
  }

  const instr = form?.instructions ?? [];
  const setInstr = (next: string[]) => set("instructions", next);

  return (
    <div className="space-y-4">
      {/* Guide */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-200"
        >
          {showGuide ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Info className="w-4 h-4 text-emerald-400" /> How to set up an offer
        </button>
        {showGuide && (
          <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-400 space-y-2">
            <p><b className="text-slate-200">Title / image / instructions</b> — what the user sees. Add clear step-by-step instructions; they appear on the instruction page before <b>Start Work</b>.</p>
            <p><b className="text-slate-200">Points</b> — reward on completion. For provider offers you can also enter the USD payout for reference.</p>
            <p><b className="text-slate-200">Countries</b> — leave empty to show everywhere, or pick codes; the offer only shows to users whose profile country matches.</p>
            <p><b className="text-slate-200">Order</b> — offers unlock one-by-one within a category from low order to high (finish one → next unlocks).</p>
            <p><b className="text-slate-200">Completion mode</b>: <b>Proof</b> = user uploads a screenshot → you approve; <b>Postback</b> = auto-credit when the linked provider fires its callback (needs a Provider + tracking URL with <code>{"{userId}"}</code>/<code>{"{clickId}"}</code>); <b>Manual</b> = you credit by hand.</p>
            <p><b className="text-slate-200">Tracking URL</b> — where <b>Start Work</b> sends the user. Use <code>{"{userId}"}</code> and <code>{"{clickId}"}</code> placeholders so the provider can echo them back in the postback.</p>
            <p><b className="text-slate-200">Hold hours</b> — delay crediting (useful for surveys that can be reversed). <b>One-time</b> — each user can complete once.</p>
          </div>
        )}
      </div>

      {canManage && (
        <button
          onClick={() => setForm(emptyOffer(categories[0].id))}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> New offer
        </button>
      )}

      {/* Offer list grouped by category */}
      <div className="space-y-4">
        {categories.map((c) => {
          const offers = byCat.get(c.id) ?? [];
          if (offers.length === 0) return null;
          return (
            <div key={c.id}>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1.5">{c.name}</p>
              <div className="space-y-2">
                {offers.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <span className="text-xs text-slate-500 w-6 shrink-0">#{o.order}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">
                        {o.title}{" "}
                        {!o.isActive && <span className="text-xs text-amber-400">(hidden)</span>}
                        {o.featured && <span className="text-xs text-emerald-400"> ★</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {o.points} pts · {o.completionMode} · {o.countries.length ? o.countries.join(",") : "all"}
                        {o.source === "PROVIDER" && " · provider"}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setForm({ ...o, instructions: o.instructions.length ? o.instructions : [""] })} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(o)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {initialOffers.length === 0 && <p className="text-sm text-slate-500">No offers yet.</p>}
      </div>

      {/* Editor modal */}
      {form && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" onClick={() => setForm(null)}>
          <div className="mx-auto my-6 w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">{form.id ? "Edit offer" : "New offer"}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Image</label>
                <ImageUploadField value={form.imageUrl ?? ""} onChange={(u) => set("imageUrl", u || null)} previewSize="square" title="Offer image" />
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Title *</label>
                  <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inp} placeholder="e.g. Install Coin Master & reach level 5" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Category</label>
                    <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inp}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Order (unlock)</label>
                    <input type="number" value={form.order} onChange={(e) => set("order", Number(e.target.value) || 0)} className={inp} />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} className={`${inp} resize-none`} />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Instruction steps</label>
              <div className="space-y-2">
                {instr.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="w-6 h-9 grid place-items-center text-xs text-slate-500 shrink-0">{i + 1}.</span>
                    <input value={s} onChange={(e) => setInstr(instr.map((x, idx) => (idx === i ? e.target.value : x)))} className={inp} placeholder="e.g. Install the app and open it" />
                    <button type="button" onClick={() => setInstr(instr.filter((_, idx) => idx !== i))} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setInstr([...instr, ""])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400"><Plus className="w-4 h-4" /> Add step</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Points *</label>
                <input type="number" value={form.points} onChange={(e) => set("points", Number(e.target.value) || 0)} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">USD payout</label>
                <input type="number" step="0.01" value={form.payoutUsd ?? ""} onChange={(e) => set("payoutUsd", e.target.value === "" ? null : Number(e.target.value))} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Hold (hours)</label>
                <input type="number" value={form.holdHours} onChange={(e) => set("holdHours", Number(e.target.value) || 0)} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Daily limit</label>
                <input type="number" value={form.dailyLimit ?? ""} onChange={(e) => set("dailyLimit", e.target.value === "" ? null : Number(e.target.value))} className={inp} placeholder="∞" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Countries</label>
              <CountryPicker value={form.countries} onChange={(v) => set("countries", v)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Completion mode</label>
                <select value={form.completionMode} onChange={(e) => set("completionMode", e.target.value)} className={inp}>
                  <option value="PROOF">Proof (screenshot → admin approves)</option>
                  <option value="POSTBACK">Postback (auto-credit via provider)</option>
                  <option value="MANUAL">Manual (admin credits)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Provider (for postback)</label>
                <select value={form.providerId ?? ""} onChange={(e) => set("providerId", e.target.value || null)} className={inp}>
                  <option value="">— none / manual —</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.provider}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Tracking URL (Start Work destination)</label>
              <input value={form.trackingUrlTemplate ?? ""} onChange={(e) => set("trackingUrlTemplate", e.target.value)} className={inp} placeholder="https://track.provider.com/o/123?s1={userId}&s2={clickId}" />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.proofScreenshot} onChange={(e) => set("proofScreenshot", e.target.checked)} className="w-4 h-4 accent-emerald-500" /> Require screenshot</label>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.oneTimePerUser} onChange={(e) => set("oneTimePerUser", e.target.checked)} className="w-4 h-4 accent-emerald-500" /> One-time per user</label>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="w-4 h-4 accent-emerald-500" /> Featured</label>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-emerald-500" /> Active</label>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setForm(null)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-white text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save offer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
