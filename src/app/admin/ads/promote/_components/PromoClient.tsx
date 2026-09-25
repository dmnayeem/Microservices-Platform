"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, RefreshCw, Check, ImageOff, Store, GraduationCap } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";
import type { PromoItem } from "@/lib/house-promos";

type Placement = { name: string; label: string; where: string };

/**
 * A short list of slots that suit a product ad, offered as one click.
 *
 * Thirty-six placements is a real choice to make and a terrible first screen.
 * These four are where somebody is already in a buying frame of mind — browsing
 * the shop, on the dashboard, in the feed, or looking at their wallet.
 */
const SUGGESTED = ["MARKETPLACE_TOP", "DASHBOARD", "IN_FEED", "WALLET_TOP"];

export function PromoClient({
  items,
  placements,
  canManage,
}: {
  items: PromoItem[];
  placements: Placement[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Per-item working set, seeded from what is actually running.
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(items.map((i) => [`${i.kind}:${i.id}`, i.placements]))
  );

  const keyOf = (i: PromoItem) => `${i.kind}:${i.id}`;

  const save = async (item: PromoItem, next: string[]) => {
    const k = keyOf(item);
    setBusy(k);
    try {
      const res = await fetch("/api/admin/ads/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id, placements: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update");
      toast.success(next.length ? "Promo updated" : "Promo stopped", {
        description: json.message,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
      // Put the tick boxes back to what the server still has.
      setDraft((d) => ({ ...d, [k]: item.placements }));
    } finally {
      setBusy(null);
    }
  };

  const refreshAll = async () => {
    setBusy("__refresh");
    try {
      const res = await fetch("/api/admin/ads/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not refresh");
      toast.success("Promos refreshed", { description: json.message });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh");
    } finally {
      setBusy(null);
    }
  };

  const live = items.filter((i) => i.placements.length > 0).length;

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nothing to promote yet. Only active marketplace listings and published
        courses appear here — advertising something a buyer cannot then buy spends
        an impression to produce a dead end.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-400">
          <strong className="text-white">{live}</strong> of {items.length} running.
        </p>
        {canManage && (
          <button
            onClick={refreshAll}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50"
            title="Re-read every promoted item's title, picture and price, and stop the ones that have sold or been unpublished."
          >
            {busy === "__refresh" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh all
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const k = keyOf(item);
          const chosen = draft[k] ?? [];
          const isOpen = open === k;
          return (
            <div
              key={k}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                  {item.image ? (
                    // Arbitrary seller/course artwork, so a plain <img>.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff className="h-5 w-5 text-slate-600" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                      {item.kind === "COURSE" ? (
                        <GraduationCap className="h-3 w-3" />
                      ) : (
                        <Store className="h-3 w-3" />
                      )}
                      {item.kind === "COURSE" ? "Course" : "Listing"}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-white">
                      {item.title}
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">
                      {usd(item.price)}
                    </span>
                  </div>

                  {item.placements.length > 0 ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-300">
                      <Check className="h-3 w-3" />
                      Running in {item.placements.length} placement
                      {item.placements.length === 1 ? "" : "s"}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">Not advertised</p>
                  )}

                  {!item.image && (
                    <p className="mt-1 text-[11px] text-amber-300/90">
                      Needs a picture before it can be advertised — an ad slot with no
                      creative renders as an empty box.
                    </p>
                  )}
                </div>

                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    {item.placements.length === 0 && item.image && (
                      <button
                        onClick={() => save(item, SUGGESTED)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {busy === k ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Megaphone className="h-3.5 w-3.5" />
                        )}
                        Promote
                      </button>
                    )}
                    <button
                      onClick={() => setOpen(isOpen ? null : k)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white"
                    >
                      {isOpen ? "Done" : "Choose slots"}
                    </button>
                  </div>
                )}
              </div>

              {isOpen && canManage && (
                <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-500">
                    Promote picks the four slots where someone is already in a buying
                    frame of mind. Tick whatever you like instead — unticking them all
                    stops the promo.
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {placements.map((p) => {
                      const on = chosen.includes(p.name);
                      return (
                        <label
                          key={p.name}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 p-2 hover:border-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                [k]: e.target.checked
                                  ? [...chosen, p.name]
                                  : chosen.filter((x) => x !== p.name),
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-white">
                              {p.label}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {p.where}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => save(item, chosen)}
                    disabled={busy !== null || !item.image}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy === k ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Save {chosen.length} placement{chosen.length === 1 ? "" : "s"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
