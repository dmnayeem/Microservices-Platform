"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Users } from "lucide-react";

type Impact = {
  users: number;
  completeEssentials: number;
  completeFull: number;
  bestPercentage: number;
  features: readonly { key: string; label: string }[];
  phoneVerificationAvailable: boolean;
};

/**
 * The profile gate's standard and scope, shown under its on/off switch, with
 * the number of users each choice would lock out RIGHT NOW. The gate is the
 * one setting on this screen that can stop every user earning at once, so the
 * consequence is on screen before the Save button is.
 */
export function ProfileGateSettings({
  on,
  mode,
  features,
  onMode,
  onFeatures,
  disabled,
}: {
  on: boolean;
  mode: string;
  features: string[];
  onMode: (v: string) => void;
  onFeatures: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/profile-gate", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j && setImpact(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const complete = impact ? (mode === "FULL" ? impact.completeFull : impact.completeEssentials) : null;
  const locked = impact && complete !== null ? impact.users - complete : null;

  return (
    <div className="ml-1 mt-1 space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-300">Standard a profile must meet</p>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "ESSENTIALS", l: "7 essentials", d: "Photo, name, birth date, gender, phone, country" },
            { v: "FULL", l: "Full 100% profile", d: "Everything on the profile ring" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              disabled={disabled}
              onClick={() => onMode(o.v)}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs disabled:opacity-50 ${
                mode === o.v ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              <span className="block font-semibold">{o.l}</span>
              <span className="block text-[10px] opacity-80">{o.d}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-300">Locked until then</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {(impact?.features ?? []).map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                disabled={disabled}
                checked={features.includes(f.key)}
                onChange={(e) =>
                  onFeatures(e.target.checked ? [...features, f.key] : features.filter((x) => x !== f.key))
                }
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      {impact && (
        <div
          className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${
            locked && locked > 0 ? "border border-rose-500/30 bg-rose-500/10 text-rose-200" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {locked && locked > 0 ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {complete} of {impact.users} users meet this standard today.{" "}
            {locked && locked > 0 ? (
              <strong>
                {on ? "" : "If you switch the gate on, "}
                {locked} would be locked out of {features.length ? "the features ticked above" : "nothing (no feature is ticked)"}
              </strong>
            ) : (
              "Nobody would be locked out."
            )}
            {mode === "FULL" && ` The most complete profile is at ${impact.bestPercentage}%.`}
          </span>
        </div>
      )}
      {impact && !impact.phoneVerificationAvailable && (
        <p className="text-[11px] text-slate-500">
          Phone verification is not counted: there is no verify-phone page yet and Firebase is not configured, so no one could
          complete it. With it in the total, 100% was impossible for everyone.
        </p>
      )}
    </div>
  );
}
