"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  initial: Record<string, unknown>;
  canEdit: boolean;
}

const DEFAULTS = {
  enabled: true,
  display_type: "SCROLLING" as "SCROLLING" | "STATIC" | "POPUP",
  show_real: true,
  include_fake: true,
  fake_username_pattern: "User###,Anon###,Crypto###",
  fake_min_amount: 5,
  fake_max_amount: 250,
  fake_methods: "BKASH,NAGAD,PAYPAL,BINANCE",
  fake_frequency_seconds: 8,
  scroll_speed_ms: 30000,
  max_items: 10,
  min_amount_to_show: 5,
  countries: "WORLDWIDE",
  show_amount: true,
  show_method: true,
  show_country: false,
};

export function TickerSettingsForm({ initial, canEdit }: Props) {
  const router = useRouter();
  const [v, setV] = useState({ ...DEFAULTS, ...initial });
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof DEFAULTS>(k: K, val: (typeof DEFAULTS)[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const save = async () => {
    setBusy(true);
    try {
      const settings: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) settings[`ticker_${k}`] = val;
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "ticker", settings }),
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

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      <Toggle
        label="Enable Ticker on Home Feed"
        checked={!!v.enabled}
        onChange={(b) => set("enabled", b)}
        disabled={!canEdit}
      />

      <Field label="Display Type">
        <select
          value={v.display_type as string}
          onChange={(e) =>
            set("display_type", e.target.value as never)
          }
          disabled={!canEdit}
          className={inp}
        >
          <option value="SCROLLING">Scrolling</option>
          <option value="STATIC">Static</option>
          <option value="POPUP">Popup</option>
        </select>
      </Field>

      <Toggle
        label="Show real withdrawals"
        checked={!!v.show_real}
        onChange={(b) => set("show_real", b)}
        disabled={!canEdit}
      />

      <Toggle
        label="Include fake/demo entries"
        description="Mix in synthetic entries to keep the ticker active"
        checked={!!v.include_fake}
        onChange={(b) => set("include_fake", b)}
        disabled={!canEdit}
      />

      {v.include_fake && (
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
            Fake entry generator
          </p>
          <Field label="Username patterns (comma-separated, ### = random digits)">
            <input
              value={v.fake_username_pattern as string}
              onChange={(e) => set("fake_username_pattern", e.target.value)}
              disabled={!canEdit}
              className={inp + " font-mono text-xs"}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Amount ($)">
              <input
                type="number"
                step={0.01}
                value={Number(v.fake_min_amount ?? 5)}
                onChange={(e) =>
                  set("fake_min_amount", parseFloat(e.target.value) || 0)
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field label="Max Amount ($)">
              <input
                type="number"
                step={0.01}
                value={Number(v.fake_max_amount ?? 250)}
                onChange={(e) =>
                  set("fake_max_amount", parseFloat(e.target.value) || 0)
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
          </div>
          <Field label="Methods to include (comma-separated)">
            <input
              value={v.fake_methods as string}
              onChange={(e) => set("fake_methods", e.target.value)}
              disabled={!canEdit}
              className={inp + " font-mono text-xs"}
            />
          </Field>
          <Field label="Generate every N seconds">
            <input
              type="number"
              min={1}
              value={Number(v.fake_frequency_seconds ?? 8)}
              onChange={(e) =>
                set("fake_frequency_seconds", parseInt(e.target.value) || 8)
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Scroll Speed (ms)">
          <input
            type="number"
            min={1000}
            value={Number(v.scroll_speed_ms ?? 30000)}
            onChange={(e) =>
              set("scroll_speed_ms", parseInt(e.target.value) || 30000)
            }
            disabled={!canEdit}
            className={inp}
          />
        </Field>
        <Field label="Max Entries Shown">
          <input
            type="number"
            min={1}
            value={Number(v.max_items ?? 10)}
            onChange={(e) => set("max_items", parseInt(e.target.value) || 10)}
            disabled={!canEdit}
            className={inp}
          />
        </Field>
      </div>

      <Field label="Min Amount to Show ($)">
        <input
          type="number"
          step={0.01}
          value={Number(v.min_amount_to_show ?? 5)}
          onChange={(e) =>
            set("min_amount_to_show", parseFloat(e.target.value) || 0)
          }
          disabled={!canEdit}
          className={inp}
        />
      </Field>

      <Field label="Allowed Countries (comma-separated ISO codes or WORLDWIDE)">
        <input
          value={v.countries as string}
          onChange={(e) => set("countries", e.target.value)}
          disabled={!canEdit}
          className={inp + " font-mono text-xs"}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Toggle
          label="Show amount"
          checked={!!v.show_amount}
          onChange={(b) => set("show_amount", b)}
          disabled={!canEdit}
          compact
        />
        <Toggle
          label="Show method"
          checked={!!v.show_method}
          onChange={(b) => set("show_method", b)}
          disabled={!canEdit}
          compact
        />
        <Toggle
          label="Show country"
          checked={!!v.show_country}
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
