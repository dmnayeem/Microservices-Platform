"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  PACKAGE_LABEL,
  type OrderTier,
  type ServicePackage,
  type ServiceRequirement,
} from "@/lib/service-packages";

const inputCls =
  "w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)";

function days(n: number) {
  return `${n} day${n === 1 ? "" : "s"}`;
}

/** Basic / Standard / Premium tabs with the selected package's terms. */
export function ServicePackagePicker({
  packages,
  selectedId,
  onSelect,
}: {
  packages: ServicePackage[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const sel = packages.find((p) => p.id === selectedId) ?? packages[0];
  if (!sel) return null;
  return (
    <div className="space-y-2 pt-1">
      {packages.length > 1 && (
        <div className="grid gap-1 rounded-lg bg-(--app-page) p-1" style={{ gridTemplateColumns: `repeat(${packages.length}, minmax(0, 1fr))` }}>
          {packages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-bold transition-colors",
                p.id === sel.id
                  ? "bg-(--app-cta) text-(--app-on-cta)"
                  : "text-(--app-ink-2) hover:bg-(--app-surface-hover)"
              )}
            >
              {PACKAGE_LABEL[p.id]}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-(--app-line) p-3 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-white min-w-0 truncate">{sel.name}</p>
          <p className="text-lg font-extrabold text-white tabular-nums">{usd(sel.price)}</p>
        </div>
        {sel.description && <p className="text-xs text-(--app-ink-2) whitespace-pre-wrap">{sel.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-(--app-ink-2)">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> {days(sel.deliveryDays)} delivery
          </span>
          <span className="inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            {sel.revisions === 0 ? "No revisions" : `${sel.revisions} revision${sel.revisions === 1 ? "" : "s"}`}
          </span>
        </div>
        {sel.items.length > 0 && (
          <ul className="space-y-0.5 pt-1">
            {sel.items.map((it, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-(--app-ink-2)">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-px" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The order step: the seller's questions, then pay into escrow. The money is
 * held until the buyer accepts the delivery (or it auto-releases).
 */
export function ServiceOrderSheet({
  open,
  onOpenChange,
  listingId,
  tier,
  requirements,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  tier: OrderTier;
  requirements: ServiceRequirement[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    for (const q of requirements) {
      if (q.required && !answers[q.id]?.trim()) return toast.error(`Please answer: "${q.label}"`);
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/marketplace/${listingId}/order`, {
        method: "POST",
        // A fresh key per attempt: 4xx answers are replayed for a reused key,
        // so a buyer who tops up or fixes an answer must not get the old error.
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ tier: tier.id === "single" ? null : tier.id, answers }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) {
          toast.error("Not enough in your wallet", {
            description: d.error ?? "Top up and try again.",
            action: { label: "Top up", onClick: () => router.push("/wallet") },
          });
          return;
        }
        if (d.applyHref) {
          toast.error("Escrow orders are locked", {
            description: d.error,
            action: { label: "Apply", onClick: () => router.push(d.applyHref) },
          });
          return;
        }
        if (res.status === 409 && d.threadId) {
          toast.error("Order already open", {
            description: d.error,
            action: { label: "Open", onClick: () => router.push(`/marketplace/messages/${d.threadId}`) },
          });
          return;
        }
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      toast.success("Order placed 🎉", { description: "Payment is held in escrow until you accept the delivery." });
      router.push(`/marketplace/messages/${d.threadId}`);
    } catch (err) {
      toast.error("Order failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Order · ${tier.name}`}
      description={`${usd(tier.price)}${tier.deliveryDays ? ` · ${days(tier.deliveryDays)} delivery` : ""} · ${
        tier.revisions === 0 ? "no revisions" : `${tier.revisions} revision${tier.revisions === 1 ? "" : "s"}`
      }`}
      footer={
        <button
          onClick={submit}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) hover:opacity-90 text-white text-sm font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Pay {usd(tier.price)} into escrow
        </button>
      }
    >
      <div className="space-y-3 px-5 py-4 overflow-y-auto max-h-[60vh]">
        {requirements.length === 0 ? (
          <p className="text-sm text-(--app-ink-2)">
            The seller needs nothing else to start. You can share details in the order conversation.
          </p>
        ) : (
          <>
            <p className="text-xs text-(--app-ink-3)">The seller needs this to start your order.</p>
            {requirements.map((q) => (
              <div key={q.id}>
                <label className="block text-xs font-medium text-(--app-ink-2) mb-1.5">
                  {q.label}
                  {q.required && <span className="text-rose-400"> *</span>}
                </label>
                {q.type === "textarea" ? (
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className={cn(inputCls, "resize-none")}
                  />
                ) : (
                  <input
                    type={q.type === "text" ? "text" : "url"}
                    maxLength={1000}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder={q.type === "file" ? "Link to the file (Google Drive, Dropbox…)" : q.type === "url" ? "https://" : ""}
                    className={inputCls}
                  />
                )}
              </div>
            ))}
          </>
        )}
        <p className="text-[11px] text-(--app-ink-3) inline-flex items-start gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-px" />
          {usd(tier.price)} is taken from your wallet and held in escrow. The seller is paid only after
          you accept the delivery (or it auto-releases a few days after delivery). Problems? Escalate to an admin.
        </p>
      </div>
    </BottomSheet>
  );
}
