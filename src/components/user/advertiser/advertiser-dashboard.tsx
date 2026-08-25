"use client";
import { usd } from "@/lib/utils";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MousePointer2, Eye, Target, Loader2, Wallet } from "lucide-react";
import { StatCard } from "@/components/user/primitives/stat-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { toast } from "@/lib/toast";
import { promptDialog } from "@/lib/confirm";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { DateField } from "@/components/ui/date-field";
import { InvoicesCard } from "@/components/user/advertiser/invoices-card";

/** One ad-credit movement (purchase, admin grant, campaign funding, refund). */
interface LedgerEntry {
  id: string;
  delta: number;
  kind: string;
  balanceAfter: number | null;
  createdAt: string;
}

const LEDGER_LABEL: Record<string, string> = {
  PURCHASE: "Added funds",
  GRANT: "Admin adjustment",
  CAMPAIGN_FUND: "Campaign funded",
  REFUND: "Refund from campaign",
};

interface Campaign {
  id: string;
  title: string;
  status: "ACTIVE" | "PAUSED" | "ENDED" | "DRAFT";
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface Stats {
  campaigns: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export function AdvertiserDashboard() {
  const [stats, setStats] = useState<Stats>({
    campaigns: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(50);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [busy, setBusy] = useState(false);
  // Ad Credit wallet
  const [credit, setCredit] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyAmount, setBuyAmount] = useState(20);
  const [buyCurrency, setBuyCurrency] = useState<"cash" | "points">("cash");
  const [buyBusy, setBuyBusy] = useState(false);

  const loadCredit = async () => {
    try {
      const res = await fetch("/api/advertiser/credits");
      if (res.ok) {
        const d = await res.json();
        setCredit(d.adCreditBalance ?? 0);
        setLedger(d.ledger ?? []);
      }
    } catch {
      /* ignore */
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/advertiser/campaigns");
      const d = await res.json();
      setCampaigns(d.campaigns ?? []);
      setStats(d.stats ?? stats);
      await loadCredit();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const buyCredits = async () => {
    if (!Number.isFinite(buyAmount) || buyAmount < 5) {
      toast.error("Minimum is $5");
      return;
    }
    setBuyBusy(true);
    try {
      const res = await fetch("/api/advertiser/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amountUsd: buyAmount, currency: buyCurrency }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setCredit(d.adCreditBalance ?? credit);
      toast.success(`Ad credit added — balance ${usd((d.adCreditBalance ?? 0))}`);
      setBuying(false);
    } catch (err) {
      toast.error("Couldn't add funds", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBuyBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/advertiser/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({
          title,
          description,
          budget,
          startAt: startAt ? new Date(startAt).toISOString() : null,
          endAt: endAt ? new Date(endAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      toast.success(`Campaign created — ${usd(budget)} funded from Ad Credit`);
      loadCredit();
      setCreating(false);
      setTitle("");
      setDescription("");
      setBudget(50);
      setStartAt("");
      setEndAt("");
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const fundCampaign = async (id: string, title: string) => {
    const input = await promptDialog({
      title: "Add budget",
      description: `Add budget to "${title}" (USD, from your Ad Credit):`,
      tone: "info",
      defaultValue: "20",
      placeholder: "Amount in USD",
      confirmLabel: "Add budget",
    });
    if (input == null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      const res = await fetch(`/api/advertiser/campaigns/${id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${usd(amount)} added`);
      load();
      loadCredit();
    } catch (err) {
      toast.error("Funding failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-600/20 via-purple-600/10 to-transparent p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/20 grid place-items-center text-indigo-300 shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white">Create Ad</h1>
            <p className="text-xs text-gray-400">Promote your posts &amp; run native feed ads.</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Ad Credit wallet */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 grid place-items-center text-emerald-300 shrink-0">
          <Wallet className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Ad Credit balance</p>
          <p className="text-xl font-extrabold text-white tabular-nums whitespace-nowrap">{usd(credit)}</p>
          <p className="text-[10px] text-gray-500">Non-withdrawable — used to fund campaigns.</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Link
            href="/deposit?from=ads"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            Add funds
          </Link>
          <button
            onClick={() => setBuying(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold"
          >
            From wallet
          </button>
        </div>
      </div>

        {/* Where the money went. The API has always returned this ledger; nothing
            rendered it, so advertisers couldn't reconcile their own balance. */}
        {ledger.length > 0 && (
          <div>
            <button
              onClick={() => setShowLedger((v) => !v)}
              className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200"
            >
              {showLedger ? "Hide history" : `History (${ledger.length})`}
            </button>
            {showLedger && (
              <ul className="mt-2 divide-y divide-white/5 rounded-xl bg-black/20">
                {ledger.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-gray-200 truncate">
                        {LEDGER_LABEL[l.kind] ?? l.kind}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(l.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold tabular-nums shrink-0 ${
                        l.delta >= 0 ? "text-emerald-400" : "text-gray-300"
                      }`}
                    >
                      {l.delta >= 0 ? "+" : "−"}{usd(Math.abs(l.delta))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Invoices and receipts for everything paid — the paperwork side of the
          balance card above it. */}
      <InvoicesCard />

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Campaigns"
          value={stats.campaigns}
          icon={<Target className="w-4 h-4" />}
          tone="blue"
        />
        <StatCard
          label="Impressions"
          value={stats.impressions}
          icon={<Eye className="w-4 h-4" />}
          tone="purple"
        />
        <StatCard
          label="Clicks"
          value={stats.clicks}
          icon={<MousePointer2 className="w-4 h-4" />}
          tone="amber"
        />
        <StatCard
          label="CTR"
          value={`${stats.ctr.toFixed(2)}%`}
          icon={<Target className="w-4 h-4" />}
          tone="green"
        />
      </div>

      {loading && <ListSkeleton rows={3} />}

      {!loading && campaigns.length === 0 && (
        <EmptyState
          icon={Target}
          title="No campaigns yet"
          description="Create your first campaign to advertise on EarnGPT."
          action={{ label: "Create Campaign", onClick: () => setCreating(true) }}
        />
      )}

      {!loading &&
        campaigns.map((c) => {
          const pct = c.budget > 0 ? (c.spent / c.budget) * 100 : 0;
          return (
            <Link
              key={c.id}
              href={`/advertiser/campaigns/${c.id}`}
              className="block card card-interactive p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {c.title}
                  </p>
                  <span
                    className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : c.status === "PAUSED"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-gray-400 tabular-nums">
                    {usd(c.spent)} / {usd(c.budget)}
                  </span>
                  {c.status !== "ENDED" && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fundCampaign(c.id, c.title);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 text-[10px] font-bold hover:bg-indigo-500/25"
                    >
                      <Plus className="w-3 h-3" />
                      Fund
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 h-1 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-indigo-500 to-purple-500"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                <div>
                  <p className="text-gray-500">Impressions</p>
                  <p className="font-bold text-white tabular-nums">
                    {c.impressions.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Clicks</p>
                  <p className="font-bold text-white tabular-nums">
                    {c.clicks.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">CTR</p>
                  <p className="font-bold text-white tabular-nums">
                    {c.ctr.toFixed(2)}%
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

      <BottomSheet
        open={creating}
        onOpenChange={setCreating}
        title="New Campaign"
        footer={
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => setCreating(false)}
              className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={create}
              className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Budget ($)
            </label>
            <input
              type="number"
              min={5}
              step={5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Start date (optional)
              </label>
              <DateField
                type="date"
                value={startAt}
                onChange={(v) => setStartAt(v)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                End date (optional)
              </label>
              <DateField
                type="date"
                value={endAt}
                onChange={(v) => setEndAt(v)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={buying}
        onOpenChange={setBuying}
        title="Top up ad credit from wallet"
        footer={
          <div className="flex gap-2">
            <button
              disabled={buyBusy}
              onClick={() => setBuying(false)}
              className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={buyBusy}
              onClick={buyCredits}
              className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {buyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Buy ${usd(buyAmount)}`}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Convert your existing wallet balance into ad credit (non-withdrawable, funds campaigns).
            To add new money by bKash / Binance / PayPal, use <b>Add funds</b> instead.
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Amount ($)</label>
            <input
              type="number"
              min={5}
              step={5}
              value={buyAmount}
              onChange={(e) => setBuyAmount(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2 mt-2">
              {[10, 20, 50, 100].map((a) => (
                <button
                  key={a}
                  onClick={() => setBuyAmount(a)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${buyAmount === a ? "bg-emerald-500 text-white" : "bg-gray-800 text-gray-300"}`}
                >
                  ${a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Pay with</label>
            <div className="flex gap-2">
              {(["cash", "points"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setBuyCurrency(c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold ${buyCurrency === c ? "bg-emerald-500 text-white" : "bg-gray-800 text-gray-300"}`}
                >
                  {c === "cash" ? "Wallet cash" : "Points"}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-white">Out of wallet balance?</p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
              Add money via bKash, Nagad, Binance or PayPal — it lands in your wallet, then you
              top up ad credit here.
            </p>
            <Link
              href="/deposit?from=ads"
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Add money to wallet
            </Link>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
