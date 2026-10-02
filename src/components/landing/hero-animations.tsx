"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { CheckCircle2, Coins, Send, TrendingUp, Gift, Check } from "lucide-react";
import {
  heroMoney,
  type HeroAnimation,
  type HeroAnimationStyle,
} from "@/lib/landing-content";

/**
 * The moving element on the hero's balance-card mock.
 *
 * Five styles, all CSS/React. Every overlay is absolutely positioned against
 * the mock, so nothing here can move the page's layout. All copy is rendered
 * as React text — never as HTML.
 *
 * Motion runs only when the admin animation switch is on (`data-mk-anim="on"`
 * on the marketing root) and the visitor has not asked for reduced motion.
 * Otherwise each style shows a still, complete state.
 */

/** True once mounted inside `[data-mk-anim="on"]` with motion allowed. */
export function useHeroMotion(ref: RefObject<HTMLElement | null>): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => setOk(!mq.matches && !!el.closest('[data-mk-anim="on"]'));
    const raf = window.requestAnimationFrame(check);
    mq.addEventListener?.("change", check);
    return () => {
      window.cancelAnimationFrame(raf);
      mq.removeEventListener?.("change", check);
    };
  }, [ref]);
  return ok;
}

/** Which style is showing now — rotates when the admin asked for it. */
export function useActiveHeroStyle(a: HeroAnimation, motion: boolean): HeroAnimationStyle {
  const list = a.rotate && a.rotateStyles.length > 0 ? a.rotateStyles : [a.style];
  const [i, setI] = useState(0);
  const key = list.join(",");
  useEffect(() => {
    if (!motion || list.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % list.length), a.intervalSec * 1000);
    return () => window.clearInterval(t);
    // `key` stands in for `list`, which is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, motion, a.intervalSec]);
  return list[i % list.length] ?? a.style;
}

const TICK_MS = 2400;

/** Counts up while `run`; returns how many steps have been added. */
function useTicks(run: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const t = window.setInterval(() => setN((x) => x + 1), TICK_MS);
    return () => window.clearInterval(t);
  }, [run]);
  return n;
}

/** The balance figure inside the gradient card. Counts up in "ticker" style. */
export function HeroBalance({
  a,
  active,
  motion,
}: {
  a: HeroAnimation;
  active: HeroAnimationStyle;
  motion: boolean;
}) {
  const run = motion && active === "ticker";
  const ticks = useTicks(run);
  const n = run ? ticks : 0;
  const value = a.ticker.start + n * a.ticker.step;
  return (
    <span className="relative block w-fit">
      <span key={run ? `b${n}` : "b"} className={"mk-figure block text-3xl mt-1" + (run && n > 0 ? " mk-ha-glow" : "")}>
        {heroMoney(a.currency, value)}
      </span>
      {run && n > 0 && (
        <span
          key={`f${n}`}
          aria-hidden
          className="mk-ha-float mk-figure pointer-events-none absolute left-full top-0 ml-2 whitespace-nowrap rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]"
        >
          +{heroMoney(a.currency, a.ticker.step)}
        </span>
      )}
    </span>
  );
}

/** The chip / mini-card hanging off the mock's lower-left corner. */
export function HeroAnimationOverlay({
  a,
  active,
  motion,
}: {
  a: HeroAnimation;
  active: HeroAnimationStyle;
  motion: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-4 -left-2 sm:-left-6 max-w-[calc(100%-0.5rem)]"
    >
      {/* Fade only on a rotation swap, so the default chip moves exactly as before. */}
      <div key={active} className={a.rotate ? "mk-ha-swap" : undefined}>
        {active === "task" && <TaskChip a={a} />}
        {active === "ticker" && <TickerChip a={a} motion={motion} />}
        {active === "feed" && <FeedStack a={a} motion={motion} />}
        {active === "withdrawal" && <WithdrawalCard a={a} />}
        {active === "coins" && <CoinsCard a={a} />}
      </div>
    </div>
  );
}

/** The original "Task approved +$0.42" chip — unchanged markup and motion. */
function TaskChip({ a }: { a: HeroAnimation }) {
  return (
    <div className="mk-ticker mk-card rounded-2xl px-3 py-2 flex items-center gap-2">
      <span className="w-7 h-7 rounded-full bg-(--mk-success-soft) flex items-center justify-center">
        <CheckCircle2 className="w-4 h-4 text-(--mk-success)" />
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-bold text-(--mk-text)">{a.task.label}</span>
        <span className="mk-figure block text-[11px] text-(--mk-success)">
          +{heroMoney(a.currency, a.task.amount)}
        </span>
      </span>
    </div>
  );
}

function TickerChip({ a, motion }: { a: HeroAnimation; motion: boolean }) {
  const n = useTicks(motion);
  return (
    <div className="mk-card rounded-2xl px-3 py-2 flex items-center gap-2 w-[180px]">
      <span className="relative w-7 h-7 shrink-0 rounded-full bg-(--mk-success-soft) flex items-center justify-center">
        <TrendingUp className="w-4 h-4 text-(--mk-success)" />
        <span className="mk-ha-dot absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-(--mk-success)" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11px] font-bold text-(--mk-text)">{a.ticker.label}</span>
        <span className="mk-figure block text-[11px] text-(--mk-success)">
          +{heroMoney(a.currency, Math.max(1, n) * a.ticker.step)}
        </span>
      </span>
    </div>
  );
}

const FEED_MS = 1900;

/** Two notification chips; a new one slides in under the other, cycling. */
function FeedStack({ a, motion }: { a: HeroAnimation; motion: boolean }) {
  const items = a.feed.items;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!motion || items.length < 2) return;
    const t = window.setInterval(() => setI((x) => x + 1), FEED_MS);
    return () => window.clearInterval(t);
  }, [motion, items.length]);
  const len = items.length;
  // Newest last. Both chips remount on every step: the older one glides up
  // into the top slot, the new one slides in below it.
  const shown = len < 2 ? [0] : [i, i + 1];
  return (
    <div className="flex h-[82px] w-[214px] max-w-full flex-col justify-end gap-1.5">
      {shown.map((abs) => {
        const it = items[abs % len];
        if (!it) return null;
        const out = it.kind === "out";
        const isNew = abs === shown[shown.length - 1];
        return (
          <div
            key={`${abs}-${isNew ? "new" : "old"}`}
            className={`${isNew ? "mk-ha-slide" : "mk-ha-up"} mk-card rounded-2xl px-3 h-[38px] flex items-center gap-2`}
          >
            <span className="w-6 h-6 shrink-0 rounded-full bg-(--mk-success-soft) flex items-center justify-center text-(--mk-success)">
              {out ? <Send className="w-3.5 h-3.5" /> : <Gift className="w-3.5 h-3.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-(--mk-text)">
              {it.text}
            </span>
            <span className="mk-figure shrink-0 inline-flex items-center gap-0.5 text-[11px] text-(--mk-success)">
              {out ? "" : "+"}
              {heroMoney(a.currency, it.amount)}
              {out && <Check className="w-3 h-3" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Method → progress → "Paid $25.00" with a check. One CSS loop. */
function WithdrawalCard({ a }: { a: HeroAnimation }) {
  const w = a.withdrawal;
  const amt = heroMoney(a.currency, w.amount);
  return (
    <div className="mk-card rounded-2xl p-2.5 w-[214px] max-w-full">
      <div className="flex items-center gap-2">
        <span className="h-7 min-w-7 shrink-0 rounded-lg bg-(--mk-accent-soft) border border-(--mk-accent-soft-border) px-1.5 flex items-center justify-center text-[10px] font-extrabold text-(--mk-accent)">
          {w.method.slice(0, 2).toUpperCase()}
        </span>
        <span className="relative min-w-0 flex-1 h-[30px] leading-tight">
          <span className="mk-ha-wd-pending absolute inset-0">
            <span className="block truncate text-[11px] font-bold text-(--mk-text)">{w.pendingLabel}</span>
            <span className="block truncate text-[11px] text-(--mk-subtle)">
              {amt} · {w.method}
            </span>
          </span>
          <span className="mk-ha-wd-done absolute inset-0">
            <span className="block truncate text-[11px] font-bold text-(--mk-text)">
              {w.doneLabel} <span className="mk-figure text-(--mk-success)">{amt}</span>
            </span>
            <span className="block truncate text-[11px] text-(--mk-subtle)">{w.method}</span>
          </span>
        </span>
        <span className="mk-ha-wd-check w-6 h-6 shrink-0 rounded-full bg-(--mk-success) flex items-center justify-center text-white">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-(--mk-border) overflow-hidden">
        <div className="mk-ha-wd-bar h-full w-full rounded-full bg-(--mk-success)" />
      </div>
    </div>
  );
}

/** Coins pop "+50 pts" over an XP bar that fills. */
function CoinsCard({ a }: { a: HeroAnimation }) {
  const c = a.coins;
  return (
    <div className="mk-card relative rounded-2xl p-2.5 w-[200px] max-w-full">
      <div className="absolute -top-1 left-0 right-0 h-0">
        {[0, 1, 2].map((k) => (
          <span
            key={k}
            className={`mk-ha-coin mk-ha-coin-${k} absolute bottom-0 inline-flex items-center gap-1 whitespace-nowrap`}
            style={{ left: `${4 + k * 26}%` }}
          >
            <span className="mk-card inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2">
              <span className="w-5 h-5 rounded-full bg-(--mk-coin) text-white flex items-center justify-center">
                <Coins className="w-3 h-3" />
              </span>
              <span className="mk-figure text-[11px] text-(--mk-coin-text)">+{c.points} pts</span>
            </span>
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-(--mk-text) truncate">{c.label}</span>
        <span className="mk-figure text-(--mk-subtle)">{c.level}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-(--mk-border) overflow-hidden">
        <div className="mk-ha-xp h-full w-full rounded-full bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b)" />
      </div>
    </div>
  );
}

/** For the admin editor: one style, isolated, in a themed sandbox. */
export function HeroAnimationPreview({
  a,
  style,
  theme = "dark",
}: {
  a: HeroAnimation;
  style: HeroAnimationStyle;
  theme?: "light" | "dark";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const motion = useHeroMotion(ref);
  return (
    <div
      ref={ref}
      data-mk-theme={theme}
      data-mk-anim="on"
      className="relative rounded-xl bg-(--mk-bg) border border-(--mk-border) p-3 h-[200px] overflow-hidden"
    >
      <div className="relative mx-auto w-[240px] max-w-full">
        <div className="rounded-2xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) p-3 text-white h-[110px]">
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/80">
            Available balance
          </div>
          <HeroBalance a={a} active={style} motion={motion} />
        </div>
        <HeroAnimationOverlay a={a} active={style} motion={motion} />
      </div>
    </div>
  );
}
