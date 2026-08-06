"use client";

import { useState } from "react";
import { Loader2, Download, Plus, Trash2, Store } from "lucide-react";
import { toast } from "sonner";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import {
  detectStore,
  proofItemPreset,
  hasRichProof,
  type AppInstallConfig,
  type AppInstallProofItem,
  type ProofItemKind,
} from "@/lib/app-install-tasks";

const inp =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500";

export function AppInstallTaskBuilder({
  value,
  onChange,
  onAutofill,
}: {
  value: AppInstallConfig;
  onChange: (c: AppInstallConfig) => void;
  onAutofill?: (m: { name: string; description: string; logo: string }) => void;
}) {
  const [fetchUrl, setFetchUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof AppInstallConfig>(k: K, v: AppInstallConfig[K]) =>
    onChange({ ...value, [k]: v });

  const steps = value.steps ?? [];
  const setStep = (i: number, v: string) =>
    set("steps", steps.map((s, idx) => (idx === i ? v : s)));
  const addStep = () => set("steps", [...steps, ""]);
  const removeStep = (i: number) => set("steps", steps.filter((_, idx) => idx !== i));

  // ── Proof requirements ──
  const proofItems = value.proofItems ?? [];
  const setItem = (i: number, patch: Partial<AppInstallProofItem>) =>
    set(
      "proofItems",
      proofItems.map((it, idx) => (idx === i ? { ...it, ...patch } : it))
    );
  const addItem = () => {
    const preset = proofItemPreset("INSTALL");
    set("proofItems", [
      ...proofItems,
      {
        id: `pi_${proofItems.length + 1}_${Math.round(performance.now())}`,
        kind: "INSTALL",
        label: preset.label,
        screenshot: true,
      } as AppInstallProofItem,
    ]);
  };
  const removeItem = (i: number) =>
    set("proofItems", proofItems.filter((_, idx) => idx !== i));
  const changeKind = (i: number, kind: ProofItemKind) => {
    const it = proofItems[i];
    const preset = proofItemPreset(kind, it.target);
    setItem(i, {
      kind,
      // Refresh the label to the new preset unless the admin already customized it.
      label: preset.label || it.label,
      valueLabel: preset.valueLabel,
      target:
        kind === "LEVEL" || kind === "DAYS" || kind === "PLAYTIME"
          ? it.target ?? 1
          : undefined,
    });
  };

  const KIND_LABEL: Record<ProofItemKind, string> = {
    INSTALL: "Install & open",
    LEVEL: "Reach level / stage",
    DAYS: "Use for N days",
    PLAYTIME: "Playtime (minutes)",
    CUSTOM: "Custom",
  };
  const needsTarget = (k: ProofItemKind) =>
    k === "LEVEL" || k === "DAYS" || k === "PLAYTIME";

  const fetchMeta = async () => {
    const url = fetchUrl.trim();
    if (!url) return;
    const store = detectStore(url);
    if (!store) {
      toast.error("Paste a Play Store or App Store link");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tasks/fetch-app-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Fetch failed");
      onChange({
        ...value,
        appName: d.name || value.appName,
        description: d.description || value.description,
        appLogo: d.logo || value.appLogo,
        playStoreUrl: d.playStoreUrl ?? value.playStoreUrl,
        appStoreUrl: d.appStoreUrl ?? value.appStoreUrl,
      });
      onAutofill?.({ name: d.name ?? "", description: d.description ?? "", logo: d.logo ?? "" });
      toast.success("App details filled — edit anything you like");
    } catch (err) {
      toast.error("Couldn't fetch", {
        description: err instanceof Error ? err.message : "Fill fields manually",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Auto-fetch */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">
          Store link → auto-fetch
        </label>
        <div className="flex gap-2">
          <input
            value={fetchUrl}
            onChange={(e) => setFetchUrl(e.target.value)}
            placeholder="Paste Play Store or App Store link"
            className={inp}
          />
          <button
            type="button"
            onClick={fetchMeta}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Fetch
          </button>
        </div>
      </div>

      {/* App vs Game */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Type</label>
        <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden text-sm font-semibold">
          {(["app", "game"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set("appKind", k)}
              className={`px-4 py-1.5 transition-colors ${
                (value.appKind ?? "app") === k
                  ? "bg-green-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {k === "app" ? "📱 App" : "🎮 Game"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">App icon</label>
          <ImageUploadField
            value={value.appLogo ?? ""}
            onChange={(u) => set("appLogo", u)}
            previewSize="square"
            title="Select app icon"
          />
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">App name *</label>
            <input value={value.appName} onChange={(e) => set("appName", e.target.value)} className={inp} placeholder="e.g. My Cool App" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Description</label>
            <textarea rows={2} value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} className={`${inp} resize-none`} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1.5 inline-flex items-center gap-1"><Store className="w-3 h-3" /> Play Store URL</label>
          <input value={value.playStoreUrl ?? ""} onChange={(e) => set("playStoreUrl", e.target.value)} placeholder="https://play.google.com/…" className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 inline-flex items-center gap-1"><Store className="w-3 h-3" /> App Store URL</label>
          <input value={value.appStoreUrl ?? ""} onChange={(e) => set("appStoreUrl", e.target.value)} placeholder="https://apps.apple.com/…" className={inp} />
        </div>
      </div>

      {/* Steps */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Instruction steps</label>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="w-6 h-9 grid place-items-center text-xs text-gray-500 shrink-0">{i + 1}.</span>
              <input value={s} onChange={(e) => setStep(i, e.target.value)} className={inp} placeholder="e.g. Open the app and sign up" />
              <button type="button" onClick={() => removeStep(i)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-red-400 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:text-green-300">
            <Plus className="w-4 h-4" /> Add step
          </button>
        </div>
      </div>

      {/* Proof requirements */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Proof requirements</p>
            <p className="text-[11px] text-gray-500">
              What the user must prove. Leave empty for the classic single
              install screenshot.
            </p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:text-green-300 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add requirement
          </button>
        </div>

        {proofItems.length > 0 && (
          <div className="mt-3 space-y-3">
            {proofItems.map((it, i) => (
              <div
                key={it.id}
                className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0">{i + 1}.</span>
                  <select
                    value={it.kind}
                    onChange={(e) =>
                      changeKind(i, e.target.value as ProofItemKind)
                    }
                    className={`${inp} max-w-48`}
                  >
                    {(Object.keys(KIND_LABEL) as ProofItemKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  {needsTarget(it.kind) && (
                    <input
                      type="number"
                      min={1}
                      value={it.target ?? 1}
                      onChange={(e) =>
                        setItem(i, { target: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className={`${inp} w-24`}
                      placeholder={it.kind === "PLAYTIME" ? "mins" : it.kind === "DAYS" ? "days" : "level"}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-red-400 shrink-0 ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <input
                  value={it.label}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                  className={inp}
                  placeholder="What the user sees, e.g. Screenshot showing level 10"
                />

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={it.screenshot}
                      onChange={(e) => setItem(i, { screenshot: e.target.checked })}
                      className="w-4 h-4 accent-green-500"
                    />
                    Require screenshot
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={it.valueLabel != null}
                      onChange={(e) =>
                        setItem(i, {
                          valueLabel: e.target.checked
                            ? proofItemPreset(it.kind, it.target).valueLabel ??
                              "Your answer"
                            : undefined,
                        })
                      }
                      className="w-4 h-4 accent-green-500"
                    />
                    Ask for a typed value
                  </label>
                  {it.valueLabel != null && (
                    <input
                      value={it.valueLabel}
                      onChange={(e) => setItem(i, { valueLabel: e.target.value })}
                      className={`${inp} max-w-48`}
                      placeholder="Value label, e.g. Level reached"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-approve */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value.autoApprove}
          disabled={hasRichProof(value)}
          onChange={(e) => set("autoApprove", e.target.checked)}
          className="w-4 h-4 accent-green-500 disabled:opacity-40"
        />
        <span className="text-sm text-gray-300">
          Auto-approve on submit (skip manual review)
        </span>
      </label>
      {hasRichProof(value) && (
        <p className="-mt-2 text-[11px] text-amber-400/80">
          Auto-approve is off because some requirements need a human to verify a
          target or typed value.
        </p>
      )}
    </div>
  );
}
