"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Coins, Flame, Play, Sparkles } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";
import { cn, pts } from "@/lib/utils";
import type { CatalogGame } from "./games-catalog";

/**
 * The pieces of the Games page: a tile, a horizontal section row, and the
 * featured carousel. Every tile is a button that hands the game back to the
 * catalog, which opens the same GamePlayer as before.
 */

/** "2 pts / min" when the game pays for time, else "Earns points". */
export function earnLabel(g: CatalogGame): string | null {
  if (!g.earns) return null;
  if (g.rewardEnabled && g.rewardPointsPerTick > 0) {
    const per =
      g.rewardTickSeconds === 60
        ? "min"
        : g.rewardTickSeconds < 60
          ? `${g.rewardTickSeconds}s`
          : `${Math.round(g.rewardTickSeconds / 60)} min`;
    return `${pts(g.rewardPointsPerTick)} pts / ${per}`;
  }
  return "Earns points";
}

export function EarnBadge({ game, className }: { game: CatalogGame; className?: string }) {
  const label = earnLabel(game);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--app-warn-soft) text-(--app-warn) text-[10px] font-bold whitespace-nowrap max-w-full",
        className
      )}
    >
      <Coins className="w-3 h-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** NEW / HOT corner chips over the artwork. */
function CornerBadges({ game }: { game: CatalogGame }) {
  if (!game.isHot && !game.isNew) return null;
  return (
    <div className="on-media absolute top-1.5 left-1.5 flex flex-col items-start gap-1 pointer-events-none">
      {game.isHot && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold tracking-wide shadow">
          <Flame className="w-2.5 h-2.5" /> HOT
        </span>
      )}
      {game.isNew && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] font-extrabold tracking-wide shadow">
          <Sparkles className="w-2.5 h-2.5" /> NEW
        </span>
      )}
    </div>
  );
}

/**
 * One game. `row` tiles have a fixed width for the horizontal sections;
 * grid tiles fill their column.
 */
export function GameTile({
  game,
  onPlay,
  variant = "grid",
}: {
  game: CatalogGame;
  onPlay: (g: CatalogGame) => void;
  variant?: "row" | "grid";
}) {
  const cat = game.categoryName ?? game.category;
  return (
    <button
      type="button"
      onClick={() => onPlay(game)}
      className={cn(
        "group text-left min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-ring-focus)",
        variant === "row" && "shrink-0 w-[6.75rem] sm:w-32 snap-start"
      )}
      aria-label={`Play ${game.title}`}
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden border border-(--app-line) bg-(--app-surface-2)">
        <SmartImage
          src={game.iconUrl}
          alt=""
          fill
          sizes={variant === "row" ? "128px" : "(max-width: 640px) 33vw, 160px"}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <CornerBadges game={game} />
        <div className="on-media absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors grid place-items-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[11px] font-bold">
            <Play className="w-3 h-3 fill-white" /> Play
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-(--app-ink) leading-snug line-clamp-2 break-words">
        {game.title}
      </p>
      {game.earns ? (
        <EarnBadge game={game} className="mt-1" />
      ) : (
        cat && <p className="mt-0.5 text-[10px] text-(--app-ink-3) truncate">{cat}</p>
      )}
    </button>
  );
}

/** A titled horizontal row with "See all". Renders nothing when empty. */
export function GameSection({
  title,
  icon,
  hint,
  games,
  onPlay,
  onSeeAll,
}: {
  title: string;
  icon?: React.ReactNode;
  hint?: string;
  games: CatalogGame[];
  onPlay: (g: CatalogGame) => void;
  onSeeAll?: () => void;
}) {
  if (games.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-(--app-ink) inline-flex items-center gap-1.5">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          {hint && <p className="text-[11px] text-(--app-ink-3) truncate">{hint}</p>}
        </div>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="shrink-0 inline-flex items-center gap-0.5 px-2 py-1 -mr-2 rounded-lg text-xs font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
          >
            See all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <ScrollFadeRow className="-mx-1" innerClassName="flex gap-3 pb-1 px-1 snap-x" ariaLabel={title}>
        {games.map((g) => (
          <GameTile key={g.id} game={g} onPlay={onPlay} variant="row" />
        ))}
      </ScrollFadeRow>
    </section>
  );
}

const HERO_AUTO_MS = 5000;

/**
 * Featured carousel. Native scroll-snap does the swiping (so touch, trackpad
 * and keyboard all work without a gesture library); a timer advances it,
 * stopped by reduced motion, hover, focus, or the member touching it.
 */
export function HeroCarousel({
  games,
  onPlay,
}: {
  games: CatalogGame[];
  onPlay: (g: CatalogGame) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      setActive(Math.max(0, Math.min(games.length - 1, Math.round(el.scrollLeft / w))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [games.length]);

  const goTo = (i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    const n = games.length;
    const idx = ((i % n) + n) % n;
    el.scrollTo({ left: idx * el.clientWidth, behavior: smooth && !reducedMotion ? "smooth" : "auto" });
  };

  useEffect(() => {
    if (games.length <= 1 || paused || touched || reducedMotion) return;
    const id = setInterval(() => {
      // Off-screen tab: don't move what nobody is watching.
      if (document.visibilityState !== "visible") return;
      const el = trackRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      const cur = Math.round(el.scrollLeft / w);
      const next = (cur + 1) % games.length;
      el.scrollTo({ left: next * w, behavior: "smooth" });
    }, HERO_AUTO_MS);
    return () => clearInterval(id);
  }, [games.length, paused, touched, reducedMotion]);

  if (games.length === 0) return null;

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured games"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setTouched(true)}
    >
      <div
        ref={trackRef}
        className="flex overflow-x-auto scrollbar-none snap-x snap-mandatory rounded-2xl"
      >
        {games.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPlay(g)}
            aria-label={`Play ${g.title}`}
            aria-roledescription="slide"
            aria-hidden={i === active ? undefined : true}
            tabIndex={i === active ? 0 : -1}
            className="on-media relative w-full shrink-0 snap-center aspect-16/8 sm:aspect-16/6 bg-(--app-surface-2) text-left overflow-hidden"
          >
            <SmartImage
              src={g.coverUrl || g.iconUrl}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 960px"
              priority={i === 0}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 pb-6 flex items-end gap-3">
              {/* With only an icon, show it sharp beside the title — a blown-up
                  square icon behind the text reads as a blurry background. */}
              {!g.coverUrl && (
                <span className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden border border-white/20 shrink-0">
                  <SmartImage src={g.iconUrl} alt="" fill sizes="56px" className="object-cover" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Featured
                </span>
                <span className="block text-base sm:text-lg font-bold text-white leading-tight truncate">
                  {g.title}
                </span>
                {g.description && (
                  <span className="block text-[11px] text-white/80 line-clamp-1">{g.description}</span>
                )}
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold">
                <Play className="w-3.5 h-3.5 fill-white" /> Play
              </span>
            </div>
          </button>
        ))}
      </div>

      {games.length > 1 && (
        <div className="on-media absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {games.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setTouched(true);
                goTo(i);
              }}
              aria-label={`Show ${g.title}`}
              aria-current={i === active ? "true" : undefined}
              className="p-1"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all",
                  i === active ? "w-5 bg-white" : "w-1.5 bg-white/45"
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
