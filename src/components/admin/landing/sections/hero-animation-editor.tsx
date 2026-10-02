"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  HERO_ANIMATION_LABELS,
  HERO_ANIMATION_STYLES,
  HERO_ANIM_LIMITS as L,
  normalizeHeroAnimation,
  type HeroAnimation,
  type HeroAnimationStyle,
} from "@/lib/landing-content";
import { HeroAnimationPreview } from "@/components/landing/hero-animations";
import { Field, SectionCard, inpSm } from "../_shared";

interface Props {
  value: HeroAnimation | undefined;
  onChange: (next: HeroAnimation) => void;
  disabled?: boolean;
}

/** Number input value → number; empty / junk → 0 (the save route clamps). */
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Hero → Balance card animation. Picks the moving element on the hero's
 * balance-card mock, optional rotation, and the sample copy for each style.
 * Everything is clamped again on save (normalizeHeroAnimation) and rendered
 * as plain text on the site.
 */
export function HeroAnimationEditor({ value, onChange, disabled }: Props) {
  // Old content has no `animation` — show (and save) the defaults. Raw values
  // win while editing so a field can be cleared and retyped; the preview and
  // the save route see the normalized form.
  const base = normalizeHeroAnimation(value);
  const a: HeroAnimation = value ? { ...base, ...value } : base;
  const [previewStyle, setPreviewStyle] = useState<HeroAnimationStyle | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const set = (patch: Partial<HeroAnimation>) => onChange({ ...a, ...patch });

  const inUse = new Set<HeroAnimationStyle>(a.rotate ? a.rotateStyles : [a.style]);
  const shown: HeroAnimationStyle =
    previewStyle && inUse.has(previewStyle) ? previewStyle : a.rotate ? a.rotateStyles[0] ?? a.style : a.style;

  const toggleRotateStyle = (s: HeroAnimationStyle) => {
    const has = a.rotateStyles.includes(s);
    if (has && a.rotateStyles.length <= 1) return; // keep at least one
    const next = has
      ? a.rotateStyles.filter((x) => x !== s)
      : HERO_ANIMATION_STYLES.filter((x) => x === s || a.rotateStyles.includes(x));
    set({ rotateStyles: next });
  };

  return (
    <SectionCard
      title="Balance card animation"
      description="The moving element under the balance card in the hero. Shows still for visitors who prefer reduced motion, or when Appearance → animations is off."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 min-w-0">
          <Field label="Style">
            <select
              value={a.style}
              onChange={(e) => {
                set({ style: e.target.value as HeroAnimationStyle });
                setPreviewStyle(e.target.value as HeroAnimationStyle);
              }}
              disabled={disabled || a.rotate}
              className={inpSm}
            >
              {HERO_ANIMATION_STYLES.map((s) => (
                <option key={s} value={s}>
                  {HERO_ANIMATION_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={a.rotate}
              onChange={(e) => set({ rotate: e.target.checked })}
              disabled={disabled}
              className="h-4 w-4 accent-blue-500"
            />
            Rotate between selected styles
          </label>

          {a.rotate && (
            <div className="rounded-lg border border-slate-800 p-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {HERO_ANIMATION_STYLES.map((s) => {
                  const on = a.rotateStyles.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        toggleRotateStyle(s);
                        setPreviewStyle(s);
                      }}
                      disabled={disabled}
                      aria-pressed={on}
                      className={
                        "rounded-full border px-3 py-1 text-xs font-medium " +
                        (on
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-200"
                          : "border-slate-700 text-slate-400 hover:text-white")
                      }
                    >
                      {HERO_ANIMATION_LABELS[s]}
                    </button>
                  );
                })}
              </div>
              <Field
                label="Seconds per style"
                hint={`${L.intervalMin}–${L.intervalMax} seconds.`}
              >
                <input
                  type="number"
                  min={L.intervalMin}
                  max={L.intervalMax}
                  step={1}
                  value={a.intervalSec}
                  onChange={(e) =>
                    set({
                      intervalSec: Math.round(
                        Math.min(L.intervalMax, Math.max(L.intervalMin, num(e.target.value)))
                      ),
                    })
                  }
                  disabled={disabled}
                  className={inpSm + " max-w-[120px]"}
                />
              </Field>
            </div>
          )}

          <Field label="Currency symbol" hint={`Up to ${L.currency} characters, e.g. $, ৳, €.`}>
            <input
              value={a.currency}
              maxLength={L.currency}
              onChange={(e) => set({ currency: e.target.value })}
              disabled={disabled}
              className={inpSm + " max-w-[120px]"}
            />
          </Field>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-300 truncate">
              Preview · {HERO_ANIMATION_LABELS[shown]}
            </p>
            <div className="flex shrink-0 rounded-md border border-slate-700 text-[11px]">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={
                    "px-2 py-0.5 capitalize " +
                    (theme === t ? "bg-slate-700 text-white" : "text-slate-400")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <HeroAnimationPreview a={base} style={shown} theme={theme} />
        </div>
      </div>

      {/* Sample copy — only for the styles in use */}
      <div className="space-y-3">
        {inUse.has("task") && (
          <Group title={HERO_ANIMATION_LABELS.task} onFocus={() => setPreviewStyle("task")}>
            <TextField label="Label" value={a.task.label} max={L.text} disabled={disabled}
              onChange={(v) => set({ task: { ...a.task, label: v } })} />
            <NumField label="Amount" value={a.task.amount} disabled={disabled}
              onChange={(v) => set({ task: { ...a.task, amount: v } })} />
          </Group>
        )}
        {inUse.has("ticker") && (
          <Group title={HERO_ANIMATION_LABELS.ticker} onFocus={() => setPreviewStyle("ticker")}>
            <TextField label="Chip label" value={a.ticker.label} max={L.text} disabled={disabled}
              onChange={(v) => set({ ticker: { ...a.ticker, label: v } })} />
            <NumField label="Starting balance" value={a.ticker.start} disabled={disabled}
              hint="Also the balance shown on the card."
              onChange={(v) => set({ ticker: { ...a.ticker, start: v } })} />
            <NumField label="Increment" value={a.ticker.step} disabled={disabled} min={0.01} max={1000}
              onChange={(v) => set({ ticker: { ...a.ticker, step: v } })} />
          </Group>
        )}
        {inUse.has("feed") && (
          <Group title={HERO_ANIMATION_LABELS.feed} onFocus={() => setPreviewStyle("feed")} wide>
            <div className="space-y-2">
              {a.feed.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_84px_120px_32px] gap-2 items-center">
                  <input
                    value={it.text}
                    maxLength={L.text}
                    placeholder="Survey completed"
                    onChange={(e) => {
                      const items = a.feed.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x));
                      set({ feed: { items } });
                    }}
                    disabled={disabled}
                    className={inpSm}
                  />
                  <input
                    type="number"
                    min={0}
                    max={L.amountMax}
                    step={0.01}
                    value={it.amount}
                    onChange={(e) => {
                      const items = a.feed.items.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x));
                      set({ feed: { items } });
                    }}
                    disabled={disabled}
                    className={inpSm}
                  />
                  <select
                    value={it.kind}
                    onChange={(e) => {
                      const items = a.feed.items.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value === "out" ? ("out" as const) : ("in" as const) } : x
                      );
                      set({ feed: { items } });
                    }}
                    disabled={disabled}
                    className={inpSm}
                  >
                    <option value="in">Earned +</option>
                    <option value="out">Paid out ✓</option>
                  </select>
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => set({ feed: { items: a.feed.items.filter((_, j) => j !== i) } })}
                    disabled={disabled || a.feed.items.length <= 1}
                    className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-400 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {a.feed.items.length < L.feedMax && (
                <button
                  type="button"
                  onClick={() =>
                    set({ feed: { items: [...a.feed.items, { text: "Task approved", amount: 0.5, kind: "in" }] } })
                  }
                  disabled={disabled}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
                >
                  <Plus className="w-3.5 h-3.5" /> Add item (max {L.feedMax})
                </button>
              )}
            </div>
          </Group>
        )}
        {inUse.has("withdrawal") && (
          <Group title={HERO_ANIMATION_LABELS.withdrawal} onFocus={() => setPreviewStyle("withdrawal")}>
            <TextField label="Method" value={a.withdrawal.method} max={L.short} disabled={disabled}
              onChange={(v) => set({ withdrawal: { ...a.withdrawal, method: v } })} />
            <NumField label="Amount" value={a.withdrawal.amount} disabled={disabled}
              onChange={(v) => set({ withdrawal: { ...a.withdrawal, amount: v } })} />
            <TextField label="While sending" value={a.withdrawal.pendingLabel} max={L.text} disabled={disabled}
              onChange={(v) => set({ withdrawal: { ...a.withdrawal, pendingLabel: v } })} />
            <TextField label="Done label" value={a.withdrawal.doneLabel} max={L.short} disabled={disabled}
              onChange={(v) => set({ withdrawal: { ...a.withdrawal, doneLabel: v } })} />
          </Group>
        )}
        {inUse.has("coins") && (
          <Group title={HERO_ANIMATION_LABELS.coins} onFocus={() => setPreviewStyle("coins")}>
            <TextField label="Level label" value={a.coins.label} max={L.short} disabled={disabled}
              onChange={(v) => set({ coins: { ...a.coins, label: v } })} />
            <NumField label="Points per coin" value={a.coins.points} disabled={disabled} min={1} max={L.pointsMax} step={1}
              onChange={(v) => set({ coins: { ...a.coins, points: Math.round(v) } })} />
            <TextField label="Bar caption" value={a.coins.level} max={L.short} disabled={disabled}
              onChange={(v) => set({ coins: { ...a.coins, level: v } })} />
          </Group>
        )}
      </div>
    </SectionCard>
  );
}

function Group({
  title,
  children,
  onFocus,
  wide,
}: {
  title: string;
  children: ReactNode;
  onFocus: () => void;
  wide?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 p-3" onFocusCapture={onFocus}>
      <p className="text-xs font-bold text-slate-200 mb-2">{title}</p>
      <div className={wide ? "" : "grid gap-3 sm:grid-cols-2"}>{children}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={`${value.length}/${max}`}>
      <input
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inpSm}
      />
    </Field>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
  hint,
  min = 0,
  max = L.amountMax,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label} hint={hint ?? `${min}–${max.toLocaleString("en-US")}`}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, num(e.target.value))))}
        disabled={disabled}
        className={inpSm}
      />
    </Field>
  );
}
