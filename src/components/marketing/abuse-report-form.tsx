"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";

const inp =
  "w-full rounded-xl mk-card px-4 py-3 text-(--mk-text) placeholder:text-(--app-ink-3) text-sm focus:outline-none focus:border-blue-500/40";

const TYPES: Array<[string, string]> = [
  ["copyright", "Copyright infringement"],
  ["malware", "Malware / infected file"],
  ["phishing", "Phishing / scam page"],
  ["spam", "Spam"],
  ["fraud", "Fraud"],
  ["illegal", "Illegal content"],
  ["other", "Something else"],
];

/** Public report form for /abuse — posts to /api/abuse/report. */
export function AbuseReportForm() {
  const [f, setF] = useState({
    type: "copyright",
    name: "",
    email: "",
    organization: "",
    providerRef: "",
    urls: "",
    description: "",
    originalWork: "",
    signature: "",
    website: "",
  });
  const [goodFaith, setGoodFaith] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const copyright = f.type === "copyright";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/abuse/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          organization: f.organization || undefined,
          providerRef: f.providerRef || undefined,
          originalWork: copyright ? f.originalWork : undefined,
          signature: copyright ? f.signature : undefined,
          goodFaith: copyright ? goodFaith : undefined,
          accurate: copyright ? accurate : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setRef(d.reference ?? "received");
    } catch (err) {
      toast.error("Couldn't send the report", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  if (ref) {
    return (
      <div className="mk-card rounded-2xl p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <p className="mt-3 text-lg font-bold text-(--mk-text)">Report received</p>
        <p className="mt-1 text-sm text-(--mk-muted)">
          Reference <span className="font-mono">{ref}</span>. We will reply to the email you gave.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mk-card space-y-3 rounded-2xl p-5">
      <select className={inp} value={f.type} onChange={(e) => set("type", e.target.value)} aria-label="Type of report">
        {TYPES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={inp} required maxLength={120} placeholder="Your name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <input className={inp} required type="email" maxLength={200} placeholder="Your email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        <input className={inp} maxLength={160} placeholder="Organisation (host, network, rights holder)" value={f.organization} onChange={(e) => set("organization", e.target.value)} />
        <input className={inp} maxLength={200} placeholder="Your ticket / reference (optional)" value={f.providerRef} onChange={(e) => set("providerRef", e.target.value)} />
      </div>
      <textarea className={inp} required rows={3} minLength={4} maxLength={4000} placeholder="URL(s) on our site, one per line" value={f.urls} onChange={(e) => set("urls", e.target.value)} />
      <textarea className={inp} required rows={4} minLength={10} maxLength={5000} placeholder="What is wrong?" value={f.description} onChange={(e) => set("description", e.target.value)} />
      {copyright && (
        <>
          <textarea className={inp} required rows={2} maxLength={2000} placeholder="The original copyrighted work (title, link or description)" value={f.originalWork} onChange={(e) => set("originalWork", e.target.value)} />
          <label className="flex items-start gap-2 text-xs text-(--mk-muted)">
            <input type="checkbox" required checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} className="mt-0.5" />
            I believe in good faith that the use of the material is not authorised by the copyright owner, its agent, or the law.
          </label>
          <label className="flex items-start gap-2 text-xs text-(--mk-muted)">
            <input type="checkbox" required checked={accurate} onChange={(e) => setAccurate(e.target.checked)} className="mt-0.5" />
            The information in this notice is accurate, and I am the owner or authorised to act on the owner&apos;s behalf.
          </label>
          <input className={inp} required maxLength={160} placeholder="Signature — type your full name" value={f.signature} onChange={(e) => set("signature", e.target.value)} />
        </>
      )}
      {/* Honeypot: hidden from people, filled by bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={f.website}
        onChange={(e) => set("website", e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send report
      </button>
    </form>
  );
}
