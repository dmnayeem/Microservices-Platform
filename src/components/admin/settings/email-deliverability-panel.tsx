"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Copy } from "lucide-react";
import { toast } from "@/lib/toast";

type Status = "pass" | "warn" | "fail" | "unknown";
type Check = {
  id: string;
  label: string;
  status: Status;
  detail: string;
  fix?: { type: string; host: string; value: string; note?: string }[];
};
type Health = {
  from: string;
  replyTo: string;
  smtpHost: string;
  configured: boolean;
  enabled: boolean;
  domain: string;
  provider: { name: string; consumer: boolean };
  checks: Check[];
};

const ICON: Record<Status, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  fail: <XCircle className="w-4 h-4 text-rose-400" />,
  unknown: <HelpCircle className="w-4 h-4 text-slate-400" />,
};

/**
 * What recipients will see in the From line, and whether the From domain is
 * set up so mail lands in the inbox. Reads the SAVED settings — press Save
 * first after changing the boxes above.
 */
export function EmailDeliverabilityPanel() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings/email-health", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Check failed");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy")
    );
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Inbox or spam? — deliverability check</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-check
        </button>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {data && (
        <>
          <div className="grid gap-1 text-xs">
            <p className="text-slate-400">
              Recipients see (saved settings):{" "}
              <span className="font-mono text-white break-all">{data.from}</span>
            </p>
            <p className="text-slate-400">
              Replies go to: <span className="font-mono text-white break-all">{data.replyTo}</span>
            </p>
            {!data.configured && <p className="text-amber-300">SMTP host, username or password is missing — nothing can be sent yet.</p>}
            {!data.enabled && <p className="text-amber-300">Email notifications are switched off — only account emails go out.</p>}
          </div>

          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
            {data.checks.map((c) => (
              <li key={c.id} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{c.label}</p>
                    <p className="text-xs text-slate-400 break-words">{c.detail}</p>
                  </div>
                </div>
                {c.fix?.map((f, i) => (
                  <div key={i} className="ml-6 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs space-y-1">
                    <p className="text-slate-300">
                      Add a <span className="font-semibold text-white">{f.type}</span> record · Host/Name{" "}
                      <span className="font-mono text-white">{f.host}</span>
                    </p>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 font-mono text-[11px] text-emerald-200 break-all">{f.value}</code>
                      <button type="button" onClick={() => copy(f.value)} className="shrink-0 text-slate-400 hover:text-white" aria-label="Copy record">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {f.note && <p className="text-slate-500">{f.note}</p>}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">
            Records are added at your domain registrar / DNS host (for {data.domain || "your domain"}). Changes can take up to an hour to show here.
          </p>
        </>
      )}
    </div>
  );
}
