"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmModal } from "@/components/admin/ui/confirm-modal";
import { card, errorOf, inp } from "./cpa-shared";

interface PostbackInfo {
  secret: string;
  endpoint: string;
  keyUrlTemplate: string;
  signedUrlTemplate: string;
}

export function CpaPostbackTab() {
  const [info, setInfo] = useState<PostbackInfo | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    fetch("/api/admin/cpa/postback", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await errorOf(r));
        return r.json();
      })
      .then((j: PostbackInfo) => setInfo(j))
      .catch((e: unknown) => toast.error("Couldn't load postback settings", { description: e instanceof Error ? e.message : undefined }));
  }, []);

  const rotate = async () => {
    const res = await fetch("/api/admin/cpa/postback", { method: "POST" });
    if (!res.ok) {
      toast.error("Rotate failed", { description: await errorOf(res) });
      return;
    }
    setInfo((await res.json()) as PostbackInfo);
    setConfirm(false);
    toast.success("Secret rotated", { description: "Update the postback URL in every network dashboard now." });
  };

  if (!info) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 space-y-2 text-sm text-slate-300`}>
        <p>
          A postback is the network calling this site when a user completes an offer. It matches the conversion by the{" "}
          <code className="text-emerald-300">click</code> id — the <code className="text-emerald-300">{"{clickId}"}</code> you put in the
          offer&apos;s tracking link. Each <code>txid</code> is only ever paid once.
        </p>
        <p>
          In the network dashboard, paste one of the URLs below and replace each <code>{"{…}"}</code> with <b>that network&apos;s own macro</b>{" "}
          (e.g. CPAGrip <code>{"{tracking_id}"}</code>, OGAds <code>{"{aff_sub4}"}</code>, CPALead <code>{"{subid}"}</code>).
          A <code>status</code> of a reversal/chargeback reverses an approved conversion.
        </p>
        <p>
          <b className="text-white">Manual approval and the postback work together on the same offer.</b> Whichever comes first,
          the conversion is paid once: proof first → the postback marks it <i>verified</i> (and approves it only if the offer is in
          Postback mode with auto-approve on); postback first → the user&apos;s proof is attached to it; approved by an admin first →
          a later postback only marks it verified, never pays again. A duplicate <code>txid</code> is ignored.
        </p>
      </div>

      <RetrySettingCard />

      <UrlCard
        icon={<KeyRound className="w-4 h-4 text-amber-400" />}
        title="Fixed-key URL (key=)"
        note="Works with every network, because the URL is fixed. It is weaker: anyone who sees the URL (network staff, a leaked log) can fake conversions until you rotate the secret. Use it when the network cannot compute a signature — most can't."
        value={info.keyUrlTemplate}
      />
      <UrlCard
        icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
        title="Signed URL (sig=)"
        note={`Stronger: the network signs each call with HMAC-SHA256(secret, "click:txid:payout:status") in hex (status exactly as sent; the older "click:txid:payout" form still works for approvals but not reversals), so the secret never travels in the URL. Use it when the network supports custom signing.`}
        value={info.signedUrlTemplate}
      />
      <UrlCard title="Secret" note="Used by both methods. Keep it private." value={info.secret} />

      <div className={`${card} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
        <p className="text-sm text-slate-400 flex-1">
          Rotating makes a new secret. <b className="text-amber-300">Every postback URL already set in a network stops working</b> until you paste the new one.
        </p>
        <button onClick={() => setConfirm(true)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold">
          <RefreshCw className="w-4 h-4" /> Rotate secret
        </button>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={rotate}
        title="Rotate the postback secret?"
        description="All postback URLs configured in your networks will be rejected until you update them with the new secret."
        confirmLabel="Rotate"
        tone="warning"
      />
    </div>
  );
}

function UrlCard({
  icon,
  title,
  note,
  value,
}: {
  icon?: ReactNode;
  title: string;
  note: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — select the text instead");
    }
  };
  return (
    <div className={`${card} p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-white flex-1">{title}</h3>
        <button onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className={`rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 break-all select-all font-mono`}>{value}</p>
      <p className="text-[11px] text-slate-500">{note}</p>
    </div>
  );
}

/**
 * `cpa.retry_after_hours` — how long after a rejection the user may try the
 * same offer again (the rejected row is reused; approved, held and reversed
 * conversions are final). Saved through /api/admin/cpa/settings (audited).
 */
function RetrySettingCard() {
  const [hours, setHours] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/cpa/settings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await errorOf(r));
        return r.json();
      })
      .then((j: { retryAfterHours: number }) => {
        setHours(j.retryAfterHours);
        setSaved(j.retryAfterHours);
      })
      .catch((e: unknown) => toast.error("Couldn't load CPA rules", { description: e instanceof Error ? e.message : undefined }));
  }, []);

  const valid = hours != null && Number.isInteger(hours) && hours >= 0 && hours <= 720;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cpa/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryAfterHours: hours }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      const j = (await res.json()) as { retryAfterHours: number };
      setSaved(j.retryAfterHours);
      toast.success("Saved", { description: `Rejected users can retry after ${j.retryAfterHours}h.` });
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-white flex-1">Retry after a rejection</h3>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <label className="block">
          <span className="block text-xs text-slate-400 mb-1">Hours before a rejected user may try again (0–720)</span>
          <input
            type="number"
            min={0}
            max={720}
            step={1}
            value={hours ?? ""}
            disabled={hours == null}
            onChange={(e) => setHours(e.target.value === "" ? null : Number(e.target.value))}
            className={`${inp} w-40 tabular-nums ${valid || hours == null ? "" : "border-red-500"}`}
          />
        </label>
        <button
          onClick={save}
          disabled={busy || !valid || hours === saved}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Counted from the rejection. The user presses Start again, and their new proof goes back into the Review queue as a new
        attempt (the earlier one is kept in its history). Approved, held and reversed conversions can never be retried. Setting{" "}
        <code>cpa.retry_after_hours</code>, default 24.
      </p>
    </div>
  );
}
