"use client";

import { useMemo, useState } from "react";
import { Gamepad2, Play, Coins, Star } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { cn } from "@/lib/utils";
import { GamePlayer, type PlayableGame } from "./game-player";
import type { AdPlacementName } from "@/lib/ad-placements";

export interface CatalogGame extends PlayableGame {
  category: string | null;
  categoryName: string | null;
  description: string | null;
  iconUrl: string;
  coverUrl: string | null;
  isFeatured: boolean;
  playsCount: number;
  adPlacement: string;
  /** Set when this game pays for play time — surfaced as an "Earn" badge. */
  rewardPointsPerTick: number;
  rewardTickSeconds: number;
  rewardEnabled: boolean;
}

const ALL = "__all__";

export function GamesCatalog({ games }: { games: CatalogGame[] }) {
  const [playing, setPlaying] = useState<CatalogGame | null>(null);
  const [tab, setTab] = useState<string>(ALL);

  // Category tabs, derived from what actually exists — the catalog previously
  // printed the raw free-text category with no way to filter by it.
  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const g of games) {
      const n = g.categoryName ?? g.category;
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [games]);

  const featured = useMemo(() => games.filter((g) => g.isFeatured), [games]);
  const shown = useMemo(
    () =>
      tab === ALL
        ? games
        : games.filter((g) => (g.categoryName ?? g.category) === tab),
    [games, tab]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center">
          <Gamepad2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Games</h1>
          <p className="text-xs text-gray-400">Play instantly — no download.</p>
        </div>
      </div>

      {games.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          title="No games yet"
          description="New games will appear here soon. Check back later!"
        />
      ) : (
        <>
          {featured.length > 0 && tab === ALL && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider inline-flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400" /> Featured
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {featured.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setPlaying(g)}
                    className="group relative rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden text-left hover:border-emerald-500/40 transition-colors"
                  >
                    <div className="relative aspect-16/7 bg-gray-800">
                      <SmartImage
                        src={g.coverUrl || g.iconUrl}
                        alt={g.title}
                        fill
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-sm font-bold text-white truncate">
                          {g.title}
                        </p>
                        <EarnBadge game={g} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {[ALL, ...categories].map((c) => (
                <button
                  key={c}
                  onClick={() => setTab(c)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                    tab === c
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  )}
                >
                  {c === ALL ? "All" : c}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shown.map((g) => (
              <button
                key={g.id}
                onClick={() => setPlaying(g)}
                className="group rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden text-left hover:border-emerald-500/40 transition-colors"
              >
                <div className="relative aspect-square bg-gray-800">
                  <SmartImage
                    src={g.iconUrl}
                    alt={g.title}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors grid place-items-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold">
                      <Play className="w-3.5 h-3.5 fill-white" /> Play
                    </span>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-bold text-white truncate">{g.title}</p>
                  <EarnBadge game={g} />
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-gray-500 truncate">
                      {g.categoryName ?? g.category ?? ""}
                    </span>
                    <span className="text-[10px] text-gray-600 tabular-nums shrink-0">
                      {g.playsCount.toLocaleString()} plays
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              No games in this category yet.
            </p>
          )}
        </>
      )}

      {playing && (
        <GamePlayer
          game={playing}
          adPlacement={playing.adPlacement as AdPlacementName}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}

/** "2 pts / min" — the actual rate, not a vague "earn while you play". */
function EarnBadge({ game }: { game: CatalogGame }) {
  if (!game.rewardEnabled || game.rewardPointsPerTick <= 0) return null;
  const per =
    game.rewardTickSeconds === 60
      ? "min"
      : game.rewardTickSeconds < 60
        ? `${game.rewardTickSeconds}s`
        : `${Math.round(game.rewardTickSeconds / 60)} min`;
  return (
    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold">
      <Coins className="w-3 h-3" />
      {game.rewardPointsPerTick} pts / {per}
    </span>
  );
}
