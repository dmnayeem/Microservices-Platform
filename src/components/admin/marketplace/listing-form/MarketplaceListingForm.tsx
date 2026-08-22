"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  ChevronRight,
  ChevronLeft,
  Package,
  Image as ImageIcon,
  Plus,
  X,
  Upload,
  DollarSign,
  Sparkles,
  Eye,
  Lock,
  Gavel,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  CATEGORIES,
  getCategory,
  getFieldsFor,
  validateDetails,
  ASSET_TYPE_LABEL,
  type CategoryField,
} from "@/lib/marketplace-categories";
import { CategoryFieldInput } from "./CategoryFieldInput";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { DateField } from "@/components/ui/date-field";

const STEPS = [
  { id: 1, label: "Asset type" },
  { id: 2, label: "Sub-type" },
  { id: 3, label: "Details" },
  { id: 4, label: "Media" },
  { id: 5, label: "Pricing & visibility" },
  { id: 6, label: "Review" },
];

interface FormState {
  assetType: string;
  subType: string;
  title: string;
  description: string;
  richDescription: string;
  category: string; // legacy back-compat (auto-derived)
  details: Record<string, unknown>;
  images: string[];
  screenshots: string[];
  attachments: string[];
  price: string;
  currency: string;
  reasonsForSelling: string;
  whatsIncluded: string;
  whatsNotIncluded: string;
  // Pricing / visibility
  auctionMode: boolean;
  startingBid: string;
  reservePrice: string;
  buyNowPrice: string;
  auctionEndsAt: string;
  isFeatured: boolean;
  isPromoted: boolean;
  nsfw: boolean;
  ndaGated: boolean;
  verifiedMetrics: boolean;
  commissionRateBps: string;
}

const EMPTY: FormState = {
  assetType: "",
  subType: "",
  title: "",
  description: "",
  richDescription: "",
  category: "",
  details: {},
  images: [],
  screenshots: [],
  attachments: [],
  price: "",
  currency: "USD",
  reasonsForSelling: "",
  whatsIncluded: "",
  whatsNotIncluded: "",
  auctionMode: false,
  startingBid: "",
  reservePrice: "",
  buyNowPrice: "",
  auctionEndsAt: "",
  isFeatured: false,
  isPromoted: false,
  nsfw: false,
  ndaGated: false,
  verifiedMetrics: false,
  commissionRateBps: "",
};

export function MarketplaceListingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const cat = form.assetType ? getCategory(form.assetType) : null;
  const fields = useMemo(
    () => (form.assetType ? getFieldsFor(form.assetType, form.subType || null) : []),
    [form.assetType, form.subType]
  );

  // Group fields by their `group` attribute, preserving original order
  const grouped = useMemo(() => {
    const out: { group: string; fields: CategoryField[] }[] = [];
    for (const f of fields) {
      const groupName = f.group ?? "Details";
      const last = out[out.length - 1];
      if (last && last.group === groupName) {
        last.fields.push(f);
      } else {
        out.push({ group: groupName, fields: [f] });
      }
    }
    return out;
  }, [fields]);

  const setDetail = (key: string, v: unknown) =>
    setForm((p) => ({ ...p, details: { ...p.details, [key]: v } }));

  const goNext = () => {
    // Lightweight per-step validation
    if (step === 1 && !form.assetType) {
      toast.error("Pick an asset type first");
      return;
    }
    if (step === 2 && cat?.subTypes?.length && !form.subType) {
      toast.error("Pick a sub-type");
      return;
    }
    if (step === 3) {
      if (!form.title.trim() || form.title.length < 3) {
        toast.error("Title must be at least 3 characters");
        return;
      }
      if (!form.description.trim() || form.description.length < 10) {
        toast.error("Short description must be at least 10 characters");
        return;
      }
      const err = validateDetails(form.assetType, form.subType || null, form.details);
      if (err) {
        toast.error(err);
        return;
      }
    }
    if (step === 5) {
      const price = parseFloat(form.price);
      if (!Number.isFinite(price) || price <= 0) {
        toast.error("Price must be greater than 0");
        return;
      }
    }
    // Skip the sub-type step when category has no sub-types
    if (step === 1 && cat && !cat.subTypes?.length) {
      setStep(3);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    if (step === 3 && cat && !cat.subTypes?.length) {
      setStep(1);
      return;
    }
    setStep((s) => Math.max(s - 1, 1));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        richDescription: form.richDescription.trim() || null,
        assetType: form.assetType,
        subType: form.subType || null,
        category: cat?.label ?? form.assetType, // back-compat
        details: form.details,
        images: form.images,
        screenshots: form.screenshots,
        attachments: form.attachments,
        price: parseFloat(form.price),
        currency: form.currency,
        reasonsForSelling: form.reasonsForSelling.trim() || null,
        whatsIncluded: form.whatsIncluded.trim() || null,
        whatsNotIncluded: form.whatsNotIncluded.trim() || null,
        nsfw: form.nsfw,
        ndaGated: form.ndaGated,
        verifiedMetrics: form.verifiedMetrics,
        auctionMode: form.auctionMode,
        startingBid: form.startingBid ? parseFloat(form.startingBid) : null,
        reservePrice: form.reservePrice ? parseFloat(form.reservePrice) : null,
        buyNowPrice: form.buyNowPrice ? parseFloat(form.buyNowPrice) : null,
        auctionEndsAt: form.auctionEndsAt || null,
        isFeatured: form.isFeatured,
        isPromoted: form.isPromoted,
        commissionRateBps: form.commissionRateBps
          ? parseInt(form.commissionRateBps, 10)
          : null,
        // Pull common-field financials/age out of details into top-level columns
        monthlyRevenue: numFromDetails(form.details.monthlyRevenue),
        monthlyProfit: numFromDetails(form.details.monthlyProfit),
        monthlyExpenses: numFromDetails(form.details.monthlyExpenses),
        monthlyTraffic: numFromDetails(form.details.monthlyPageViews ?? form.details.monthlyVisitors),
        assetAgeMonths: numFromDetails(form.details.assetAgeMonths ?? form.details.accountAgeMonths),
        niche: typeof form.details.niche === "string" ? form.details.niche : null,
      };

      const res = await fetch("/api/admin/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Listing created");
      router.push("/admin/marketplace");
      router.refresh();
    } catch (err) {
      toast.error("Failed to create listing", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <Stepper currentStep={step} />

      {/* Step content */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 sm:p-6">
        {step === 1 && (
          <StepAssetType
            value={form.assetType}
            onPick={(t) => {
              set("assetType", t);
              set("subType", "");
              set("details", {});
            }}
          />
        )}

        {step === 2 && (
          <StepSubType
            assetType={form.assetType}
            value={form.subType}
            onPick={(s) => set("subType", s)}
          />
        )}

        {step === 3 && (
          <StepDetails
            form={form}
            set={set}
            setDetail={setDetail}
            grouped={grouped}
          />
        )}

        {step === 4 && <StepMedia form={form} set={set} />}
        {step === 5 && <StepPricing form={form} set={set} />}
        {step === 6 && <StepReview form={form} grouped={grouped} />}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 1 || submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-xs text-slate-500">
          Step {step} of {STEPS.length}
        </span>
        {step < STEPS.length ? (
          <button
            type="button"
            onClick={goNext}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-linear-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-bold disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Create listing
          </button>
        )}
      </div>
    </div>
  );
}

function numFromDetails(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-2">
      {STEPS.map((s, i) => {
        const active = s.id === currentStep;
        const done = s.id < currentStep;
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                active
                  ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/50"
                  : done
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-900 text-slate-400 border-slate-700"
              }`}
            >
              <span className="font-mono tabular-nums">{s.id}.</span>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepAssetType({
  value,
  onPick,
}: {
  value: string;
  onPick: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">What are you selling?</h2>
        <p className="text-sm text-slate-400 mt-1">
          Pick the asset type — the form will adapt to ask the right details.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map((c) => {
          const active = value === c.assetType;
          return (
            <button
              key={c.assetType}
              type="button"
              onClick={() => onPick(c.assetType)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30"
                  : "border-slate-800 bg-slate-950 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-indigo-400" />
                <p className="text-sm font-bold text-white">{c.label}</p>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {c.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepSubType({
  assetType,
  value,
  onPick,
}: {
  assetType: string;
  value: string;
  onPick: (s: string) => void;
}) {
  const cat = getCategory(assetType);
  const subs = cat?.subTypes ?? [];

  if (subs.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-white">{ASSET_TYPE_LABEL[assetType]}</h2>
        <p className="text-sm text-slate-400">
          No sub-categories for this asset — continue to the next step.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">
          Pick the kind of {cat?.label.toLowerCase()}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          We&apos;ll ask extra questions tailored to this sub-type.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subs.map((s) => {
          const active = value === s.slug;
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => onPick(s.slug)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-slate-800 bg-slate-950 hover:border-slate-700"
              }`}
            >
              <p className="text-sm font-bold text-white">{s.label}</p>
              {s.description && (
                <p className="text-xs text-slate-400 mt-1">{s.description}</p>
              )}
              <p className="text-[10px] font-mono uppercase text-slate-600 mt-1">
                {s.slug}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepDetails({
  form,
  set,
  setDetail,
  grouped,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  setDetail: (key: string, v: unknown) => void;
  grouped: { group: string; fields: CategoryField[] }[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Listing details</h2>
        <p className="text-sm text-slate-400 mt-1">
          Fill the essentials. Required fields are marked with{" "}
          <span className="text-red-400">*</span>.
        </p>
      </div>

      <Section title="About the listing">
        <Field label="Listing title" required>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Aged dropshipping store in pet niche, $4.2k MRR"
            className={inp}
            maxLength={100}
          />
        </Field>
        <Field label="Short description (card / preview)" required>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="One or two sentences — what's the headline pitch?"
            className={inp}
            maxLength={300}
          />
        </Field>
        <Field
          label="Full description"
          hint="Long-form pitch — niche, history, what makes it valuable, growth opportunities."
        >
          <textarea
            rows={6}
            value={form.richDescription}
            onChange={(e) => set("richDescription", e.target.value)}
            placeholder="Tell the buyer everything they need to know…"
            className={inp}
          />
        </Field>
      </Section>

      {grouped.map((g) => (
        <Section key={g.group} title={g.group}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {g.fields.map((f) => {
              // Booleans take their full row, screenshots take their full row,
              // everything else can be 2-col.
              const fullWidth =
                f.type === "MULTILINE" ||
                f.type === "SCREENSHOT" ||
                f.type === "SCREENSHOT_GROUP" ||
                f.type === "BOOLEAN";
              return (
                <div
                  key={f.key}
                  className={fullWidth ? "md:col-span-2" : ""}
                >
                  <CategoryFieldInput
                    field={f}
                    value={form.details[f.key]}
                    onChange={(v) => setDetail(f.key, v)}
                  />
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      <Section title="Sale terms">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Reasons for selling"
            hint="Optional — gives buyers context. e.g. 'No time to manage it anymore.'"
          >
            <textarea
              rows={3}
              value={form.reasonsForSelling}
              onChange={(e) => set("reasonsForSelling", e.target.value)}
              className={inp}
              maxLength={500}
            />
          </Field>
          <Field
            label="What's included in the sale"
            hint="Domain + content + assets + analytics access, etc."
          >
            <textarea
              rows={3}
              value={form.whatsIncluded}
              onChange={(e) => set("whatsIncluded", e.target.value)}
              className={inp}
              maxLength={500}
            />
          </Field>
          <Field
            label="What's NOT included"
            hint="Helpful to set expectations."
          >
            <textarea
              rows={3}
              value={form.whatsNotIncluded}
              onChange={(e) => set("whatsNotIncluded", e.target.value)}
              className={inp}
              maxLength={500}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function StepMedia({
  form,
  set,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Media & screenshots</h2>
        <p className="text-sm text-slate-400 mt-1">
          Gallery images go on the listing card. Screenshots are admin-visible
          proof (analytics, payout history, etc.) and shown on detail page.
        </p>
      </div>

      <Section title="Gallery images">
        <UrlListEditor
          label="Image URLs"
          value={form.images}
          onChange={(next) => set("images", next)}
          uploadEnabled
        />
      </Section>

      <Section title="Proof screenshots">
        <UrlListEditor
          label="Screenshot URLs"
          value={form.screenshots}
          onChange={(next) => set("screenshots", next)}
          uploadEnabled
        />
      </Section>

      <Section title="Attachments (PDFs, traffic reports, P&L)">
        <UrlListEditor
          label="Attachment URLs"
          value={form.attachments}
          onChange={(next) => set("attachments", next)}
          uploadEnabled
        />
      </Section>
    </div>
  );
}

function StepPricing({
  form,
  set,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Pricing & visibility</h2>
        <p className="text-sm text-slate-400 mt-1">
          Set how you want to sell — fixed price, auction, or both. Configure
          visibility flags.
        </p>
      </div>

      <Section title="Pricing">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Asking price (USD)" required>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="number"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                min={0.01}
                step={0.01}
                placeholder="0.00"
                className={`${inp} pl-8`}
              />
            </div>
          </Field>
          <Field
            label="Per-listing commission override (bps)"
            hint="100 bps = 1%. Leave blank to use the category default."
          >
            <input
              type="number"
              value={form.commissionRateBps}
              onChange={(e) => set("commissionRateBps", e.target.value)}
              min={0}
              max={10000}
              placeholder="e.g. 500 = 5%"
              className={inp}
            />
          </Field>
        </div>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-700 bg-slate-950 hover:border-slate-600 mt-4">
          <input
            type="checkbox"
            checked={form.auctionMode}
            onChange={(e) => set("auctionMode", e.target.checked)}
            className="rounded bg-slate-800 border-slate-600 text-indigo-500"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white inline-flex items-center gap-2">
              <Gavel className="w-3.5 h-3.5 text-indigo-400" />
              Enable bidding (auction mode)
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Buyers can place bids; auction closes at the end date with the
              highest bidder above reserve.
            </p>
          </div>
        </label>

        {form.auctionMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Field label="Starting bid (USD)">
              <input
                type="number"
                value={form.startingBid}
                onChange={(e) => set("startingBid", e.target.value)}
                min={0}
                step={0.01}
                className={inp}
              />
            </Field>
            <Field label="Reserve price (USD)" hint="Won't sell below this">
              <input
                type="number"
                value={form.reservePrice}
                onChange={(e) => set("reservePrice", e.target.value)}
                min={0}
                step={0.01}
                className={inp}
              />
            </Field>
            <Field label="Buy-now price (USD)" hint="Instant-win price">
              <input
                type="number"
                value={form.buyNowPrice}
                onChange={(e) => set("buyNowPrice", e.target.value)}
                min={0}
                step={0.01}
                className={inp}
              />
            </Field>
            <Field label="Auction ends at">
              <DateField
                type="datetime-local"
                value={form.auctionEndsAt}
                onChange={(v) => set("auctionEndsAt", v)}
                className={inp}
              />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Visibility flags">
        <Toggle
          icon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />}
          label="Featured listing"
          hint="Floats to the top of the public grid."
          checked={form.isFeatured}
          onChange={(v) => set("isFeatured", v)}
        />
        <Toggle
          icon={<Eye className="w-3.5 h-3.5 text-blue-400" />}
          label="Promoted listing"
          hint="Eligible for in-feed promotions and search boost."
          checked={form.isPromoted}
          onChange={(v) => set("isPromoted", v)}
        />
        <Toggle
          icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
          label="Verified metrics"
          hint="Mark when proof screenshots have been admin-verified."
          checked={form.verifiedMetrics}
          onChange={(v) => set("verifiedMetrics", v)}
        />
        <Toggle
          icon={<Lock className="w-3.5 h-3.5 text-purple-400" />}
          label="NDA-gate revenue figures"
          hint="Hide $ figures until buyer signs NDA."
          checked={form.ndaGated}
          onChange={(v) => set("ndaGated", v)}
        />
        <Toggle
          icon={<X className="w-3.5 h-3.5 text-rose-400" />}
          label="NSFW / adult content"
          hint="Quarantine from default browsing."
          checked={form.nsfw}
          onChange={(v) => set("nsfw", v)}
        />
      </Section>
    </div>
  );
}

function StepReview({
  form,
  grouped,
}: {
  form: FormState;
  grouped: { group: string; fields: CategoryField[] }[];
}) {
  const cat = getCategory(form.assetType);
  const subLabel = cat?.subTypes?.find((s) => s.slug === form.subType)?.label;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Review &amp; submit</h2>
        <p className="text-sm text-slate-400 mt-1">
          Double-check before publishing. You can edit any step from the top
          bar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReviewLine label="Asset type" value={cat?.label} />
        <ReviewLine label="Sub-type" value={subLabel ?? "—"} />
        <ReviewLine label="Title" value={form.title} />
        <ReviewLine
          label="Price"
          value={form.price ? `$${form.price} ${form.currency}` : "—"}
        />
        <ReviewLine
          label="Auction"
          value={form.auctionMode ? "Yes" : "No"}
        />
        <ReviewLine
          label="Visibility flags"
          value={
            [
              form.isFeatured && "Featured",
              form.isPromoted && "Promoted",
              form.verifiedMetrics && "Verified",
              form.ndaGated && "NDA-gated",
              form.nsfw && "NSFW",
            ]
              .filter(Boolean)
              .join(" · ") || "None"
          }
        />
        <ReviewLine
          label="Images"
          value={`${form.images.length} gallery · ${form.screenshots.length} screenshots · ${form.attachments.length} attachments`}
        />
      </div>

      <Section title="Category-specific details">
        <div className="space-y-3">
          {grouped.map((g) =>
            g.fields.length === 0 ? null : (
              <div key={g.group}>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                  {g.group}
                </p>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {g.fields.map((f) => {
                    const v = form.details[f.key];
                    return (
                      <div key={f.key} className="flex items-start gap-2">
                        <dt className="text-slate-500 min-w-0 flex-1">
                          {f.label}
                        </dt>
                        <dd className="text-slate-200 text-right shrink-0 max-w-[60%] truncate">
                          {formatReviewValue(f, v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )
          )}
        </div>
      </Section>
    </div>
  );
}

function formatReviewValue(f: CategoryField, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (f.type === "BOOLEAN") return v ? "Yes" : "No";
  if (f.type === "MONEY")
    return typeof v === "number" ? `$${v.toLocaleString()}` : String(v);
  if (f.type === "PERCENT") return `${v}%`;
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "string" && v.startsWith("http")) return "(uploaded)";
  return String(v);
}

// ─── Tiny shared building blocks ────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="text-sm font-bold text-white inline-flex items-center gap-1.5">
          {label}
          {required && <span className="text-red-400">*</span>}
        </span>
        {hint && (
          <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}

function ReviewLine({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  return (
    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
        {label}
      </p>
      <p className="text-sm text-white mt-0.5 truncate">{value || "—"}</p>
    </div>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-700 bg-slate-950 hover:border-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-slate-800 border-slate-600 text-indigo-500"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          {icon}
          {label}
        </p>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}

function UrlListEditor({
  label,
  value,
  onChange,
  uploadEnabled,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  uploadEnabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const add = () => {
    const u = draft.trim();
    if (!u) return;
    try {
      new URL(u);
    } catch {
      toast.error("Enter a valid URL");
      return;
    }
    if (value.includes(u)) return;
    onChange([...value, u]);
    setDraft("");
  };

  const onFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File must be under 8 MB");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      const url = d.cloudFrontUrl || d.url || d.s3Url;
      if (!url) throw new Error("Upload returned no URL");
      onChange([...value, url]);
      toast.success("Uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={`Paste ${label.toLowerCase()} (https://…)`}
          className={`${inp} font-mono text-xs flex-1`}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
        </button>
        {uploadEnabled && (
          <label className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5">
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </div>
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {value.map((u, i) => {
            const isImg = /\.(jpe?g|png|webp|gif|avif)$/i.test(u) || u.includes("cloudfront");
            return (
              <div
                key={i}
                className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800 group"
              >
                {isImg ? (
                  <SmartImage src={u} alt="" fill sizes="200px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <ImageIcon className="w-5 h-5 text-slate-600" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50";
