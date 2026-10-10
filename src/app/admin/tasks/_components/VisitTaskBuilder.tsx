"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, Copy, ExternalLink, Link2, Scissors } from "lucide-react";
import { toast } from "@/lib/toast";
import { VISIT_KIND_LABEL, visitDestinationPath, type VisitConfig, type VisitKind } from "@/lib/visit-tasks";

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
        <input value={value.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" className={inp} />
        <p className="mt-1 text-xs text-gray-500">Users never see this link before they press Open — it opens through our tracker.</p>
      </div>

      {value.kind === "DIRECT" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Stay time (seconds)</label>
            <input
              type="number"
              min={5}
              max={600}
              value={value.staySeconds}
              onChange={(e) => set({ staySeconds: Math.max(5, Math.min(600, parseInt(e.target.value) || 5)) })}
              className={inp}
            />
            <p className="mt-1 text-xs text-gray-500">
              Shown on the task. Coming back sooner pays nothing (they can open it again, up to 5 times).
            </p>
          </div>
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
              <input
                type="number"
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
