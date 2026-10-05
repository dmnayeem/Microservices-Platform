"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { BADGE_STYLE_KIND, PAID_STYLE_KEYS, styleLabel, type BadgeConfig } from "@/lib/badges";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { toast } from "@/lib/toast";

/** Prices and which badge styles are on sale. Saved as one setting. */
export function BadgeConfigEditor({ canEdit }: { canEdit: boolean }) {
  const [cfg, setCfg] = useState<BadgeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/badges", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d.config ?? null));
  }, []);

  if (!cfg) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  const setStyle = (k: string, patch: Partial<{ enabled: boolean; priceUsd: number }>) =>
    setCfg({ ...cfg, styles: { ...cfg.styles, [k]: { ...cfg.styles[k], ...patch } } });

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/badges", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Try again");
      setCfg(d.config);
      toast.success("Badge shop saved");
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setSaving(false);
    }
  };

  const groups = [
    { title: "Animated styles", keys: PAID_STYLE_KEYS.filter((k) => BADGE_STYLE_KIND[k] === "animated") },
    { title: "Premium colours", keys: PAID_STYLE_KEYS.filter((k) => BADGE_STYLE_KIND[k] === "color") },
  ];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-white">Prices &amp; what is on sale</p>
          <p className="text-sm text-gray-400">Monthly prices in USD. Members pay from their wallet (cash, or points at the published rate). Renewals take cash.</p>
        </div>
        <button
          type="button"
          disabled={!canEdit || saving}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
          <span>
            <span className="block text-sm font-semibold text-white">Shop open</span>
            <span className="block text-xs text-gray-400">Closed: nothing can be bought or renewed. Badges already bought keep working until they end.</span>
          </span>
          <input type="checkbox" disabled={!canEdit} checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="h-5 w-5 accent-emerald-500" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
          <span className="flex items-center gap-2">
            <VerifiedBadge style="BLUE" size="md" />
            <span>
              <span className="block text-sm font-semibold text-white">Blue badge</span>
              <span className="block text-xs text-gray-400">per month</span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            $
            <input
              type="number"
              min={0}
              step={0.01}
              disabled={!canEdit}
              value={cfg.badgePriceUsd}
              onChange={(e) => setCfg({ ...cfg, badgePriceUsd: Number(e.target.value) })}
              className="w-24 rounded-md bg-gray-800 px-2 py-1.5 text-sm text-white"
            />
          </span>
        </label>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">{g.title}</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {g.keys.map((k) => {
              const s = cfg.styles[k];
              return (
                <div key={k} className={`flex items-center gap-3 rounded-lg border p-3 ${s.enabled ? "border-gray-700 bg-gray-950" : "border-gray-800 bg-gray-950/40 opacity-60"}`}>
                  <VerifiedBadge style={k} size="md" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{styleLabel(k)}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    $
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      disabled={!canEdit}
                      value={s.priceUsd}
                      onChange={(e) => setStyle(k, { priceUsd: Number(e.target.value) })}
                      className="w-16 rounded-md bg-gray-800 px-1.5 py-1 text-sm text-white"
                    />
                  </span>
                  <input
                    type="checkbox"
                    title="On sale"
                    disabled={!canEdit}
                    checked={s.enabled}
                    onChange={(e) => setStyle(k, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
