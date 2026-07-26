"use client";

import { useState } from "react";
import { Gamepad2, Play } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { GamePlayer, type PlayableGame } from "./game-player";

export interface CatalogGame extends PlayableGame {
  category: string | null;
  description: string | null;
  iconUrl: string;
  playsCount: number;
}

export function GamesCatalog({ games }: { games: CatalogGame[] }) {
  const [playing, setPlaying] = useState<CatalogGame | null>(null);

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {games.map((g) => (
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
                <div className="flex items-center justify-between mt-0.5">
                  {g.category ? (
                    <span className="text-[10px] text-gray-500 truncate">{g.category}</span>
                  ) : (
                    <span />
                  )}
                  <span className="text-[10px] text-gray-600 tabular-nums shrink-0">
                    {g.playsCount.toLocaleString()} plays
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {playing && <GamePlayer game={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
