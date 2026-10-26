"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Coins,
  Flame,
  Gamepad2,
  Layers,
  Play,
  Search,
  Sparkles,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";
import { cn, pts } from "@/lib/utils";
import { GamePlayer, type PlayableGame } from "./game-player";
import { GameSection, GameTile, HeroCarousel } from "./game-tiles";
import type { AdPlacementName } from "@/lib/ad-placements";

export interface CatalogGame extends PlayableGame {
  category: string | null;
  categoryName: string | null;
  categoryId: string | null;
  description: string | null;
  iconUrl: string;
  coverUrl: string | null;
  isFeatured: boolean;
  playsCount: number;
  /** Points this game has paid to all players, all-time. */
  pointsAwardedTotal: number;
  adPlacement: string;
  rewardPointsPerTick: number;
  rewardTickSeconds: number;
  rewardEnabled: boolean;
  /** Pays for play time, a trusted score, or through its own server. */
  earns: boolean;
  /** Added in the last 14 days — the NEW badge. */
  isNew: boolean;
  /** Added in the last 30 days — the "New" row. */
  inNewRow: boolean;
  createdAtMs: number;
  /** Top 10 of Popular this week — the HOT badge. */
  isHot: boolean;
  /** 0-based place in Popular this week, or null when outside the top 20. */
  popularRank: number | null;
  /** Sessions started in the last 7 days (0 outside the top 20). */
  weekPlays: number;
}

export interface CatalogStats {
  gamesAvailable: number;
  todayPoints: number;
  allTimePoints: number;
  gamesPlayed: number;
  playingNow: number;
  bestGame: { id: string; title: string; points: number } | null;
}

type SectionId = "featured" | "continue" | "earn" | "popular" | "new" | "top";
type SortId = "popular" | "new" | "az" | "earns";

const ALL = "__all__";
/** Tiles per horizontal row; "See all" shows the rest. */
const ROW_MAX = 20;
const HERO_MAX = 8;
/** All-games grid page size. */
const PAGE = 24;

const SORTS: { id: SortId; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "new", label: "New" },
  { id: "az", label: "A–Z" },
  { id: "earns", label: "Earns most" },
];

function sortGames(list: CatalogGame[], sort: SortId): CatalogGame[] {
  const out = [...list];
  switch (sort) {
    case "popular":
      // This week first, then all-time plays for everything outside the top 20.
      return out.sort((a, b) => b.weekPlays - a.weekPlays || b.playsCount - a.playsCount);
    case "new":
      return out.sort((a, b) => b.createdAtMs - a.createdAtMs);
    case "az":
      return out.sort((a, b) => a.title.localeCompare(b.title));
    case "earns":
      return out.sort(
        (a, b) =>
          Number(b.earns) - Number(a.earns) ||
          b.pointsAwardedTotal - a.pointsAwardedTotal ||
          b.weekPlays - a.weekPlays
      );
  }
}

const catOf = (g: CatalogGame) => g.categoryName ?? g.category ?? null;

export function GamesCatalog({
  games,
  stats,
  recentIds = [],
  categoryOrder = [],
  initialPlayId = null,
}: {
  /** Live games in the admin's order. */
  games: CatalogGame[];
  stats: CatalogStats;
  /** This member's most recently played games, latest first. */
  recentIds?: string[];
  /** Category names in the admin's order — the category rows follow it. */
  categoryOrder?: string[];
  /** From `/games?play=<id>`: open this game straight away. */
  initialPlayId?: string | null;
}) {
  const [playing, setPlayingState] = useState<CatalogGame | null>(
    () => (initialPlayId ? games.find((g) => g.id === initialPlayId) ?? null : null)
  );
  // The open game is kept in the address (`?play=<id>`): if the phone reloads
  // the page while the member is away (sharing an invite on WhatsApp, low
  // memory, an app update), they come back into the same game instead of the
  // list. Opening pushes a history entry, so the phone's Back closes the game.
  const pushedRef = useRef(false);
  const setPlaying = useCallback((g: CatalogGame) => {
    setPlayingState(g);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("play") === g.id) return;
      u.searchParams.set("play", g.id);
      if (pushedRef.current) window.history.replaceState(window.history.state, "", u);
      else window.history.pushState(window.history.state, "", u);
      pushedRef.current = true;
    } catch {
      /* the game still opens */
    }
  }, []);
  const closeGame = useCallback(() => {
    setPlayingState(null);
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("play")) return;
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      } else {
        u.searchParams.delete("play");
        window.history.replaceState(window.history.state, "", u);
      }
    } catch {
      /* nothing to tidy */
    }
  }, []);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>(ALL);
  const [view, setView] = useState<SectionId | null>(null);
  const [sort, setSort] = useState<SortId>("popular");
  // Grid page count, tied to what the grid is showing: a new filter starts
  // again at one page without an effect to reset it.
  const [page, setPage] = useState<{ key: string; n: number }>({ key: "", n: PAGE });

  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  // Back / Forward: follow the address.
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("play");
      if (!id) pushedRef.current = false;
      setPlayingState(id ? byId.get(id) ?? null : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [byId]);

  const sections = useMemo(() => {
    const featured = games.filter((g) => g.isFeatured);
    const recent = recentIds.map((id) => byId.get(id)).filter((g): g is CatalogGame => !!g);
    const earn = games.filter((g) => g.earns);
    const popular = games
      .filter((g) => g.popularRank !== null)
      .sort((a, b) => (a.popularRank ?? 0) - (b.popularRank ?? 0));
    const fresh = games.filter((g) => g.inNewRow).sort((a, b) => b.createdAtMs - a.createdAtMs);
    const top = games
      .filter((g) => g.pointsAwardedTotal > 0)
      .sort((a, b) => b.pointsAwardedTotal - a.pointsAwardedTotal);
    return { featured, continue: recent, earn, popular, new: fresh, top } satisfies Record<
      SectionId,
      CatalogGame[]
    >;
  }, [games, recentIds, byId]);

  // Category names in the admin's order; legacy free-text names follow, A–Z.
  const categories = useMemo(() => {
    const groups = new Map<string, CatalogGame[]>();
    for (const g of games) {
      const n = catOf(g);
      if (!n) continue;
      const list = groups.get(n);
      if (list) list.push(g);
      else groups.set(n, [g]);
    }
    const rank = new Map(categoryOrder.map((n, i) => [n, i]));
    const names = [...groups.keys()].sort((a, b) => {
      const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.localeCompare(b);
    });
    return names.map((name) => ({ name, games: groups.get(name)! }));
  }, [games, categoryOrder]);

  const needle = query.trim().toLowerCase();
  const gridMode = !!needle || cat !== ALL || view !== null;

  // What the grid shows: a section's full list, or all games filtered by the
  // category chip and the search box, in the chosen sort.
  const gridList = useMemo(() => {
    if (view && !needle && cat === ALL) return sections[view];
    let list = games;
    if (cat !== ALL) list = list.filter((g) => catOf(g) === cat);
    if (needle) {
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(needle) ||
          (catOf(g) ?? "").toLowerCase().includes(needle) ||
          (g.description ?? "").toLowerCase().includes(needle)
      );
    }
    return sortGames(list, sort);
  }, [view, needle, cat, games, sections, sort]);
  const sortable = !(view && !needle && cat === ALL);

  const allSorted = useMemo(() => sortGames(games, sort), [games, sort]);

  const pageKey = gridMode ? `${view}|${cat}|${needle}|${sort}` : `home|${sort}`;
  const limit = page.key === pageKey ? page.n : PAGE;
  const more = () => setPage({ key: pageKey, n: limit + PAGE });

  const goHome = () => {
    setView(null);
    setCat(ALL);
    setQuery("");
  };
  const seeAll = (id: SectionId) => {
    setQuery("");
    setCat(ALL);
    setView(id);
    window.scrollTo({ top: 0 });
  };
  const seeCategory = (name: string) => {
    setQuery("");
    setView(null);
    setCat(name);
    window.scrollTo({ top: 0 });
  };

  const sectionTitle: Record<SectionId, string> = {
    featured: "Featured",
    continue: "Continue playing",
    earn: "Earn points",
    popular: "Popular this week",
    new: "New",
    top: "Top earning for players",
  };
  const gridTitle = needle
    ? `Results for “${query.trim()}”`
    : view && cat === ALL
      ? sectionTitle[view]
      : cat !== ALL
        ? cat
        : "All games";

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
          <Gamepad2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-(--app-ink)">Games</h1>
          <p className="text-xs text-(--app-ink-3)">Play instantly — no download.</p>
        </div>
      </div>

      <StatsStrip stats={stats} onPlayBest={(id) => {
        const g = byId.get(id);
        if (g) setPlaying(g);
      }} />

      {games.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          title="No games yet"
          description="New games will appear here soon. Check back later!"
        />
      ) : (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-(--app-ink-3) absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${pts(games.length)} games`}
              aria-label="Search games"
              className="w-full h-10 pl-9 pr-9 rounded-xl bg-(--app-field-bg) border border-(--app-line) text-sm text-(--app-ink) placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-line-strong) [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-(--app-ink-3) hover:text-(--app-ink)"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {categories.length > 0 && (
            <ScrollFadeRow className="-mx-1" innerClassName="flex gap-2 pb-1 px-1" ariaLabel="Game category filter">
              {[ALL, ...categories.map((c) => c.name)].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setView(null);
                    setCat(c);
                  }}
                  aria-pressed={cat === c}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                    cat === c
                      ? "bg-emerald-500 text-white"
                      : "bg-(--app-surface-2) text-(--app-ink-3) hover:text-(--app-ink)"
                  )}
                >
                  {c === ALL ? "All" : c}
                </button>
              ))}
            </ScrollFadeRow>
          )}

          {gridMode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goHome}
                  aria-label="Back to all sections"
                  className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-(--app-surface-2) text-(--app-ink-2) hover:text-(--app-ink)"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-sm font-bold text-(--app-ink) min-w-0 flex-1 truncate">
                  {gridTitle}
                  <span className="ml-1.5 text-(--app-ink-3) font-semibold tabular-nums">
                    {pts(gridList.length)}
                  </span>
                </h2>
                {sortable && <SortSelect value={sort} onChange={setSort} />}
              </div>
              <PagedGrid
                games={gridList}
                limit={limit}
                onMore={more}
                onPlay={setPlaying}
                empty={needle ? "No games match your search." : "No games here yet."}
              />
            </div>
          ) : (
            <div className="space-y-6">
              {sections.featured.length > 0 && (
                <div className="space-y-2">
                  {sections.featured.length > HERO_MAX && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => seeAll("featured")}
                        className="text-xs font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
                      >
                        All featured ({pts(sections.featured.length)})
                      </button>
                    </div>
                  )}
                  <HeroCarousel games={sections.featured.slice(0, HERO_MAX)} onPlay={setPlaying} />
                </div>
              )}

              <GameSection
                title="Continue playing"
                icon={<Clock className="w-4 h-4 text-(--app-ink-3)" />}
                games={sections.continue}
                onPlay={setPlaying}
              />
              <GameSection
                title="Earn points"
                icon={<Coins className="w-4 h-4 text-(--app-warn)" />}
                hint="These games pay you points as you play"
                games={sections.earn.slice(0, ROW_MAX)}
                onPlay={setPlaying}
                onSeeAll={() => seeAll("earn")}
              />
              <GameSection
                title="Popular this week"
                icon={<Flame className="w-4 h-4 text-rose-400" />}
                hint="Most played in the last 7 days"
                games={sections.popular.slice(0, ROW_MAX)}
                onPlay={setPlaying}
                onSeeAll={() => seeAll("popular")}
              />
              <GameSection
                title="New"
                icon={<Sparkles className="w-4 h-4 text-emerald-400" />}
                hint="Added in the last 30 days"
                games={sections.new.slice(0, ROW_MAX)}
                onPlay={setPlaying}
                onSeeAll={() => seeAll("new")}
              />
              <GameSection
                title="Top earning for players"
                icon={<Trophy className="w-4 h-4 text-amber-400" />}
                hint="Games that have paid players the most points"
                games={sections.top.slice(0, ROW_MAX)}
                onPlay={setPlaying}
                onSeeAll={() => seeAll("top")}
              />
              {categories.map((c) => (
                <GameSection
                  key={c.name}
                  title={c.name}
                  icon={<Layers className="w-4 h-4 text-(--app-ink-3)" />}
                  games={c.games.slice(0, ROW_MAX)}
                  onPlay={setPlaying}
                  onSeeAll={() => seeCategory(c.name)}
                />
              ))}

              <section className="space-y-3" aria-label="All games">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-(--app-ink) inline-flex items-center gap-1.5 min-w-0 flex-1">
                    <Gamepad2 className="w-4 h-4 text-(--app-ink-3)" />
                    All games
                    <span className="text-(--app-ink-3) font-semibold tabular-nums">{pts(games.length)}</span>
                  </h2>
                  <SortSelect value={sort} onChange={setSort} />
                </div>
                <PagedGrid
                  games={allSorted}
                  limit={limit}
                  onMore={more}
                  onPlay={setPlaying}
                  empty="No games yet."
                />
              </section>
            </div>
          )}
        </>
      )}

      {playing && (
        <GamePlayer
          game={playing}
          adPlacement={playing.adPlacement as AdPlacementName}
          onClose={closeGame}
        />
      )}
    </div>
  );
}

function SortSelect({ value, onChange }: { value: SortId; onChange: (v: SortId) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortId)}
      aria-label="Sort games"
      className="shrink-0 h-8 pl-2 pr-7 rounded-lg bg-(--app-surface-2) border border-(--app-line) text-xs font-semibold text-(--app-ink) focus:outline-none"
    >
      {SORTS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function PagedGrid({
  games,
  limit,
  onMore,
  onPlay,
  empty,
}: {
  games: CatalogGame[];
  limit: number;
  onMore: () => void;
  onPlay: (g: CatalogGame) => void;
  empty: string;
}) {
  if (games.length === 0) {
    return <p className="text-sm text-(--app-ink-3) text-center py-8">{empty}</p>;
  }
  const shown = games.slice(0, limit);
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3 gap-y-4">
        {shown.map((g) => (
          <GameTile key={g.id} game={g} onPlay={onPlay} />
        ))}
      </div>
      {games.length > shown.length && (
        <button
          type="button"
          onClick={onMore}
          className="w-full h-10 rounded-xl bg-(--app-surface-2) border border-(--app-line) text-sm font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
        >
          Load more ({pts(games.length - shown.length)} left)
        </button>
      )}
    </>
  );
}

/** One small stat inside the compact strip. */
function MiniStat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center">
      <span className={cn("inline-flex items-center gap-1 text-sm font-bold tabular-nums leading-none text-(--app-ink)", accent)}>
        {icon}
        <span className="truncate">{value}</span>
      </span>
      <span className="w-full truncate text-[10px] leading-tight text-(--app-ink-3)">{label}</span>
    </div>
  );
}

/**
 * The games stats, compact (owner, 2026-10-17: the four big cards took too
 * much room): one slim card with four small cells, and the best game as a thin
 * line inside it.
 */
function StatsStrip({
  stats,
  onPlayBest,
}: {
  stats: CatalogStats;
  onPlayBest: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-(--app-line) bg-(--app-surface)">
      <div className="grid grid-cols-4 divide-x divide-(--app-line)">
        <MiniStat
          icon={<Gamepad2 className="w-3.5 h-3.5 text-sky-400" />}
          value={stats.gamesAvailable}
          label="Games"
        />
        <Link
          href="/wallet"
          aria-label={`Your game points: ${pts(stats.todayPoints)} today, ${pts(stats.allTimePoints)} all-time. Open wallet`}
          title={`${pts(stats.allTimePoints)} points all-time`}
          className="block hover:bg-(--app-surface-2) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--app-ring-focus)"
        >
          <MiniStat
            icon={<Coins className="w-3.5 h-3.5" />}
            value={pts(stats.todayPoints)}
            label="Pts today"
            accent="text-emerald-400"
          />
        </Link>
        <MiniStat
          icon={<Star className="w-3.5 h-3.5 text-amber-400" />}
          value={stats.gamesPlayed}
          label="Played"
        />
        <MiniStat
          icon={
            <span className="relative inline-flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          }
          value={stats.playingNow}
          label="Playing now"
        />
      </div>
      {stats.bestGame && (
        <button
          type="button"
          onClick={() => onPlayBest(stats.bestGame!.id)}
          className="flex w-full items-center gap-2 border-t border-(--app-line) px-3 py-1.5 text-left hover:bg-(--app-surface-2) transition-colors"
        >
          <Trophy className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-(--app-ink-3)">
            Best: <span className="font-semibold text-(--app-ink)">{stats.bestGame.title}</span>
            {" · "}
            <span className="tabular-nums">{pts(stats.bestGame.points)} pts</span>
            {" · "}
            <span className="tabular-nums">{pts(stats.allTimePoints)} all-time</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-emerald-400">
            <Play className="w-3 h-3 fill-current" /> Play
          </span>
        </button>
      )}
    </div>
  );
}
