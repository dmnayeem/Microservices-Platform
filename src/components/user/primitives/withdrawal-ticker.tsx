"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn, usd } from "@/lib/utils";

export interface WithdrawalTickerItem {
  id: string;
  username: string;
  amount: number;
  unit?: "USD" | "pts";
  method?: string | null;
  country?: string | null;
}

interface WithdrawalTickerProps {
  items: WithdrawalTickerItem[];
  className?: string;
  speedSec?: number;
  showAmount?: boolean;
  showMethod?: boolean;
  showCountry?: boolean;
  // Subscribe to a Server-Sent Events stream and prepend new approvals as
  // they arrive. Degrades silently if the browser/server doesn't support it.
  liveStream?: boolean;
  streamUrl?: string;
  maxItems?: number;
}

export function WithdrawalTicker({
  items: initialItems,
  className,
  speedSec = 40,
  showAmount = true,
  showMethod = false,
  showCountry = false,
  liveStream = true,
  streamUrl = "/api/withdrawal-ticker/recent",
  maxItems = 30,
}: WithdrawalTickerProps) {
  const [items, setItems] = useState(initialItems);
  const seenIds = useRef(new Set(initialItems.map((i) => i.id)));

  // Polls a shared, cached endpoint instead of holding an SSE connection open.
  // The old stream kept a serverless function alive for 5 minutes per viewer and
  // re-queried every 8s inside each one, all for the same list — so the cost grew
  // linearly with concurrent users for zero added freshness. A decorative ticker
  // cannot tell 8s from 30s.
  useEffect(() => {
    if (!liveStream || typeof window === "undefined") return;
    let cancelled = false;

    const pull = async () => {
      // Don't poll a tab nobody is looking at.
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(streamUrl, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const d = (await res.json()) as { items?: WithdrawalTickerItem[] };
        const fresh = (d.items ?? []).filter((i) => i?.id && !seenIds.current.has(i.id));
        if (fresh.length === 0) return;
        for (const i of fresh) seenIds.current.add(i.id);
        setItems((prev) => [...fresh, ...prev].slice(0, maxItems));
      } catch {
        // transient — the next tick retries
      }
    };

    const id = setInterval(pull, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveStream, streamUrl, maxItems]);

  if (items.length === 0) return null;
  const doubled = [...items, ...items];

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-xl bg-emerald-500/10 border border-emerald-500/20 py-1.5 px-3",
        className
      )}
    >
      <Megaphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <div className="overflow-hidden flex-1 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div
          className="flex gap-6 whitespace-nowrap will-change-transform"
          style={{
            animation: `wt-scroll ${speedSec}s linear infinite`,
          }}
        >
          {doubled.map((it, i) => (
            <span
              key={`${it.id}-${i}`}
              className="text-xs text-gray-200 inline-flex items-center gap-1"
            >
              <span className="text-emerald-400 font-semibold">
                @{it.username}
              </span>
              withdrew
              {showAmount && (
                <span className="text-emerald-400 font-bold">
                  {it.unit === "pts"
                    ? `${it.amount.toLocaleString()} pts`
                    : `${usd(it.amount)}`}
                </span>
              )}
              {showMethod && it.method && (
                <span className="text-gray-400">via {it.method}</span>
              )}
              {showCountry && it.country && (
                <span className="text-gray-400">· {it.country}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes wt-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
