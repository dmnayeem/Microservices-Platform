"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export interface BannerSlide {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  videoUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  bgGradient?: string;
}

interface BannerSliderProps {
  slides: BannerSlide[];
  autoMs?: number;
  className?: string;
}

const FALLBACK_GRADIENTS = [
  "from-(--app-grad-a) to-(--app-grad-b)",
  "from-emerald-600 to-cyan-600",
  "from-amber-500 to-pink-600",
  "from-(--app-grad-a) to-pink-600",
];

export function BannerSlider({
  slides,
  autoMs = 4000,
  className,
}: BannerSliderProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    if (paused || interacted || reducedMotion) return;
    const id = setInterval(
      () => setActive((p) => (p + 1) % slides.length),
      autoMs
    );
    return () => clearInterval(id);
  }, [slides.length, autoMs, paused, interacted, reducedMotion]);

  if (slides.length === 0) return null;

  const goTo = (i: number) => {
    setInteracted(true);
    setActive(((i % slides.length) + slides.length) % slides.length);
  };
  const prev = () => goTo(active - 1);
  const next = () => goTo(active + 1);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > 40) {
      if (touchDeltaX.current < 0) next();
      else prev();
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  return (
    <div
      className={cn("relative group/banner", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="relative h-44 sm:h-52 lg:h-56 overflow-hidden rounded-2xl touch-pan-y"
        role="region"
        aria-roledescription="carousel"
        aria-label="Announcements"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((s, i) => {
          const grad =
            s.bgGradient ?? FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length];
          const cls = cn(
            // `on-media`: this slide is ALWAYS a colour gradient, a photo or a
            // video — never the page surface. Without it, light mode's
            // `.text-white → ink` rule turned every banner headline black on a
            // blue gradient, because that rule is written for neutral surfaces
            // and cannot tell that this one does not flip with the theme.
            "on-media absolute inset-0 transition-opacity duration-700 flex items-center px-5",
            "bg-linear-to-br",
            grad,
            i === active ? "opacity-100" : "opacity-0 pointer-events-none"
          );
          const hasVideo = !!s.videoUrl;
          const style =
            !hasVideo && s.imageUrl
              ? {
                  backgroundImage: `linear-gradient(to right, rgba(15,23,42,.7), rgba(15,23,42,.3)), url(${s.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined;
          const inner = (
            <>
              {hasVideo && (
                <>
                  <video
                    src={s.videoUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-r from-slate-950/70 to-slate-950/30" />
                </>
              )}
              <div className="relative z-10 text-white max-w-[70%]">
                {s.title && (
                  <p className="text-lg sm:text-xl font-bold leading-tight break-words">
                    {s.title}
                  </p>
                )}
                {s.subtitle && (
                  <p className="text-xs sm:text-sm opacity-90 mt-1 line-clamp-2 break-words">
                    {s.subtitle}
                  </p>
                )}
                {s.ctaLabel && (
                  <span className="inline-block mt-2.5 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur text-xs font-semibold">
                    {s.ctaLabel} →
                  </span>
                )}
              </div>
            </>
          );
          if (s.ctaHref) {
            return (
              <Link
                key={s.id}
                href={s.ctaHref}
                className={cls}
                style={style}
                aria-hidden={i === active ? undefined : true}
                tabIndex={i === active ? 0 : -1}
              >
                {inner}
              </Link>
            );
          }
          return (
            <div key={s.id} className={cls} style={style} aria-hidden={i === active ? undefined : true}>
              {inner}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full bg-black/35 on-media text-white opacity-0 group-hover/banner:opacity-100 focus-visible:opacity-100 transition-opacity z-20"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next slide"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full bg-black/35 on-media text-white opacity-0 group-hover/banner:opacity-100 focus-visible:opacity-100 transition-opacity z-20"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === active ? "w-5 bg-white" : "w-1.5 bg-white/40"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
