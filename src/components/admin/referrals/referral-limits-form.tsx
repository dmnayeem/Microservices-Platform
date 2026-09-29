"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Loader2, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Referral limits & notification — moved here from System Settings.
 *
 * The keys, and the categories their rows are filed under, are unchanged
 * (`max_referrals_per_user` → "limits", `notify_referral` → "notifications").
 * It saves through the same `POST /api/admin/settings` the settings screen
 * uses, so validation, audit and cache priming are identical.
 */
export function ReferralLimitsForm({
  maxReferrals: initialMax,
  notifyReferral: initialNotify,
  canEdit,
}: {
  maxReferrals: number;
  notifyReferral: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [maxReferrals, setMax] = useState(initialMax);
  const [notify, setNotify] = useState(initialNotify);
  const [busy, setBusy] = useState(false);
  const valid = Number.isInteger(maxReferrals) && maxReferrals >= 0 && maxReferrals <= 1_000_000;

  const post = async (category: string, settings: Record<string, unknown>) => {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, settings }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      // Only what changed is written — an untouched key keeps its row as is.
      if (maxReferrals !== initialMax)
        await post("limits", { max_referrals_per_user: maxReferrals });
      if (notify !== initialNotify)
        await post("notifications", { notify_referral: notify });
      toast.success("Referral limits saved");
      router.refresh();
    } catch (e) {
      toast.error("Failed to save", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const dirty = maxReferrals !== initialMax || notify !== initialNotify;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <label className="block text-sm text-gray-200">
          Max referrals per user
          <input
            type="number"
            min={0}
            step={1}
            value={Number.isFinite(maxReferrals) ? maxReferrals : ""}
            disabled={!canEdit}
            onChange={(e) => setMax(Number(e.target.value))}
            className={`mt-1 block w-40 px-3 py-2 bg-gray-950 border rounded-lg text-sm text-white tabular-nums focus:outline-none disabled:opacity-50 ${
              valid ? "border-gray-800" : "border-red-500"
            }`}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Beyond this, new signups through a user&apos;s link stop being attributed to them.
            0 = no limit.
          </span>
          {!valid && (
            <span className="block text-xs text-red-400">Whole number, 0 or more.</span>
          )}
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={notify}
            disabled={!canEdit}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span>
            Notify a user when someone signs up through their link
            <span className="block text-xs text-gray-500">
              Off means the email and push are not sent. The in-app notification is still
              recorded.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-300">Per-plan referral settings</p>
          <Link
            href="/admin/packages"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
          >
            Packages <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
          Whether a plan can earn referrals at all, how many upline levels it earns commission
          from, and its daily referral points are set per package.
        </p>
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={save}
          disabled={busy || !valid || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      ) : (
        <p className="text-xs text-amber-400">
          View-only — saving these needs the settings edit permission.
        </p>
      )}
    </div>
  );
}
