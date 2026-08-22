"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Check,
  Megaphone,
  Layers,
  ImageIcon,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { AudienceBuilder } from "@/components/admin/ads/audience-builder";
import { AD_PLACEMENTS } from "@/lib/ad-placements";
import { AD_SIZES } from "@/lib/ad-sizes";
import { type AdTargeting } from "@/lib/ad-targeting";
import { DateField } from "@/components/ui/date-field";

interface WizardCampaign {
  id: string;
  title: string;
}
interface WizardPlacement {
  id: string;
  name: string;
}

const PLACEMENT_LABEL = Object.fromEntries(AD_PLACEMENTS.map((p) => [p.name, p.label]));
const PLACEMENT_WHERE = Object.fromEntries(AD_PLACEMENTS.map((p) => [p.name, p.where]));

const inputCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

const STEPS = [
  { id: 0, label: "Campaign", icon: Megaphone },
  { id: 1, label: "Ad spaces", icon: Layers },
  { id: 2, label: "Creative", icon: ImageIcon },
  { id: 3, label: "Audience", icon: Users },
] as const;

export function AdWizard({
  campaigns,
  placements,
  onClose,
  onSaved,
}: {
  campaigns: WizardCampaign[];
  placements: WizardPlacement[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // Render in a portal so the overlay is isolated from the admin page's DOM
  // (and its click-outside handlers); stopPropagation below stops clicks from
  // ever reaching elements behind the modal.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Step 1 — campaign & budget
  const [campaignMode, setCampaignMode] = useState<"existing" | "new">(
    campaigns.length ? "existing" : "new"
  );
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [newBudget, setNewBudget] = useState("50");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  // Step 2 — ad spaces multi-select (placement ids)
  const [selected, setSelected] = useState<string[]>([]);

  // Step 3 — creative
  const [creative, setCreative] = useState<"IMAGE" | "VIDEO" | "HTML">("IMAGE");
  const [contentUrl, setContentUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [size, setSize] = useState("responsive");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [weight, setWeight] = useState("10");
  const [format, setFormat] = useState("BANNER");
  const [brandName, setBrandName] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [headline, setHeadline] = useState("");

  // Step 4 — targeting (single AdTargeting object; AudienceBuilder owns the UI)
  const [targeting, setTargeting] = useState<AdTargeting>({});

  const toggleSpace = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAll = () => setSelected(placements.map((p) => p.id));
  const clearAll = () => setSelected([]);

  // Per-step validity
  const stepValid = (s: number): boolean => {
    if (s === 0)
      return campaignMode === "existing"
        ? !!campaignId
        : newTitle.trim().length >= 2 && Number(newBudget) >= 1;
    if (s === 1) return selected.length >= 1;
    if (s === 2)
      return (
        (creative === "IMAGE" && !!contentUrl) ||
        (creative === "VIDEO" && !!videoUrl) ||
        (creative === "HTML" && !!htmlContent.trim()) ||
        !!headline.trim()
      );
    return true;
  };

  const canNext = stepValid(step);
  const allValid = stepValid(0) && stepValid(1) && stepValid(2);

  const summaryLine = useMemo(() => {
    const camp =
      campaignMode === "existing"
        ? campaigns.find((c) => c.id === campaignId)?.title ?? "campaign"
        : newTitle || "new campaign";
    return `${selected.length} space${selected.length === 1 ? "" : "s"} · ${camp}`;
  }, [campaignMode, campaignId, campaigns, newTitle, selected.length]);

  const submit = async () => {
    if (!allValid) {
      toast.error("Complete all required steps");
      return;
    }
    setBusy(true);
    try {
      // Resolve campaign id (create new if needed)
      let cid = campaignId;
      if (campaignMode === "new") {
        const cRes = await fetch("/api/admin/ads/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTitle.trim(),
            budget: Number(newBudget) || 0,
            status: "ACTIVE",
            startAt: startAt ? new Date(startAt).toISOString() : null,
            endAt: endAt ? new Date(endAt).toISOString() : null,
          }),
        });
        if (!cRes.ok) throw new Error((await cRes.json().catch(() => ({}))).error ?? "Campaign create failed");
        cid = (await cRes.json()).campaign?.id;
        if (!cid) throw new Error("Campaign create failed");
      }

      const payload = {
        campaignId: cid,
        placementIds: selected,
        type: creative === "HTML" ? "HTML" : "LOCAL",
        format,
        contentUrl: creative === "IMAGE" ? contentUrl : "",
        videoUrl: creative === "VIDEO" ? videoUrl : "",
        targetUrl,
        htmlContent: creative === "HTML" ? htmlContent : "",
        size,
        width: size === "custom" ? Number(width) || null : null,
        height: size === "custom" ? Number(height) || null : null,
        weight: Number(weight) || 10,
        status: "ACTIVE",
        headline,
        brandName,
        brandLogo,
        ctaLabel,
        targeting,
      };
      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      const d = await res.json().catch(() => ({}));
      const count = d.count ?? selected.length;
      toast.success(`Created ${count} ad${count === 1 ? "" : "s"} across ${selected.length} space${selected.length === 1 ? "" : "s"}`);
      onSaved();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-lg flex flex-col max-h-[90vh] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header + step indicator */}
        <div className="px-4 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">New Ad</h3>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            {STEPS.map((s, i) => {
              const done = i < step && stepValid(i);
              const active = i === step;
              return (
                <div key={s.id} className="flex items-center gap-1.5 flex-1">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={cn(
                      "flex items-center gap-1.5 min-w-0",
                      i <= step ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0",
                        active
                          ? "bg-blue-600 text-white"
                          : done
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-slate-800 text-slate-500"
                      )}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold hidden sm:inline truncate",
                        active ? "text-white" : "text-slate-500"
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="flex-1 h-px bg-slate-800 min-w-[8px]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto">
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCampaignMode("existing")}
                  disabled={!campaigns.length}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40",
                    campaignMode === "existing" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"
                  )}
                >
                  Use existing campaign
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignMode("new")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-semibold",
                    campaignMode === "new" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"
                  )}
                >
                  New campaign
                </button>
              </div>

              {campaignMode === "existing" ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Campaign</label>
                  <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls}>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Campaign title</label>
                    <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputCls} placeholder="e.g. Summer promo" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Budget ($)</label>
                    <input type="number" min={1} value={newBudget} onChange={(e) => setNewBudget(e.target.value)} className={inputCls} />
                    <p className="text-[11px] text-slate-500 mt-1">Charged per click from this budget; must be ≥ the click cost to serve. Budget ÷ CPC ≈ clicks.</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] text-slate-500">
                      You&apos;re charged the per-click cost from this budget; when it runs out the campaign pauses. Budget ÷ CPC ≈ clicks.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Start date (optional)</label>
                    <DateField type="date" value={startAt} onChange={(v) => setStartAt(v)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">End date (optional)</label>
                    <DateField type="date" value={endAt} onChange={(v) => setEndAt(v)} className={inputCls} />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                A campaign is a budget pool its ads spend from. Pick an existing one or create a fresh pool.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Pick every space this ad should run in ({selected.length} selected).
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-400"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {placements.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleSpace(p.id)}
                      className={cn(
                        "text-left rounded-xl border p-3 transition-colors",
                        on
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-slate-800 bg-slate-950 hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "w-4 h-4 rounded grid place-items-center shrink-0 mt-0.5",
                            on ? "bg-blue-600 text-white" : "border border-slate-600"
                          )}
                        >
                          {on && <Check className="w-3 h-3" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {PLACEMENT_LABEL[p.name] ?? p.name}
                          </p>
                          {PLACEMENT_WHERE[p.name] && (
                            <p className="text-[11px] text-slate-500 line-clamp-2">{PLACEMENT_WHERE[p.name]}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Creative</label>
                <div className="flex gap-2">
                  {(["IMAGE", "VIDEO", "HTML"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCreative(c)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-sm font-semibold",
                        creative === c ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"
                      )}
                    >
                      {c === "IMAGE" ? "Image / GIF" : c === "VIDEO" ? "Video" : "HTML / Script"}
                    </button>
                  ))}
                </div>
              </div>

              {creative === "HTML" ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    HTML content (scripts / ad-network tags run in a sandboxed frame)
                  </label>
                  <textarea value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} rows={4} className={inputCls} placeholder="<div>...</div> or <script>…</script>" />
                </div>
              ) : creative === "VIDEO" ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ad video (MP4 / WebM)</label>
                  <ImageUploadField value={videoUrl} onChange={setVideoUrl} previewSize="md" fileType="VIDEO" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ad image or GIF</label>
                  <ImageUploadField value={contentUrl} onChange={setContentUrl} previewSize="md" />
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">Size</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className={inputCls}>
                  {AD_SIZES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                {size === "custom" && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <input type="number" min={1} value={width} onChange={(e) => setWidth(e.target.value)} placeholder="Width (px)" className={inputCls} />
                    <input type="number" min={1} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height (px)" className={inputCls} />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Target URL (click destination)</label>
                <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Weight</label>
                <input type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Format</label>
                <div className="flex gap-2">
                  {["BANNER", "NATIVE"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-sm font-semibold",
                        format === f ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"
                      )}
                    >
                      {f === "BANNER" ? "Banner" : "Native (feed)"}
                    </button>
                  ))}
                </div>
                {format === "NATIVE" && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Native ads render as post-like cards in the social feed (placement IN_FEED).
                  </p>
                )}
              </div>

              {format === "NATIVE" && (
                <div className="rounded-lg border border-slate-800 p-3 space-y-2.5">
                  <p className="text-xs font-bold text-slate-400">Native creative</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Brand name</label>
                      <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputCls} placeholder="e.g. NordVPN" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">CTA label</label>
                      <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={inputCls} placeholder="Learn More" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Brand logo</label>
                    <ImageUploadField value={brandLogo} onChange={setBrandLogo} previewSize="square" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Headline / ad copy</label>
                    <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={3} className={inputCls} placeholder="What are you promoting?" />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <AudienceBuilder value={targeting} onChange={setTargeting} />

              <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100/90">
                <b className="text-white">Review:</b> {summaryLine}
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy || !allValid}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Create ads
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
