"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Copy, Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

interface SetupData {
  qrCodeDataUrl: string;
  secret: string;
}

export function TwoFactorSetup() {
  const [data, setData] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/security/2fa/setup", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.alreadyEnabled) setEnabled(true);
        else setData(d);
      })
      .catch(() => {});
  }, []);

  const verify = async () => {
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/security/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("2FA enabled!");
      setEnabled(true);
    } catch (err) {
      toast.error("Verification failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!(await confirmDialog({ title: "Disable 2FA?", description: "Your account will be less secure.", tone: "danger", confirmLabel: "Disable" }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/security/2fa/disable", {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("2FA disabled");
      setEnabled(false);
      window.location.reload();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (enabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Two-Factor Auth
        </h1>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
          <p className="text-base font-bold text-white">2FA is enabled</p>
          <p className="text-xs text-slate-400 mt-1">
            Your account is protected by an authenticator app.
          </p>
          <button
            disabled={busy}
            onClick={disable}
            className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold disabled:opacity-50"
          >
            Disable 2FA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">🔐 Two-Factor Auth</h1>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
        <p className="text-xs text-slate-400">
          Scan this QR code with Google Authenticator, Authy, or any TOTP app.
        </p>
        {data ? (
          <>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.qrCodeDataUrl}
                alt="QR"
                className="w-48 h-48 rounded-lg bg-white p-2"
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                Or enter manually
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white break-all">
                  {data.secret}
                </code>
                <button
                  onClick={copy}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Verification Code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-center text-2xl font-bold font-mono tracking-widest tabular-nums focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Enable 2FA
            </button>
          </>
        ) : (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
          </div>
        )}
      </div>
    </div>
  );
}
