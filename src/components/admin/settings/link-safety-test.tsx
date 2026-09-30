"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { inp } from "@/components/admin/settings/keyed-settings";

interface TestResult {
  url: string;
  outcome: "allowed" | "flagged" | "blocked";
  reasons: string[];
  mode: string;
  safeBrowsing: "on" | "off";
  blockedDomains: number;
}

const TONE: Record<TestResult["outcome"], string> = {
  allowed: "text-emerald-400",
  flagged: "text-amber-400",
  blocked: "text-red-400",
};

const WORDS: Record<TestResult["outcome"], string> = {
  allowed: "Allowed — nothing found.",
  flagged: "Allowed, but sent to the Abuse Center for review.",
  blocked: "Refused — the user would see an error and the post would not be saved.",
};

/**
 * "Test a URL": what would happen if a user posted this link, under the
 * settings as last SAVED (unsaved changes on this form are not applied).
 */
export function LinkSafetyTest() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/settings/test-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data as TestResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-300">Test a URL</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="https://example.com/login"
          className={inp}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !url.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Test
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Uses the settings as last saved — press Save first if you just changed them.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs">
          <p className={`font-medium ${TONE[result.outcome]}`}>{WORDS[result.outcome]}</p>
          {result.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-slate-400">
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-slate-500 break-all">
            Checked {result.url} · policy {result.mode} · Safe Browsing {result.safeBrowsing} ·{" "}
            {result.blockedDomains} blocked domain{result.blockedDomains === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
