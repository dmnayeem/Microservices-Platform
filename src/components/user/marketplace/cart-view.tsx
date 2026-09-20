"use client";
import { usd } from "@/lib/utils";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Trash2,
  Loader2,
  CreditCard,
  ChevronLeft,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { toast } from "@/lib/toast";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { runInterstitial } from "@/lib/reward-interstitial";

interface CartItem {
  id: string;
  listingId: string;
  title: string;
  price: number;
  currency: string;
  thumbnail: string | null;
  // Stored on CartItem but ignored at checkout — marketplace listings are
  // unique assets, so every cart row resolves to exactly one purchase.
  quantity: number;
  available: boolean;
  sellerId: string;
}

export function CartView() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cart");
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setItems(d.items ?? []);
    } catch (err) {
      toast.error("Couldn't load cart", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (item: CartItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/cart/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Removed from cart");
    } catch {
      toast.error("Couldn't remove item");
    } finally {
      setBusyId(null);
    }
  };

  const checkout = async () => {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) {
          toast.error("Not enough in your wallet", {
            description: data.details ?? data.error ?? "Top up and try again.",
            action: {
              label: "Top up",
              onClick: () => router.push("/wallet"),
            },
          });
          return;
        }
        if (res.status === 409) {
          toast.error("Some listings were just bought", {
            description: data.error ?? "Refresh and try again.",
          });
          router.refresh();
          return;
        }
        throw new Error(data.error ?? data.details ?? `HTTP ${res.status}`);
      }
      await runInterstitial();
      toast.success(`Checkout complete · ${usd(data.total)} charged`);
      setItems([]);
      router.push("/marketplace/orders");
      router.refresh();
    } catch (err) {
      toast.error("Checkout failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setCheckingOut(false);
    }
  };

  // Each cart row = one purchase regardless of stored quantity (listings are
  // unique assets). The buyer pays the listing price; the platform fee is
  // cut from the seller's payout, not added to the buyer.
  const total = items.reduce((s, i) => s + i.price, 0);
  const hasUnavailable = items.some((i) => !i.available);

  return (
    <div className="space-y-3">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to marketplace
      </Link>

      <h1 className="text-xl font-bold text-white inline-flex items-center gap-2">
        <ShoppingCart className="w-5 h-5 text-(--app-accent-ink)" />
        Your Cart
      </h1>

      {loading && <ListSkeleton rows={3} />}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="Cart is empty"
          description="Add listings from the marketplace to check out together."
          action={{ label: "Browse marketplace", href: "/marketplace" }}
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="space-y-2">
            {items.map((i) => (
              <div
                key={i.id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  i.available
                    ? "bg-(--app-surface) border-(--app-line)"
                    : "bg-red-500/5 border-red-500/30"
                }`}
              >
                <div className="w-14 h-14 rounded-lg bg-(--app-surface-2) overflow-hidden shrink-0">
                  {i.thumbnail && (
                    <SmartImage
                      src={i.thumbnail}
                      alt=""
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/marketplace/${i.listingId}`}
                    className="text-sm font-semibold text-white truncate hover:underline block"
                  >
                    {i.title}
                  </Link>
                  <p className="text-xs text-(--app-ink-3) tabular-nums">
                    {usd(i.price)}
                  </p>
                  {!i.available && (
                    <p className="text-[11px] text-red-400 mt-0.5">
                      No longer available · remove to continue
                    </p>
                  )}
                </div>
                <button
                  disabled={busyId === i.id}
                  onClick={() => remove(i)}
                  className="p-1.5 rounded text-(--app-ink-3) hover:text-red-400 hover:bg-(--app-surface-2) disabled:opacity-50"
                  title="Remove from cart"
                >
                  {busyId === i.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="glass rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-(--app-ink-3)">
              <span>
                {items.length} listing{items.length === 1 ? "" : "s"}
              </span>
              <span className="tabular-nums">{usd(total)}</span>
            </div>
            <div className="border-t border-(--app-line) pt-2 flex justify-between text-base font-bold text-white">
              <span>You pay</span>
              <span className="tabular-nums">{usd(total)}</span>
            </div>
            <p className="text-[11px] text-(--app-ink-3)">
              Charged from your wallet. The platform commission is deducted
              from each seller&apos;s payout.
            </p>
          </div>

          <button
            onClick={checkout}
            disabled={checkingOut || hasUnavailable}
            className="w-full py-3 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) hover:from-(--app-grad-a) hover:to-(--app-grad-b) text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {checkingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            {hasUnavailable ? "Remove unavailable items first" : `Checkout · ${usd(total)}`}
          </button>
        </>
      )}
    </div>
  );
}
