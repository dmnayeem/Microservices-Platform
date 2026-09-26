"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

export const inpSm =
  "w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-6 space-y-4">
      {(title || description) && (
        <div className="border-b border-slate-800 pb-3">
          {title && <p className="text-sm font-bold text-white">{title}</p>}
          {description && (
            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

interface RepeatingListProps<T> {
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, idx: number) => ReactNode;
  addLabel?: string;
  minItems?: number;
  disabled?: boolean;
  itemTitle?: (item: T, idx: number) => string;
}

export function RepeatingList<T>({
  items,
  onChange,
  newItem,
  render,
  addLabel = "+ Add Item",
  minItems = 0,
  disabled = false,
  itemTitle,
}: RepeatingListProps<T>) {
  const update = (idx: number, patch: Partial<T>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const remove = (idx: number) => {
    if (items.length <= minItems) return;
    onChange(items.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange(next);
  };
  const add = () => {
    onChange([...items, newItem()]);
  };
  // Hide without deleting: the item stays here, but the site does not show
  // it (publicLanding drops it). Save the section to apply.
  const isHidden = (it: T) => !!(it as { hidden?: boolean }).hidden;
  const toggleHidden = (idx: number) =>
    update(idx, { hidden: !isHidden(items[idx]) } as unknown as Partial<T>);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className={
            "rounded-lg border p-3 " +
            (isHidden(item) ? "border-dashed border-slate-700 bg-slate-950/40" : "border-slate-800 bg-slate-950")
          }
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {itemTitle ? itemTitle(item, i) : `#${i + 1}`}
              {isHidden(item) && (
                <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">Hidden</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleHidden(i)}
                disabled={disabled}
                className={
                  "p-1 disabled:opacity-30 disabled:cursor-not-allowed " +
                  (isHidden(item) ? "text-amber-400 hover:text-amber-300" : "text-slate-500 hover:text-white")
                }
                title={isHidden(item) ? "Hidden on the site — click to show" : "Shown on the site — click to hide"}
                aria-label={isHidden(item) ? "Show this item" : "Hide this item"}
              >
                {isHidden(item) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={disabled || i === 0}
                className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={disabled || i === items.length - 1}
                className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled || items.length <= minItems}
                className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                title={
                  items.length <= minItems
                    ? `At least ${minItems} required`
                    : "Remove"
                }
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className={isHidden(item) ? "opacity-50" : undefined}>
            {render(item, (patch) => update(i, patch), i)}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

export function StringListEditor({
  items,
  onChange,
  placeholder = "Type and press Enter…",
  disabled = false,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const update = (idx: number, value: string) => {
    onChange(items.map((it, i) => (i === idx ? value : it)));
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const add = () => {
    onChange([...items, ""]);
  };
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono w-6 text-right">
            {i + 1}.
          </span>
          <input
            value={it}
            onChange={(e) => update(i, e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className={inpSm}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={disabled}
            className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-30"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md disabled:opacity-50"
      >
        <Plus className="w-3 h-3" />
        Add
      </button>
    </div>
  );
}

const HERO_ICON_KEYS = [
  "Users",
  "DollarSign",
  "CheckCircle",
  "Star",
  "Trophy",
  "Sparkles",
  "TrendingUp",
  "Zap",
];
const FEATURE_ICON_KEYS = [
  "Pin",
  "Video",
  "FileText",
  "ClipboardList",
  "Send",
  "Users",
  "Globe",
  "Trophy",
  "Sparkles",
  "Gift",
  "Wallet",
  "Smartphone",
];
const STEP_ICON_KEYS = [
  "UserPlus",
  "ListTodo",
  "Coins",
  "Wallet",
  "CheckCircle",
  "Send",
  "Sparkles",
];
const TRUST_ICON_KEYS = [
  "Shield",
  "Lock",
  "Globe",
  "Trophy",
  "BadgeCheck",
  "Headphones",
];
const PACKAGE_ICON_KEYS = ["Zap", "Star", "Sparkles", "Crown", "Trophy"];

export const ICON_KEYS_BY_GROUP = {
  hero: HERO_ICON_KEYS,
  feature: FEATURE_ICON_KEYS,
  step: STEP_ICON_KEYS,
  trust: TRUST_ICON_KEYS,
  package: PACKAGE_ICON_KEYS,
} as const;

export function IconKeyPicker({
  value,
  onChange,
  group,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  group: keyof typeof ICON_KEYS_BY_GROUP;
  disabled?: boolean;
}) {
  const opts = ICON_KEYS_BY_GROUP[group];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inpSm}
    >
      {!opts.includes(value) && <option value={value}>{value} (custom)</option>}
      {opts.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  );
}

const GRADIENT_PRESETS = [
  "from-blue-500 to-indigo-600",
  "from-indigo-500 to-purple-600",
  "from-purple-500 to-pink-500",
  "from-pink-500 to-rose-500",
  "from-red-500 to-pink-600",
  "from-amber-500 to-orange-500",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-emerald-500 to-teal-500",
  "from-cyan-500 to-blue-500",
  "from-cyan-500 to-blue-600",
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-violet-500",
  "from-purple-500 to-violet-600",
  "from-gray-600 to-gray-700",
  "from-indigo-500 to-indigo-600",
  "from-blue-500 to-blue-600",
];

export function GradientPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inpSm}
    >
      {!GRADIENT_PRESETS.includes(value) && (
        <option value={value}>{value} (custom)</option>
      )}
      {GRADIENT_PRESETS.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}
