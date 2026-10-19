"use client";

import { BrandLockup, BrandMark } from "@/components/providers/brand";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronRight } from "lucide-react";
import { SPLASH_SEEN_KEY, splashInWindow, type SplashMode, type SplashSlide } from "@/lib/splash";
import { matchesDeviceTarget } from "@/lib/device-target";
import { parseDevice } from "@/lib/device-info";
import { SmartImage } from "@/components/user/primitives/smart-image";

// iPadOS asks for the desktop site; touch gives it away.
const isIpad = () => /Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1;

export interface SplashViewConfig {
  mode: SplashMode;
  durationMs: number;
  slides: SplashSlide[];
}

// Branded fallback shown when a slide has no image (or the image fails to load) —
// matches the sidebar/app logo instead of a bare icon.
function BrandLogo() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <BrandLockup className="h-20">
        <div className="w-24 h-24 rounded-3xl bg-linear-to-br from-(--app-grad-a) to-(--app-grad-b) flex items-center justify-center shadow-lg shadow-(--app-cta)/30">
          <BrandMark iconClassName="w-12 h-12 text-white" />
        </div>
        <span className="text-2xl font-black bg-linear-to-r from-(--app-rail-a) to-(--app-rail-b) bg-clip-text text-transparent">
          RevType
        </span>
      </BrandLockup>
    </div>
  );
}

/**
 * The splash itself — used by SplashScreen and by the admin's Preview, so the
 * admin sees exactly what members get.
 */
export function SplashView({ cfg, onClose }: { cfg: SplashViewConfig; onClose: () => void }) {
  const [active, setActive] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const count = cfg.slides.length;

  // Give each slide's image a fresh try.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgFailed(false);
  }, [active]);

  // Lock the page behind it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const next = useCallback(() => {
    if (active >= count - 1) onClose();
    else setActive(active + 1);
  }, [active, count, onClose]);
  const prev = useCallback(() => setActive((p) => Math.max(0, p - 1)), []);

  // Keyboard: → / Enter / Space next, ← back, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Auto-advance — "slides" mode only; image-only advances on tap.
  useEffect(() => {
    if (cfg.mode !== "slides" || count <= 1) return;
    const t = setTimeout(() => setActive((p) => Math.min(p + 1, count - 1)), cfg.durationMs);
    return () => clearTimeout(t);
  }, [cfg.mode, cfg.durationMs, count, active]);

  // Swipe (image-only): left = next, right = back. A tap is a swipe of ~0.
  const touchX = useRef<number | null>(null);

  const slide = cfg.slides[active];

  // ── Image only: full screen, nothing but the picture ────────────────────
  if (cfg.mode === "images") {
    const upcoming = cfg.slides[active + 1];
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Welcome — image ${active + 1} of ${count}. Tap to continue.`}
        className="fixed inset-0 z-100 h-dvh w-full select-none overflow-hidden bg-black cursor-pointer"
        onClick={next}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null) return;
          const dx = end - start;
          if (dx > 50) {
            // Swipe right: back. Stop the click that follows from moving forward.
            e.preventDefault();
            prev();
          } else if (dx < -50) {
            e.preventDefault();
            next();
          }
        }}
      >
        {slide.imageUrl && !imgFailed ? (
          <>
            {/* Soft, blurred copy fills the bars around a picture whose shape
                differs from the screen (tall phones, desktops). */}
            <SmartImage
              key={`bg-${active}`}
              src={slide.imageUrl}
              alt=""
              fill
              sizes="100vw"
              className="scale-110 object-cover opacity-40 blur-2xl"
            />
            {/* The picture itself: always whole (contain), never cropped,
                centred — on a desktop it stands in the middle. */}
            <SmartImage
              key={`fg-${active}`}
              src={slide.imageUrl}
              alt={`Welcome image ${active + 1} of ${count}`}
              fill
              priority
              sizes="(min-aspect-ratio: 9/16) 56vh, 100vw"
              onError={() => setImgFailed(true)}
              className="object-contain"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <BrandLogo />
          </div>
        )}
        {/* Load the next picture early so the tap feels instant. */}
        {upcoming?.imageUrl && (
          <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden>
            <SmartImage src={upcoming.imageUrl} alt="" width={9} height={16} sizes="100vw" />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="sr-only"
        >
          Close
        </button>
      </div>
    );
  }

  // ── Slides: image, title, text and buttons ──────────────────────────────
  const isLast = active === count - 1;
  return (
    <div className="fixed inset-0 z-100 bg-[#0a0a0f] flex flex-col" role="dialog" aria-modal="true" aria-label="Welcome">
      <button
        onClick={onClose}
        className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-10 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-(--app-surface)/70 text-(--app-ink-2) text-xs font-semibold hover:text-(--app-ink)"
      >
        Skip <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-sm">
          <div className="relative aspect-square w-full max-w-xs mx-auto rounded-3xl overflow-hidden bg-(--app-surface) border border-(--app-line) flex items-center justify-center mb-8">
            {slide.imageUrl && !imgFailed ? (
              <SmartImage
                src={slide.imageUrl}
                alt={slide.title}
                fill
                sizes="100vw"
                onError={() => setImgFailed(true)}
                className="object-cover"
              />
            ) : (
              <BrandLogo />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{slide.title}</h1>
          {slide.content && (
            <p className="mt-3 text-(--app-ink-3) leading-relaxed whitespace-pre-wrap">{slide.content}</p>
          )}
        </div>
      </div>

      <div className="pb-10 px-6 space-y-6">
        <div className="flex items-center justify-center gap-2">
          {cfg.slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-6 bg-(--app-cta)" : "w-1.5 bg-(--app-surface-2)"
              }`}
            />
          ))}
        </div>
        <div className="max-w-sm mx-auto">
          {isLast ? (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white font-bold"
            >
              Get started
            </button>
          ) : (
            <button
              onClick={next}
              className="w-full py-3 rounded-xl bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) font-semibold inline-flex items-center justify-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shows the splash once, right after a member signs in or registers
 * (owner, 2026-10-17). The server decides whether this sign-in qualifies
 * (/api/splash); the browser remembers which sign-in it was shown for, so a
 * reload or the next page never shows it again until the next sign-in.
 */
export function SplashScreen() {
  const [cfg, setCfg] = useState<SplashViewConfig | null>(null);
  const loginAtRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/splash", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.enabled || !Array.isArray(d.slides) || d.slides.length === 0) return;
        const loginAt = Number(d.loginAt);
        if (!loginAt) return;
        try {
          if (localStorage.getItem(SPLASH_SEEN_KEY) === String(loginAt)) return;
        } catch {
          /* storage blocked — show it; worst case it shows again next page */
        }
        // Dates and devices the admin chose (Admin → Splash screen).
        if (!splashInWindow(d)) return;
        if (!matchesDeviceTarget(d, parseDevice(navigator.userAgent, isIpad() ? { platform: "ipados" } : {}))) return;
        loginAtRef.current = loginAt;
        setCfg({
          mode: d.mode === "images" ? "images" : "slides",
          durationMs: Number(d.durationMs) || 3500,
          slides: d.slides,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    try {
      if (loginAtRef.current) localStorage.setItem(SPLASH_SEEN_KEY, String(loginAtRef.current));
    } catch {
      /* ignore */
    }
    setCfg(null);
  }, []);

  if (!cfg) return null;
  return <SplashView cfg={cfg} onClose={close} />;
}
