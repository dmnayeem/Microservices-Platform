"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import type { TickerConfig, TickerSource } from "@/lib/ticker-server";

interface Props {
  initial: TickerConfig;
  canEdit: boolean;
}

const SOURCES: { value: TickerSource; label: string; description: string }[] = [
  {
    value: "REAL",
    label: "Real withdrawals",
    description: "Only payouts that were actually completed. Staff accounts are left out.",
  },
  {
    value: "GENERATED",
    label: "Generated entries",
    description: "Only made-up entries from the generator below. No real user is shown.",
  },
  {
    value: "BOTH",
    label: "Both",
    description: "Real payouts first; generated entries fill the remaining slots.",
  },
];

export function TickerSettingsForm({ initial, canEdit }: Props) {
  const router = useRouter();
  const [v, setV] = useState<TickerConfig>(initial);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof TickerConfig>(k: K, val: TickerConfig[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ticker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Ticker settings saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const usesGenerated = v.source !== "REAL";
  const usesReal = v.source !== "GENERATED";

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      <Toggle
        label="Show the ticker on the social feed"
        description="Off hides it for everyone."
        checked={v.enabled}
        onChange={(b) => set("enabled", b)}
        disabled={!canEdit}
      />

      <fieldset className="space-y-2" disabled={!canEdit}>
        <legend className="block text-xs font-medium text-slate-400 mb-1.5">
          What to show
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SOURCES.map((s) => (
            <label
              key={s.value}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer ${
                v.source === s.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-700 bg-slate-950/50"
              } ${!canEdit ? "opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="ticker-source"
                value={s.value}
                checked={v.source === s.value}
                onChange={() => set("source", s.value)}
                className="mt-1 bg-slate-800 border-slate-600 text-blue-500"
              />
              <div>
                <p className="text-sm text-white">{s.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {usesReal && (
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
            Real withdrawals
          </p>
          <Field label="Min amount to show ($)">
            <input
              type="number"
              step={0.01}
              min={0}
              value={v.min_amount_to_show}
              onChange={(e) => set("min_amount_to_show", parseFloat(e.target.value) || 0)}
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field label="Countries (comma-separated ISO codes, or WORLDWIDE)">
            <input
              value={v.countries}
              onChange={(e) => set("countries", e.target.value)}
              disabled={!canEdit}
              className={inp + " font-mono text-xs"}
            />
          </Field>
        </div>
      )}

      {usesGenerated && (
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
            Generated entries
          </p>
          <Field label="Username patterns (comma-separated, ### = random digits)">
            <input
              value={v.fake_username_pattern}
              onChange={(e) => set("fake_username_pattern", e.target.value)}
              disabled={!canEdit}
              className={inp + " font-mono text-xs"}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min amount ($)">
              <input
                type="number"
                step={0.01}
                min={0}
                value={v.fake_min_amount}
                onChange={(e) => set("fake_min_amount", parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field label="Max amount ($)">
              <input
                type="number"
                step={0.01}
                min={0}
                value={v.fake_max_amount}
                onChange={(e) => set("fake_max_amount", parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
          </div>
          <Field label="Methods (comma-separated: BKASH, NAGAD, ROCKET, BINANCE, BITGET, PAYPAL)">
            <input
              value={v.fake_methods}
              onChange={(e) => set("fake_methods", e.target.value)}
              disabled={!canEdit}
              className={inp + " font-mono text-xs"}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Scroll speed (ms for one full pass)">
          <input
            type="number"
            min={5000}
            step={1000}
            value={v.scroll_speed_ms}
            onChange={(e) => set("scroll_speed_ms", parseInt(e.target.value) || 30000)}
            disabled={!canEdit}
            className={inp}
          />
        </Field>
        <Field label="Max entries shown">
          <input
            type="number"
            min={1}
            max={50}
            value={v.max_items}
            onChange={(e) => set("max_items", parseInt(e.target.value) || 10)}
            disabled={!canEdit}
            className={inp}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Toggle
          label="Show amount"
          checked={v.show_amount}
          onChange={(b) => set("show_amount", b)}
          disabled={!canEdit}
          compact
        />
        <Toggle
          label="Show method"
          checked={v.show_method}
          onChange={(b) => set("show_method", b)}
          disabled={!canEdit}
          compact
        />
        <Toggle
          label="Show country"
          description={usesReal ? undefined : "Generated entries have no country"}
          checked={v.show_country}
          onChange={(b) => set("show_country", b)}
          disabled={!canEdit}
          compact
        />
      </div>

      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          onClick={save}
          disabled={!canEdit || busy}
          className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Ticker Settings
        </button>
      </div>
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
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  compact,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 ${compact ? "px-3 py-2" : "px-4 py-3"} rounded-lg bg-slate-950/50 border border-slate-700 cursor-pointer ${disabled ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="rounded bg-slate-800 border-slate-600 text-blue-500"
      />
      <div className="flex-1">
        <p className="text-sm text-white">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}
