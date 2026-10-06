"use client";

import Link from "next/link";
import { HTML_AD_NETWORKS, getAdNetwork } from "@/lib/ad-networks/registry";
import { checkHtmlAd } from "@/lib/ad-networks/validate";

/**
 * The extra fields an HTML / network-snippet ad needs, shared by the Ad Manager
 * edit modal and the new-ad wizard so the two can never disagree:
 *
 *  - which ad network the snippet belongs to (drives the frame's CSP, ads.txt,
 *    and whether it may run on paid pages),
 *  - an optional mobile variant with its own size (used below 728px),
 *  - for the site-wide Page Script space, the per-viewer frequency cap.
 *
 * It also shows the server's own validation messages live (checkHtmlAd), so the
 * admin sees "this needs a size" before pressing Save, not after.
 */

export const MOBILE_SIZE_PRESETS: { key: string; label: string; w: number; h: number }[] = [
  { key: "320x50", label: "Mobile banner — 320×50", w: 320, h: 50 },
  { key: "320x100", label: "Large mobile — 320×100", w: 320, h: 100 },
  { key: "300x250", label: "Rectangle — 300×250", w: 300, h: 250 },
  { key: "468x60", label: "Banner — 468×60", w: 468, h: 60 },
];

export interface HtmlNetworkValue {
  networkId: string;
  mobileHtml: string;
  mobileWidth: string;
  mobileHeight: string;
  freqCapPerDay: string;
  freqMinGapMinutes: string;
}

export function htmlNetworkInitial(ad?: {
  networkId?: string | null;
  mobileHtmlContent?: string | null;
  mobileWidth?: number | null;
  mobileHeight?: number | null;
  freqCapPerDay?: number | null;
  freqMinGapMinutes?: number | null;
} | null): HtmlNetworkValue {
  return {
    networkId: ad?.networkId ?? "",
    mobileHtml: ad?.mobileHtmlContent ?? "",
    mobileWidth: ad?.mobileWidth != null ? String(ad.mobileWidth) : "320",
    mobileHeight: ad?.mobileHeight != null ? String(ad.mobileHeight) : "50",
    freqCapPerDay: ad?.freqCapPerDay != null ? String(ad.freqCapPerDay) : "",
    freqMinGapMinutes: ad?.freqMinGapMinutes != null ? String(ad.freqMinGapMinutes) : "",
  };
}

/** The request-body fields for an HTML ad (empty strings clear). */
export function htmlNetworkPayload(v: HtmlNetworkValue, isHtml: boolean) {
  if (!isHtml) {
    return { networkId: null, mobileHtmlContent: null, mobileWidth: null, mobileHeight: null };
  }
  const hasMobile = !!v.mobileHtml.trim();
  return {
    networkId: v.networkId || null,
    mobileHtmlContent: hasMobile ? v.mobileHtml : null,
    mobileWidth: hasMobile ? Number(v.mobileWidth) || null : null,
    mobileHeight: hasMobile ? Number(v.mobileHeight) || null : null,
    freqCapPerDay: v.freqCapPerDay.trim() === "" ? null : Number(v.freqCapPerDay),
    freqMinGapMinutes: v.freqMinGapMinutes.trim() === "" ? null : Number(v.freqMinGapMinutes),
  };
}

export function HtmlNetworkFields({
  value,
  onChange,
  placementName,
  size,
  width,
  height,
  inputCls,
}: {
  value: HtmlNetworkValue;
  onChange: (v: HtmlNetworkValue) => void;
  placementName: string;
  size: string;
  width?: string;
  height?: string;
  inputCls: string;
}) {
  const set = (patch: Partial<HtmlNetworkValue>) => onChange({ ...value, ...patch });
  const net = getAdNetwork(value.networkId);
  const isPageScript = placementName === "PAGE_SCRIPT";
  const problems = checkHtmlAd({
    placementName,
    type: "HTML",
    size,
    width: Number(width) || null,
    height: Number(height) || null,
    networkId: value.networkId || null,
    mobileHtml: value.mobileHtml,
    mobileWidth: Number(value.mobileWidth) || null,
    mobileHeight: Number(value.mobileHeight) || null,
  });
  const presetKey = `${value.mobileWidth}x${value.mobileHeight}`;

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Ad network</label>
        <select
          value={value.networkId}
          onChange={(e) => set({ networkId: e.target.value })}
          className={inputCls}
        >
          <option value="">None — own / direct-sold HTML</option>
          {HTML_AD_NETWORKS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        {net ? (
          <p className="mt-1 text-[11px] text-slate-500">
            {net.notes}{" "}
            <Link href="/admin/ads/networks" className="text-blue-400 hover:underline">
              Network settings
            </Link>{" "}
            — the network must be enabled there, and it only runs on paid pages if you allow it.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">
            Pick the network when the code comes from one — it decides ads.txt, the frame&apos;s
            security policy, and whether it may run on pages that pay users.
          </p>
        )}
      </div>

      {isPageScript ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Max per viewer per day</label>
            <input
              type="number"
              min={1}
              value={value.freqCapPerDay}
              onChange={(e) => set({ freqCapPerDay: e.target.value })}
              placeholder="Unlimited"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Min. minutes between</label>
            <input
              type="number"
              min={1}
              value={value.freqMinGapMinutes}
              onChange={(e) => set({ freqMinGapMinutes: e.target.value })}
              placeholder="No gap"
              className={inputCls}
            />
          </div>
          <p className="col-span-2 text-[11px] text-slate-500">
            Page scripts run site-wide on pages that don&apos;t pay users, never on task / earn
            pages. The cap is counted in each viewer&apos;s browser.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-slate-400">
            Mobile version (optional — used below 728px wide)
          </label>
          <textarea
            value={value.mobileHtml}
            onChange={(e) => set({ mobileHtml: e.target.value })}
            rows={3}
            className={inputCls}
            placeholder="The network's 320×50 / 300×250 code for phones"
          />
          {value.mobileHtml.trim() && (
            <select
              value={MOBILE_SIZE_PRESETS.some((p) => p.key === presetKey) ? presetKey : "320x50"}
              onChange={(e) => {
                const p = MOBILE_SIZE_PRESETS.find((x) => x.key === e.target.value);
                if (p) set({ mobileWidth: String(p.w), mobileHeight: String(p.h) });
              }}
              className={inputCls}
            >
              {MOBILE_SIZE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <ul className="space-y-0.5">
          {problems.map((p, i) => (
            <li key={i} className="text-[11px] text-amber-400">
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
