"use client";

import { FRAUD_SIGNALS, type FraudSignal } from "@/lib/fraud-signals";

/**
 * Risk % added per kind of cheating. Stored as `{ SIGNAL: points }` under
 * `antifraud.risk_points`; a signal left at its default is not stored, so a
 * later change to the default still reaches it.
 */
export function RiskPointsEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const keys = Object.keys(FRAUD_SIGNALS) as FraudSignal[];
  const setOne = (k: FraudSignal, raw: string) => {
    const n = Math.min(100, Math.max(0, Math.round(Number(raw)) || 0));
    const next = { ...value };
    if (n === FRAUD_SIGNALS[k].points) delete next[k];
    else next[k] = n;
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <span className="min-w-0 flex-1 text-xs text-slate-300">{FRAUD_SIGNALS[k].label}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={value[k] ?? FRAUD_SIGNALS[k].points}
            onChange={(e) => setOne(k, e.target.value)}
            disabled={disabled}
            aria-label={`Risk points: ${FRAUD_SIGNALS[k].label}`}
            className="w-16 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-white tabular-nums"
          />
          <span className="text-xs text-slate-500">%</span>
        </div>
      ))}
    </div>
  );
}
