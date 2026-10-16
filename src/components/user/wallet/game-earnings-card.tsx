"use client";

import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { STAT_VALUE_CLASS_SM } from "@/components/user/primitives/stat-card";
import { cn, pts, usd } from "@/lib/utils";
import type { GameEarningsSummary } from "@/lib/game-earnings";

/**
 * Wallet → Overview: points earned from games (GameEarnLog), shown only when
 * the member has earned from at least one game. Today = the member's local day.
 */
export function GameEarningsCard({
  data,
  pointsPerUsd,
}: {
  data: GameEarningsSummary;
  pointsPerUsd: number;
}) {
  const toUsd = (p: number) => usd(p / (pointsPerUsd || 1));

  return (
    <div className="app-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="t-section text-white inline-flex items-center gap-2 min-w-0">
          <Gamepad2 className="w-4.5 h-4.5 shrink-0 text-(--app-ink-3)" />
          <span className="truncate">Game earnings</span>
        </p>
        <Link
          href="/games"
          className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash) shrink-0"
        >
          Play games
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Today", value: data.totals.today },
          { label: "This month", value: data.totals.month },
          { label: "All time", value: data.totals.allTime },
        ].map((t) => (
          <div key={t.label} className="app-tile min-w-0 @container">
            <p className="t-meta text-(--app-ink-3) truncate">{t.label}</p>
            <p className={cn(STAT_VALUE_CLASS_SM, "mt-1 text-[clamp(0.75rem,20cqi,1.125rem)]")}>
              {pts(t.value)}
            </p>
            <p className="t-meta text-(--app-ink-3) whitespace-nowrap">≈ {toUsd(t.value)}</p>
          </div>
        ))}
      </div>

      {data.games.length > 0 && (
        <ul className="divide-y divide-(--app-line) rounded-(--app-r-control) border border-(--app-line)">
          {data.games.map((g) => (
            <li key={g.gameId} className="flex items-center gap-2.5 px-2.5 py-2 min-w-0">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-(--app-surface-2)">
                {g.iconUrl ? (
                  <SmartImage src={g.iconUrl} alt={g.title} fill sizes="36px" className="object-cover" />
                ) : (
                  <Gamepad2 className="absolute inset-0 m-auto h-4 w-4 text-(--app-ink-3)" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{g.title}</p>
                <p className="t-meta text-(--app-ink-3) truncate">
                  Today {pts(g.today)} · Month {pts(g.month)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-white tabular-nums">{pts(g.allTime)}</p>
                <p className="t-meta text-(--app-ink-3)">all time</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="t-meta leading-relaxed text-(--app-ink-3)">
        Game points are added to your Earn Points — withdraw them from your wallet.
      </p>
    </div>
  );
}
