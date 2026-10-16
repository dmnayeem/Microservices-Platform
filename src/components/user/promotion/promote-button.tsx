"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Megaphone, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { cn, usd } from "@/lib/utils";
import { PaySourcePicker, PayErrorNote, useSpendBalances, type PayErrorState } from "@/components/user/primitives/pay-source-picker";
import { quotePlatformPrice, type PaySource } from "@/lib/pay-source";

interface PromoPackage {
  id: string;
  label: string;
  days: number;
  priceCash: number;
  pricePoints: number;
}

export function PromoteButton({
  kind,
  id,
  featuredUntil,
  className,
}: {
  kind: "listing" | "course";
  id: string;
  featuredUntil?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<PromoPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pkgId, setPkgId] = useState("");
  // Promotions are platform spending: Ad Points or Ad Fund only
  // (owner, 2026-10-16). The points price is in Ad Points; the dollar price is
  // what Ad Fund pays.
  const { balances, reload } = useSpendBalances();
  const [paySource, setPaySource] = useState<PaySource | null>(null);
  const [payError, setPayError] = useState<PayErrorState | null>(null);
  const [busy, setBusy] = useState(false);

  const activeUntil =
    featuredUntil && new Date(featuredUntil).getTime() > Date.now()
      ? new Date(featuredUntil)
      : null;

  const openSheet = async () => {
    setOpen(true);
    if (packages.length === 0) {
      setLoading(true);
      try {
        const r = await fetch("/api/promotion/pricing");
        const d = await r.json();
        const list: PromoPackage[] = d.packages ?? [];
        setPackages(list);
        if (list[0]) setPkgId(list[0].id);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
  };

  const submit = async () => {
    if (!pkgId) return;
    setBusy(true);
    setPayError(null);
    try {
      const url =
        kind === "listing"
          ? `/api/marketplace/listings/${id}/promote`
          : `/api/courses/${id}/promote`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": newIdempotencyKey(),
        },
        body: JSON.stringify({ packageId: pkgId, ...(paySource ? { paySource } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.addFund) {
          setPayError({ message: d.error ?? "Not enough balance.", addFund: d.addFund });
          return;
        }
        throw new Error(d.error ?? "Failed");
      }
      reload();
      toast.success("Promotion active — you're featured!");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Couldn't promote", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const sel = packages.find((p) => p.id === pkgId);
  const quote = sel && balances ? quotePlatformPrice({ points: sel.pricePoints, usd: sel.priceCash }, balances.rate) : null;

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
          activeUntil
            ? "bg-amber-500/15 text-amber-300 border border-amber-500/40"
            : "bg-(--app-cta)/15 text-(--app-accent-ink) border border-(--app-accent-edge)/40 hover:bg-(--app-cta)/25",
          className
        )}
      >
        <Megaphone className="w-3.5 h-3.5" />
        {activeUntil ? "Featured" : "Promote"}
      </button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Promote to the top"
        description="Feature this above other results in browse."
        footer={
          <button
            onClick={submit}
            disabled={busy || !pkgId}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {quote
              ? `Pay ${paySource === "AD_FUND" ? usd(quote.usd) : `${quote.adPoints.toLocaleString()} Ad Points`} & promote`
              : "Promote"}
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-(--app-ink-3)" />
          </div>
        ) : (
          <div className="space-y-3">
            {activeUntil && (
              <p className="text-xs text-amber-300">
                Currently featured until {activeUntil.toLocaleDateString()} —
                promoting extends it.
              </p>
            )}
            <div className="space-y-2">
              {packages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPkgId(p.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
                    pkgId === p.id
                      ? "border-(--app-accent-edge) bg-(--app-cta)/10"
                      : "border-(--app-line) bg-(--app-page) hover:border-(--app-line)"
                  )}
                >
                  <p className="text-sm font-semibold text-white">{p.label}</p>
                  <p className="text-[11px] text-(--app-ink-3)">
                    {[
                      p.pricePoints > 0 ? `${p.pricePoints.toLocaleString()} Ad Points` : null,
                      p.priceCash > 0 ? `${usd(p.priceCash)} Ad Fund` : null,
                    ]
                      .filter(Boolean)
                      .join(" or ")}{" "}
                    · {p.days} days
                  </p>
                </button>
              ))}
            </div>
            {quote && (
              <PaySourcePicker
                adPoints={quote.adPoints}
                usdPrice={quote.usd}
                balances={balances}
                value={paySource}
                onChange={setPaySource}
              />
            )}
            <PayErrorNote error={payError} />
          </div>
        )}
      </BottomSheet>
    </>
  );
}
