"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Scissors,
  Search,
  Share2,
  Tag,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  VISIT_KIND_LABEL,
  VISIT_MAX_CLICKS,
  hostOf,
  visitChecklist,
  visitDestinationPath,
  type VisitConfig,
  type VisitKind,
  type VisitSource,
  type VisitViewer,
} from "@/lib/visit-tasks";
import { NumberInput } from "@/components/admin/number-input";

/**
 * Admin builder for VISIT tasks (lib/visit-tasks.ts): a direct / smart link
 * the user must stay on for N seconds, or a URL shortener that ends on our
 * page with a personal code.
 */
export function VisitTaskBuilder({
  value,
  onChange,
  taskId,
}: {
  value: VisitConfig;
  onChange: (next: VisitConfig) => void;
  /** Known once the task is saved — the shortener destination needs it. */
  taskId?: string | null;
}) {
  const set = (patch: Partial<VisitConfig>) => onChange({ ...value, ...patch });
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );
  const inp =
    "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-red-500";
  const destination = taskId && origin ? `${origin}${visitDestinationPath(taskId)}` : null;

  const kinds: { key: VisitKind; icon: typeof Link2; text: string }[] = [
    { key: "DIRECT", icon: Link2, text: "An ad network's direct / smart link. The user must stay on it for the time you set." },
    { key: "SHORTENER", icon: Scissors, text: "A short link (ouo.io, shrinkme…) that ends on our page with the user's own code." },
  ];
  const viewers: { key: VisitViewer; icon: typeof Link2; label: string; text: string }[] = [
    { key: "tab", icon: ExternalLink, label: "New tab", text: "Time only — works with any link." },
    { key: "inapp", icon: AppWindow, label: "In RevType's viewer", text: "Scroll, time and clicks checklist on top of the page." },
  ];
  const sources: { key: VisitSource; icon: typeof Link2; label: string }[] = [
    { key: "direct", icon: Link2, label: "Direct" },
    { key: "social", icon: Share2, label: "From a social post" },
    { key: "search", icon: Search, label: "From a search" },
  ];
  const utmFields: { key: "utmSource" | "utmMedium" | "utmCampaign"; label: string; placeholder: string }[] = [
    { key: "utmSource", label: "utm_source", placeholder: "revtype" },
    { key: "utmMedium", label: "utm_medium", placeholder: "visit_task" },
    { key: "utmCampaign", label: "utm_campaign", placeholder: "october" },
  ];
  const inapp = value.kind === "DIRECT" && value.viewer === "inapp";
  const targetHost = hostOf(value.url);

  // "Test this link": the server reads the page's framing headers.
  const [probe, setProbe] = useState<
    { state: "idle" } | { state: "loading" } | { state: "done"; ok: boolean; reason?: string }
  >({ state: "idle" });
  async function testLink() {
    setProbe({ state: "loading" });
    try {
      const res = await fetch("/api/admin/tasks/visit-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value.url }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; error?: string };
      if (!res.ok) {
        setProbe({ state: "idle" });
        toast.error(data.error ?? "Couldn't test the link.");
        return;
      }
      setProbe({ state: "done", ok: data.ok === true, reason: data.reason });
    } catch {
      setProbe({ state: "idle" });
      toast.error("Couldn't test the link.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => set({ kind: k.key })}
            className={`rounded-xl border p-4 text-left transition-colors ${
              value.kind === k.key ? "border-red-500 bg-red-500/10" : "border-gray-700 hover:border-gray-500"
            }`}
          >
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <k.icon className="h-4 w-4" /> {VISIT_KIND_LABEL[k.key]}
            </p>
            <p className="mt-1 text-xs text-gray-400">{k.text}</p>
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          {value.kind === "DIRECT" ? "Direct / smart link" : "Short link (the shortened URL)"}
        </label>
        <input
          value={value.url}
          onChange={(e) => {
            set({ url: e.target.value });
            setProbe({ state: "idle" });
          }}
          placeholder="https://…"
          className={inp}
        />
        <p className="mt-1 text-xs text-gray-500">Users never see this link before they press Open — it opens through our tracker.</p>
      </div>

      {value.kind === "DIRECT" ? (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">How the member visits</label>
            <div className="grid gap-3 sm:grid-cols-2">
              {viewers.map((v) => {
                const disabled = v.key === "inapp" && value.source !== "direct";
                return (
                  <button
                    key={v.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => set({ viewer: v.key })}
                    className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      value.viewer === v.key ? "border-red-500 bg-red-500/10" : "border-gray-700 hover:border-gray-500"
                    }`}
                  >
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                      <v.icon className="h-4 w-4" /> {v.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{v.text}</p>
                  </button>
                );
              })}
            </div>
            {value.source !== "direct" && (
              <p className="mt-1 text-xs text-gray-500">
                Social and search visits always open in a new tab — those sites refuse to be shown inside another site.
              </p>
            )}
          </div>

          <div className={`grid gap-3 ${inapp ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {inapp && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Scroll (% of the page)</label>
                <NumberInput
                  min={0}
                  max={100}
                  value={value.scrollPercent}
                  onChange={(e) => set({ scrollPercent: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                  className={inp}
                />
                <p className="mt-1 text-xs text-gray-500">0 = off. The timer starts once this is reached.</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Stay time (seconds)</label>
              <NumberInput
                min={5}
                max={600}
                value={value.staySeconds}
                onChange={(e) => set({ staySeconds: Math.max(5, Math.min(600, parseInt(e.target.value) || 5)) })}
                className={inp}
              />
              <p className="mt-1 text-xs text-gray-500">
                {inapp
                  ? "Measured on our server from the moment the page opens."
                  : "Shown on the task. Coming back sooner pays nothing (they can open it again, up to 5 times)."}
              </p>
            </div>
            {inapp && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Clicks on the page</label>
                <NumberInput
                  min={0}
                  max={VISIT_MAX_CLICKS}
                  value={value.clicks}
                  onChange={(e) =>
                    set({ clicks: Math.max(0, Math.min(VISIT_MAX_CLICKS, parseInt(e.target.value) || 0)) })
                  }
                  className={inp}
                />
                <p className="mt-1 text-xs text-gray-500">0 = off. Up to {VISIT_MAX_CLICKS}.</p>
              </div>
            )}
          </div>

          {inapp && (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">The member sees</p>
                <ul className="mt-2 space-y-1.5">
                  {visitChecklist(value).map((item) => (
                    <li key={item.key} className="flex items-center gap-2 text-sm text-gray-200">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600" />
                      {item.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500">
                  Each step gets a tick; when all are ticked the visit is done
                  {value.autoApprove ? " and paid automatically" : " and goes to review"}. Scroll and clicks are reported
                  by the viewer (another site can&apos;t be checked from ours); the time is measured on our server.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-gray-300">
                <p className="inline-flex items-center gap-2 font-semibold text-white">
                  <AlertTriangle className="h-4 w-4 text-amber-400" /> Not every link can be shown inside RevType
                </p>
                <p className="mt-1">
                  Some sites refuse to be shown inside another site; then the member gets an &ldquo;open in new tab&rdquo;
                  fallback and the visit goes to review. Many ad networks (Adsterra, AdSense…) forbid framing their links
                  or paying people to visit them — only use this for links whose owner allows it.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void testLink()}
                    disabled={probe.state === "loading" || !value.url}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {probe.state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AppWindow className="h-3.5 w-3.5" />}
                    Test this link
                  </button>
                  {probe.state === "done" &&
                    (probe.ok ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Embeddable
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-300">
                        <XCircle className="h-3.5 w-3.5" /> Blocked
                      </span>
                    ))}
                </div>
                {probe.state === "done" && (
                  <p className={`mt-1 ${probe.ok ? "text-gray-400" : "text-red-300"}`}>
                    {probe.ok
                      ? "The page allows being shown inside another site. A pass isn't a guarantee — the fallback still covers it."
                      : (probe.reason ?? "This page can't be shown inside RevType.")}
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Traffic source</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {sources.map((src) => (
                <button
                  key={src.key}
                  type="button"
                  onClick={() => set({ source: src.key, ...(src.key !== "direct" ? { viewer: "tab" as const } : {}) })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    value.source === src.key ? "border-red-500 bg-red-500/10 text-white" : "border-gray-700 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <src.icon className="h-4 w-4" /> {src.label}
                  </span>
                </button>
              ))}
            </div>
            {value.source === "social" && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-400 mb-2">Social post URL</label>
                <input
                  value={value.socialPostUrl}
                  onChange={(e) => set({ socialPostUrl: e.target.value })}
                  placeholder="https://facebook.com/…/posts/…"
                  className={inp}
                />
                <p className="mt-1 text-xs text-gray-500">
                  A public post of yours with the link above in it. The member opens your post and taps the link in it,
                  so the site sees real social traffic. The stay time starts when the post opens.
                </p>
              </div>
            )}
            {value.source === "search" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Search keyword</label>
                  <input
                    value={value.searchKeyword}
                    onChange={(e) => set({ searchKeyword: e.target.value })}
                    placeholder="best budget headphones"
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Search engine</label>
                  <select
                    value={value.searchEngine}
                    onChange={(e) => set({ searchEngine: e.target.value === "bing" ? "bing" : "google" })}
                    className={inp}
                  >
                    <option value="google">Google</option>
                    <option value="bing">Bing</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 sm:col-span-2">
                  The member gets the real results for this keyword and picks your site
                  {targetHost ? ` (${targetHost})` : ""}. Use a keyword your site actually ranks for — if it isn&apos;t
                  in the results, they can&apos;t finish.
                </p>
              </div>
            )}
          </div>

          <details className="rounded-lg border border-gray-800 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-300">
              <span className="inline-flex items-center gap-2">
                <Tag className="h-4 w-4" /> Tracking tags (optional)
              </span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {utmFields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-400 mb-1">{f.label}</label>
                  <input value={value[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} placeholder={f.placeholder} className={inp} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {value.source === "direct"
                ? "Added to your link when the member opens it. Tags the link already has are kept."
                : "Social and search visits reach your site through the post or the results, so put these tags in the link itself."}
            </p>
          </details>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-gray-300">
            <p className="font-semibold text-white">Set your short link&apos;s destination to:</p>
            {destination ? (
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-gray-800 px-2 py-1 text-sky-300">{destination}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(destination);
                    toast.success("Copied");
                  }}
                  className="rounded-lg border border-gray-700 p-1.5 text-gray-300 hover:bg-gray-800"
                  aria-label="Copy"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a href={destination} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-700 p-1.5 text-gray-300 hover:bg-gray-800" aria-label="Open">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <p className="mt-1 text-amber-300">Save the task (as a draft is fine) — the address appears here.</p>
            )}
            <p className="mt-2 text-gray-400">
              Make a short link on your shortener pointing to that address, then paste the short link above. Users who
              finish the shortener land there, see their own code, and enter it here to get paid.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Fastest real pass (seconds)</label>
              <NumberInput
                min={0}
                max={600}
                value={value.minSeconds}
                onChange={(e) => set({ minSeconds: Math.max(0, Math.min(600, parseInt(e.target.value) || 0)) })}
                className={inp}
              />
              <p className="mt-1 text-xs text-gray-500">Arriving faster than this (a bypass tool) shows no code.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Shortener domains (optional)</label>
              <input
                value={value.shortenerHosts.join(", ")}
                onChange={(e) => set({ shortenerHosts: e.target.value.split(/[\s,]+/).filter(Boolean) })}
                placeholder="ouo.io, ouo.press"
                className={inp}
              />
              <p className="mt-1 text-xs text-gray-500">Where users must arrive from. Empty = the short link&apos;s own domain.</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">If we can&apos;t see they came through the shortener</label>
            <select
              value={value.onUnknownSource}
              onChange={(e) => set({ onUnknownSource: e.target.value === "block" ? "block" : "review" })}
              className={inp}
            >
              <option value="review">Show the code, but check the claim before paying</option>
              <option value="block">Show no code</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Some shorteners and in-app browsers hide where a visitor came from, so &ldquo;check before paying&rdquo; is the safer choice.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">If the link ends in a browser that isn&apos;t signed in</label>
            <select
              value={value.signedOutCode}
              onChange={(e) =>
                set({ signedOutCode: e.target.value === "off" ? "off" : e.target.value === "auto" ? "auto" : "review" })
              }
              className={inp}
            >
              <option value="review">Show a one-time code, check the claim before paying</option>
              <option value="auto">Show a one-time code, pay like a signed-in visit</option>
              <option value="off">Show no code — ask them to sign in</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              The app often opens links in the phone&apos;s other browser. A one-time code works once, for 30 minutes,
              and only if it was made after that person opened the link from the task.
            </p>
          </div>
        </div>
      )}

      <label className="flex items-start gap-3 rounded-lg border border-gray-800 p-3">
        <input
          type="checkbox"
          checked={value.autoApprove}
          onChange={(e) => set({ autoApprove: e.target.checked })}
          className="mt-0.5 h-5 w-5 rounded border-gray-700 bg-gray-800"
        />
        <span className="text-sm">
          <span className="block text-white">Pay automatically when every check passes</span>
          <span className="block text-xs text-gray-500">Doubtful claims are always held for review.</span>
        </span>
      </label>

      <div className={`rounded-xl border p-3 ${value.incentiveAllowed ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/10"}`}>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <AlertTriangle className="h-4 w-4 text-amber-400" /> Paid traffic rules
        </p>
        <p className="mt-1 text-xs text-gray-300">
          Paying users to open a link is &ldquo;incentivised traffic&rdquo;. Many ad networks and shorteners forbid it —
          Adsterra and Google AdSense do — and can ban the account and keep its earnings. Only use links from networks
          that allow it.
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-200">
          <input type="checkbox" checked={value.incentiveAllowed} onChange={(e) => set({ incentiveAllowed: e.target.checked })} />
          I checked: this link&apos;s network / shortener allows paid (incentivised) traffic.
        </label>
      </div>
    </div>
  );
}
