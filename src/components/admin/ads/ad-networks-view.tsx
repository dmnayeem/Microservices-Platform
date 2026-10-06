"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  AD_NETWORKS,
  EMPTY_NETWORK_ENTRY,
  adsTxtLineFor,
  normalizeNetworkSettings,
  type NetworkSettings,
  type NetworkSettingsEntry,
} from "@/lib/ad-networks/registry";

const inputCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

const KIND_LABEL: Record<string, string> = {
  BANNER_IFRAME: "Banner",
  NATIVE_WIDGET: "Native",
  PAGE_SCRIPT: "Page script",
};

function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        on ? "bg-blue-600" : "bg-slate-700"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white transition-transform",
          on ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function AdNetworksView({
  canManage,
  paidPrefixes,
}: {
  canManage: boolean;
  paidPrefixes: string[];
}) {
  const [settings, setSettings] = useState<NetworkSettings | null>(null);
  const [google, setGoogle] = useState<{ adsenseClient: string; gamNetworkCode: string } | null>(null);
  const [frameOrigin, setFrameOrigin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ads/networks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setSettings(normalizeNetworkSettings(d?.settings));
        setGoogle(d?.google ?? null);
        setFrameOrigin(d?.frameOrigin ?? null);
      })
      .catch(() => setSettings(normalizeNetworkSettings(null)));
  }, []);

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const patch = (id: string, p: Partial<NetworkSettingsEntry>) =>
    setSettings((s) =>
      s
        ? {
            ...s,
            networks: {
              ...s.networks,
              [id]: { ...(s.networks[id] ?? EMPTY_NETWORK_ENTRY), ...p },
            },
          }
        : s
    );

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ads/networks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      const d = await res.json();
      setSettings(normalizeNetworkSettings(d.settings));
      toast.success("Network settings saved");
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2 text-sm">
        <p className="font-semibold text-white">Frame origin</p>
        {frameOrigin ? (
          <p className="text-slate-400">
            Network snippets run on <span className="text-white">{frameOrigin}</span> — they get
            their own cookies and storage, never the app&apos;s.
          </p>
        ) : (
          <p className="text-amber-400">
            AD_FRAME_ORIGIN is not set, so network snippets run in a locked-down frame with no
            cookies or storage. Many networks (Taboola, Outbrain, most push / native networks)
            fill poorly or not at all there. Point a subdomain such as ads.revtype.com at this
            app and set AD_FRAME_ORIGIN to it.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-start justify-between gap-4">
        <div className="text-sm">
          <p className="font-semibold text-white">Page scripts alongside Google</p>
          <p className="text-slate-400">
            Popunder / push / vignette networks are skipped on pages that also load AdSense or Ad
            Manager — a popunder next to AdSense breaks Google&apos;s policies. Only turn this on
            if you are not using Google.
          </p>
        </div>
        <Toggle
          label="Page scripts alongside Google"
          on={settings.pageScriptsWithGoogle}
          disabled={!canManage}
          onChange={(v) => setSettings({ ...settings, pageScriptsWithGoogle: v })}
        />
      </div>

      <div className="space-y-2">
        {AD_NETWORKS.map((n) => {
          const e = settings.networks[n.id] ?? EMPTY_NETWORK_ENTRY;
          const googleId =
            n.id === "adsense" ? google?.adsenseClient : n.id === "gam" ? google?.gamNetworkCode : "";
          const line = n.google
            ? n.id === "adsense" && googleId
              ? adsTxtLineFor(n, googleId)
              : null
            : adsTxtLineFor(n, e.publisherId);
          const expanded = open === n.id;
          return (
            <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {n.name}
                    {n.adult && (
                      <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                        ADULT DEMAND
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {n.kinds.map((k) => KIND_LABEL[k]).join(" · ")}
                  </p>
                </div>
                {n.google ? (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                    {googleId ? `Configured (${googleId})` : "Not configured"} ·{" "}
                    <Link href="/admin/monetization" className="text-blue-400 hover:underline">
                      Monetization
                    </Link>
                  </span>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    Enabled
                    <Toggle
                      label={`Enable ${n.name}`}
                      on={e.enabled}
                      disabled={!canManage}
                      onChange={(v) => patch(n.id, { enabled: v })}
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : n.id)}
                  className="text-xs text-blue-400 hover:underline"
                >
                  {expanded ? "Close" : "Settings"}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-400">{n.notes}</p>
                  {!n.google && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">{n.publisherIdLabel}</label>
                      <input
                        value={e.publisherId}
                        disabled={!canManage}
                        onChange={(ev) => patch(n.id, { publisherId: ev.target.value })}
                        className={inputCls}
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-xs">
                      <p className="font-semibold text-slate-300">Allowed on paid pages</p>
                      <p className="text-slate-500">
                        {n.google
                          ? "Never — Google prohibits its ads on pages that reward users."
                          : "Task, earn, quiz, mission and reward screens. Off unless the network's terms allow incentivised traffic."}
                      </p>
                    </div>
                    <Toggle
                      label={`Allow ${n.name} on paid pages`}
                      on={!n.google && e.allowOnPaid}
                      disabled={!canManage || !!n.google}
                      onChange={(v) => patch(n.id, { allowOnPaid: v })}
                    />
                  </div>
                  {!n.google && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Extra ads.txt lines from {n.name} (one per line)
                      </label>
                      <textarea
                        value={e.adsTxt}
                        disabled={!canManage}
                        onChange={(ev) => patch(n.id, { adsTxt: ev.target.value })}
                        rows={3}
                        className={cn(inputCls, "font-mono text-xs")}
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    ads.txt line:{" "}
                    <span className="font-mono text-slate-300">
                      {line ?? (n.adsTxt ? "— enter the publisher id" : "— this network has no standard line")}
                    </span>
                    {!n.google && !e.enabled && line ? " (added once enabled)" : ""}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm space-y-2">
        <p className="font-semibold text-white">AdSense Auto ads — URL exclusions</p>
        <p className="text-slate-400">
          The app keeps Google&apos;s script off these paths, but Auto ads are controlled in the
          AdSense console. Add each as a URL exclusion there (Ads → By site → Auto ads → Page
          exclusions):
        </p>
        <p className="font-mono text-xs text-slate-300 break-words">
          {paidPrefixes.map((p) => `${p}/*`).join("  ")}
        </p>
      </div>

      {canManage && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      )}
    </div>
  );
}
