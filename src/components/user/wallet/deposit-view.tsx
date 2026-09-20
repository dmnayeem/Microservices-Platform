"use client";
import { usd } from "@/lib/utils";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Wallet, ExternalLink, Copy, Check, Megaphone } from "lucide-react";
import { toast } from "@/lib/toast";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { BrandIcon } from "@/components/ui/brand-icon";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import type { DepositMethod } from "@/lib/deposit-methods";
import type { Currency } from "@/lib/currencies";
import {
  computeDepositBreakdown,
  formatLocal,
  effectiveChargePct,
} from "@/lib/deposit-pricing";
import { runInterstitial } from "@/lib/reward-interstitial";

interface Deposit {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
};

export function DepositView({ from }: { from?: string } = {}) {
  const fromAds = from === "ads";
  const [amount, setAmount] = useState("");
  const [methods, setMethods] = useState<DepositMethod[]>([]);
  const [method, setMethod] = useState<string>("");
  const [txnId, setTxnId] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [gateways, setGateways] = useState<{ key: string; label: string }[]>([]);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [vat, setVat] = useState<{ enabled: boolean; pct: number }>({
    enabled: false,
    pct: 0,
  });

  const load = () => {
    fetch("/api/deposits")
      .then((r) => r.json())
      .then((d) => setDeposits(d.deposits ?? []))
      .catch(() => setDeposits([]));
  };
  useEffect(() => {
    load();
    fetch("/api/deposits/methods")
      .then((r) => r.json())
      .then((d) => {
        const list: DepositMethod[] = d.methods ?? [];
        setMethods(list);
        setMethod((cur) => cur || list[0]?.key || "");
        setCurrency((d.currency as Currency | null) ?? null);
        if (d.vat) setVat({ enabled: !!d.vat.enabled, pct: Number(d.vat.pct) || 0 });
      })
      .catch(() => setMethods([]));
    fetch("/api/deposits/gateway/providers")
      .then((r) => r.json())
      .then((d) => setGateways(d.providers ?? []))
      .catch(() => setGateways([]));
  }, []);

  const selected = methods.find((m) => m.key === method) ?? null;
  const chargePct = selected ? effectiveChargePct(selected) : 0;
  const breakdown = computeDepositBreakdown({
    amountUsd: Number(amount) || 0,
    currency,
    chargePct,
    feeFlatUsd: selected?.feeFlatUsd ?? 0,
    vatEnabled: vat.enabled,
    vatPct: vat.pct,
  });
  const hasLocal = !!currency && breakdown.amountUsd > 0;
  // Copy any of the values the user has to reproduce exactly. A wallet address
  // is far too long to retype and a mistyped one loses the money, so the copy
  // button is the primary control here rather than a convenience — and the
  // memo has the same property.
  const copy = async (value: string, field: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      /* clipboard blocked (insecure context / denied) — the text stays selectable */
    }
  };
  const copyAccount = () => copy(selected?.account ?? "", "account");

  const submitManual = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!method) {
      toast.error("Pick a payment method");
      return;
    }
    if (!txnId.trim()) {
      toast.error("Enter the transaction ID from your payment");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount: amt, method, txnId, proofUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await runInterstitial();
      toast.success("Deposit submitted — awaiting approval");
      setAmount("");
      setTxnId("");
      setProofUrl("");
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const payOnline = async (provider?: string) => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/deposits/gateway/init", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount: amt, provider }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.redirectUrl) throw new Error(d.error ?? "Gateway unavailable");
      window.location.href = d.redirectUrl;
    } catch (err) {
      toast.error("Online payment unavailable", {
        description: err instanceof Error ? err.message : "Use a manual method",
      });
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-(--app-accent-edge)";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-(--app-accent-ink)" />
          Add Funds
        </h1>
        <p className="text-sm text-(--app-ink-3) mt-1">
          Top up your balance manually (admin-verified) or via online gateway.
        </p>
      </div>

      {fromAds && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 grid place-items-center text-sky-300 shrink-0">
            <Megaphone className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Funding your ad credit</p>
            <p className="text-xs text-(--app-ink-3) mt-0.5">
              This adds money to your wallet first. Once an admin approves it, head back to{" "}
              <Link href="/advertiser" className="text-sky-300 font-semibold hover:underline">
                Run Ads → Top up
              </Link>{" "}
              to convert wallet cash into ad credit.
            </p>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-(--app-ink-3) mb-1.5">
            Amount (USD)
          </label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            className={inputCls}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[5, 10, 25, 50, 100].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                  Number(amount) === a
                    ? "border-(--app-accent-edge) bg-(--app-cta)/15 text-(--app-on-cta)"
                    : "border-(--app-line) bg-(--app-surface-2) text-(--app-ink-2) hover:border-(--app-line)"
                }`}
              >
                ${a}
                {currency && (
                  <span className="text-(--app-ink-3) font-normal">
                    {" "}
                    · {formatLocal(a * currency.usdRate, currency)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Live local-currency + charge + VAT breakdown */}
        {hasLocal && (
          <div className="rounded-xl border border-(--app-accent-edge)/30 bg-(--app-cta)/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-(--app-ink-2)">
                You add{" "}
                <span className="font-bold text-white">
                  {usd(breakdown.amountUsd)}
                </span>
              </span>
              <span className="text-(--app-ink-2) tabular-nums">
                ≈ {formatLocal(breakdown.localBase, currency)}
              </span>
            </div>
            {breakdown.charge > 0 && (
              <div className="flex items-center justify-between text-xs">
                {/* Name the charge that actually applies. A flat network fee
                  * with no percentage would otherwise read "charge (0%)" while
                  * a real amount was added on the right, which looks like a
                  * bug and invites a support ticket every time. */}
                <span className="text-(--app-ink-3)">
                  {selected?.label} charge
                  {chargePct > 0 && ` (${chargePct}%)`}
                  {(selected?.feeFlatUsd ?? 0) > 0 &&
                    ` ${chargePct > 0 ? "+" : ""} $${selected?.feeFlatUsd} network fee`}
                  {chargePct > 0 && (
                    <span className="block text-[10px] text-(--app-ink-3)">
                      {currency?.symbol ?? ""}{(chargePct * 10).toFixed(1)} per{" "}
                      {currency?.symbol ?? ""}1,000
                    </span>
                  )}
                </span>
                <span className="text-orange-300 tabular-nums">
                  + {formatLocal(breakdown.charge, currency)}
                </span>
              </div>
            )}
            {selected && chargePct === 0 && selected.chargeType === "cashout" && (
              <p className="text-[11px] text-emerald-400">
                Cash out — no extra charge
              </p>
            )}
            {breakdown.vat > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-(--app-ink-3)">VAT ({vat.pct}%)</span>
                <span className="text-orange-300 tabular-nums">
                  + {formatLocal(breakdown.vat, currency)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-(--app-accent-edge)/20 pt-2 text-sm">
              <span className="font-semibold text-white">Total to pay</span>
              <span className="font-bold text-(--app-accent-ink) tabular-nums">
                {formatLocal(breakdown.totalLocal, currency)}
              </span>
            </div>
            <p className="text-[10px] text-(--app-ink-3)">
              Your wallet is credited {usd(breakdown.amountUsd)} on
              approval. The {currency?.code} total includes the method charge
              {vat.enabled ? " + VAT" : ""}.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-(--app-ink-3) mb-1.5">
            Payment method
          </label>
          {methods.length === 0 ? (
            <p className="rounded-lg border border-(--app-line) bg-(--app-surface)/50 p-3 text-xs text-(--app-ink-3)">
              No payment methods are available right now. Please check back soon or contact support.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {methods.map((m) => {
                // The charge is shown on the card itself, before an amount is
                // typed. A fee a user only discovers at the last step reads as
                // a trick even when it was always going to be charged.
                const pct = effectiveChargePct(m);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMethod(m.key)}
                    className={`p-2.5 rounded-lg border text-sm font-semibold flex flex-col items-center justify-center gap-0.5 ${
                      method === m.key
                        ? "border-(--app-accent-edge) bg-(--app-cta)/10 text-(--app-on-cta)"
                        : "border-(--app-line) bg-(--app-surface-2) text-(--app-ink-2)"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 max-w-full">
                      <BrandIcon brand={m.key} colored className="w-4 h-4 shrink-0" />
                      <span className="truncate min-w-0">{m.label}</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        pct > 0 ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      {pct > 0 ? `+${pct}% fee` : "No fee"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {methods.length > 0 && (
            <p className="mt-2 text-[11px] text-(--app-ink-3)">
              The fee shown is charged on top of what you add — your wallet is
              credited the full USD amount.
              {vat.enabled && vat.pct > 0
                ? ` VAT of ${vat.pct}% is added as well.`
                : ""}
            </p>
          )}
        </div>

        {selected && (
          <div className="rounded-lg border border-(--app-accent-edge)/30 bg-(--app-cta)/5 p-3 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-(--app-accent-ink) font-bold">
              Send payment to {selected.label}
            </p>

            <div>
              <p className="text-[11px] text-(--app-ink-3) mb-1">
                {selected.accountLabel || "Receiving account"}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-(--app-ink) break-all bg-(--app-surface)/60 rounded px-2 py-1.5">
                  {selected.account}
                </code>
                <button
                  type="button"
                  onClick={copyAccount}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-(--app-cta)/15 text-(--app-accent-ink) text-xs font-bold hover:bg-(--app-cta)/25"
                >
                  {copiedField === "account" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedField === "account" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* The network, before anything else about the transfer.
              *
              * On-chain this is the costliest field on the page: USDT sent on
              * BEP20 to a TRC20 address is gone, and nothing on our side can
              * bring it back. It gets its own line, in warning colours, rather
              * than a clause inside the instructions paragraph. */}
            {selected.network && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                <p className="text-[11px] text-amber-300/80 mb-0.5">Network</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-bold text-amber-100 break-all">
                    {selected.network}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(selected.network ?? "", "network")}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 text-amber-100 text-[11px] font-bold hover:bg-amber-500/30"
                  >
                    {copiedField === "network" ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-amber-200/70 mt-1">
                  Send on this network only. A transfer on any other network
                  cannot be recovered.
                </p>
              </div>
            )}

            {/* A memo is as mandatory as the address on the exchanges that use
              * one — the transfer arrives unattributed without it. */}
            {selected.memo && (
              <div>
                <p className="text-[11px] text-(--app-ink-3) mb-1">Memo / Tag (required)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm text-(--app-ink) break-all bg-(--app-surface)/60 rounded px-2 py-1.5">
                    {selected.memo}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(selected.memo ?? "", "memo")}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-(--app-cta)/15 text-(--app-accent-ink) text-xs font-bold hover:bg-(--app-cta)/25"
                  >
                    {copiedField === "memo" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedField === "memo" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {/* An uploaded QR wins when the admin supplied one — some methods'
              * codes carry more than the bare account. Otherwise it is drawn
              * from the account itself, which cannot fall out of step with it. */}
            {(selected.qrUrl || (selected.autoQr && selected.account)) && (
              <div className="flex flex-col items-center gap-1.5 py-1">
                <div className="rounded-xl bg-white p-2">
                  {selected.qrUrl ? (
                    <SmartImage
                      src={selected.qrUrl}
                      alt={`${selected.label} payment QR`}
                      width={176}
                      height={176}
                      className="h-44 w-44 object-contain"
                    />
                  ) : (
                    // Plain <img>: the source is our own PNG route, and the
                    // optimizer has nothing to add to a 320px QR.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/deposits/qr?method=${encodeURIComponent(selected.key)}`}
                      alt={`${selected.label} payment QR`}
                      width={176}
                      height={176}
                      className="h-44 w-44 object-contain"
                    />
                  )}
                </div>
                <p className="text-[10px] text-(--app-ink-3)">
                  Scan to pay{selected.network ? ` — ${selected.network} only` : ""}
                </p>
              </div>
            )}

            {selected.payLink && (
              <a
                href={selected.payLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-(--app-cta)/15 text-(--app-accent-ink) text-xs font-bold px-3 py-2 hover:bg-(--app-cta)/25"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open payment link
              </a>
            )}

            {selected.instructions && (
              <p className="text-xs text-(--app-ink-2) whitespace-pre-wrap">{selected.instructions}</p>
            )}
            <p className="text-[10px] text-(--app-ink-3)">
              Limits: ${selected.minAmount} – ${selected.maxAmount}. After paying, enter your transaction id below.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-(--app-ink-3) mb-1.5">
            Transaction ID <span className="text-red-400">*</span>
          </label>
          <input
            value={txnId}
            onChange={(e) => setTxnId(e.target.value)}
            placeholder="e.g. TXN123456"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-(--app-ink-3) mb-1.5">
            Payment screenshot (optional)
          </label>
          <ProofImageUpload value={proofUrl} onChange={setProofUrl} />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={submitManual}
            disabled={busy}
            className="flex-1 min-w-35 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-bold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit manual deposit
          </button>
          {gateways.length === 0 ? (
            <button
              onClick={() => payOnline()}
              disabled={busy}
              className="flex-1 min-w-35 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4" />
              Pay online
            </button>
          ) : (
            gateways.map((g) => (
              <button
                key={g.key}
                onClick={() => payOnline(g.key)}
                disabled={busy}
                className="flex-1 min-w-35 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
              >
                <ExternalLink className="w-4 h-4" />
                {g.label}
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-(--app-ink-3) mb-2">Recent deposits</h2>
        <div className="space-y-2">
          {deposits.length === 0 && (
            <p className="text-sm text-(--app-ink-3)">No deposits yet.</p>
          )}
          {deposits.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-(--app-line) bg-(--app-surface) p-3"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  {usd(Number(d.amount ?? 0))}{" "}
                  <span className="text-(--app-ink-3) font-normal">
                    · {methods.find((m) => m.key === d.method)?.label ?? d.method.replace("MANUAL_", "")}
                  </span>
                </p>
                <p className="text-[11px] text-(--app-ink-3)">
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  STATUS_TONE[d.status] ?? "bg-(--app-surface-2) text-(--app-ink-2)"
                }`}
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
