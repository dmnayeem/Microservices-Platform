"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Copy, Check } from "lucide-react";
import { toast } from "@/lib/toast";

export default function TwoFactorSetupPage() {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/2fa/setup", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setQrUrl(d.qrUrl);
          setSecret(d.secret);
          setEnabled(d.enabled ?? false);
        }
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
      const res = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("2FA enabled");
      setEnabled(true);
    } catch (err) {
      toast.error("Invalid code", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          🛡️ Two-Factor Authentication
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Add an extra layer of security to your account.
        </p>
      </div>

      {enabled && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-300">2FA Enabled</p>
            <p className="text-xs text-emerald-400/80">
              Your account is protected.
            </p>
          </div>
        </div>
      )}

      {!enabled && (
        <>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
            <p className="text-xs text-gray-400 mb-3">
              1. Scan this QR code with Google Authenticator, Authy, or any TOTP
              app.
            </p>
            {qrUrl ? (
              <div className="bg-white p-3 rounded-lg inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="2FA QR code" className="w-44 h-44" />
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
              </div>
            )}
            {secret && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                  Or enter manually
                </p>
                <button
                  onClick={copySecret}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-mono hover:bg-gray-700"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {secret.match(/.{1,4}/g)?.join("-") ?? secret}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                2. Enter the 6-digit code from your app
              </label>
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full px-3 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white text-2xl font-bold text-center tracking-widest tabular-nums focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              disabled={busy || code.length !== 6}
              onClick={verify}
              className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Enable 2FA
            </button>
          </div>
        </>
      )}
    </div>
  );
}
