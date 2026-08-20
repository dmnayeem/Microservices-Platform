"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Megaphone, Loader2, Coins, DollarSign } from "lucide-react";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { cn, usd } from "@/lib/utils";

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
  const [currency, setCurrency] = useState<"cash" | "points">("cash");
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
        body: JSON.stringify({ packageId: pkgId, currency }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
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

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
          activeUntil
            ? "bg-amber-500/15 text-amber-300 border border-amber-500/40"
            : "bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/25",
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
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {sel
              ? `Pay ${currency === "cash" ? `${usd(sel.priceCash)}` : `${sel.pricePoints} pts`} & promote`
              : "Promote"}
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
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
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-gray-800 bg-gray-950 hover:border-gray-600"
                  )}
                >
                  <p className="text-sm font-semibold text-white">{p.label}</p>
                  <p className="text-[11px] text-gray-400">
                    {usd(p.priceCash)} or {p.pricePoints} pts · {p.days} days
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {(["cash", "points"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border transition-colors",
                    currency === c
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                      : "border-gray-800 bg-gray-950 text-gray-400 hover:text-white"
                  )}
                >
                  {c === "cash" ? (
                    <DollarSign className="w-3.5 h-3.5" />
                  ) : (
                    <Coins className="w-3.5 h-3.5" />
                  )}
                  {c === "cash" ? "Pay with cash" : "Pay with points"}
                </button>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
