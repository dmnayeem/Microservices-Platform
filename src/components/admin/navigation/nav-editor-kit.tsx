"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Save, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { USER_PAGES } from "@/lib/page-visibility";
import { NAV_ICON_OPTIONS, NavIcon } from "@/lib/nav-icons";
import { hrefProblem } from "@/lib/nav-config";
import { FEATURES } from "@/lib/features";

export const inputCls =
  "w-full min-w-0 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60";

/** A fresh id for a new row. `crypto.randomUUID` needs a secure context. */
export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(index, 1);
  next.splice(to, 0, it);
  return next;
}

// ── Save ─────────────────────────────────────────────────────────────────────

/** POST one navigation key; shows every validation problem the server found. */
export function useNavSave(key: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (value: unknown): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings/navigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        problems?: string[];
      };
      if (!res.ok) {
        toast.error(d.error ?? `Save failed (HTTP ${res.status})`, {
          description:
            d.problems && d.problems.length > 1
              ? d.problems.slice(1, 4).join(" ")
              : undefined,
        });
        return false;
      }
      toast.success("Saved — users see it on their next page load");
      router.refresh();
      return true;
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
}

export function SaveBar({
  canEdit,
  busy,
  onSave,
  onReset,
  problems,
}: {
  canEdit: boolean;
  busy: boolean;
  onSave: () => void;
  onReset: () => void;
  problems: string[];
}) {
  if (!canEdit) {
    return (
      <p className="text-xs text-slate-500">
        You can view this menu but not change it (needs settings.edit).
      </p>
    );
  }
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/95 px-4 py-3">
      {problems.length > 0 && (
        <p className="mr-auto min-w-0 flex-1 basis-full text-xs text-amber-300 sm:basis-auto">
          {problems[0]}
          {problems.length > 1 && ` (+${problems.length - 1} more)`}
        </p>
      )}
      <button
        type="button"
        onClick={onReset}
        disabled={busy}
        className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        Reset to default
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || problems.length > 0}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ── Reorder ──────────────────────────────────────────────────────────────────

export function MoveButtons({
  index,
  count,
  onMove,
  disabled,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  disabled?: boolean;
}) {
  const btn =
    "grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex shrink-0 flex-col">
      <button
        type="button"
        aria-label="Move up"
        onClick={() => onMove(-1)}
        disabled={disabled || index === 0}
        className={btn}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Move down"
        onClick={() => onMove(1)}
        disabled={disabled || index === count - 1}
        className={btn}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Icon picker ──────────────────────────────────────────────────────────────

/**
 * A button showing the chosen icon; opens an inline, searchable grid of every
 * icon in the shared registry. Inline (not a floating popover) so it can never
 * run off the side of a 320px screen.
 */
export function IconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const label = NAV_ICON_OPTIONS.find((o) => o.key === value)?.label ?? value;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? NAV_ICON_OPTIONS.filter(
          (o) => o.label.toLowerCase().includes(t) || o.key.toLowerCase().includes(t)
        )
      : NAV_ICON_OPTIONS;
  }, [q]);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        className={cn(inputCls, "flex items-center gap-2 text-left")}
      >
        <NavIcon iconKey={value} className="h-4 w-4 shrink-0 text-slate-200" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950 p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search icons…"
              aria-label="Search icons"
              className={cn(inputCls, "py-1.5 pl-8")}
            />
          </div>
          <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 overflow-y-auto">
            {shown.map((o) => {
              return (
                <button
                  key={o.key}
                  type="button"
                  title={o.label}
                  aria-label={o.label}
                  aria-pressed={o.key === value}
                  onClick={() => {
                    onChange(o.key);
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "grid h-11 place-items-center rounded-lg border",
                    o.key === value
                      ? "border-indigo-400 bg-indigo-500/20 text-white"
                      : "border-transparent text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <NavIcon iconKey={o.key} className="h-5 w-5" />
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="col-span-full py-3 text-center text-xs text-slate-500">
                No icon matches “{q}”.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page picker ──────────────────────────────────────────────────────────────

const CUSTOM = "__custom__";

/** Pages a user can reach that are not in the visibility catalog. */
const EXTRA_PAGES = [
  { path: "/settings", label: "Settings", group: "Always available" },
  { path: "/tutor/dashboard", label: "Tutor Hub", group: "Always available" },
];

const PAGE_GROUPS: { group: string; pages: { path: string; label: string }[] }[] = (() => {
  const map = new Map<string, { path: string; label: string }[]>();
  for (const p of [...USER_PAGES, ...EXTRA_PAGES]) {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push({ path: p.path, label: p.label });
  }
  return Array.from(map, ([group, pages]) => ({ group, pages }));
})();

const KNOWN_PATHS = new Set(PAGE_GROUPS.flatMap((g) => g.pages.map((p) => p.path)));

export function pageLabel(href: string): string | undefined {
  for (const g of PAGE_GROUPS) {
    const p = g.pages.find((x) => x.path === href);
    if (p) return p.label;
  }
  return undefined;
}

/**
 * Grouped select over every user page (the same catalog page visibility
 * uses), plus "Custom URL…" for a deep link or an https address.
 */
export function PagePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (href: string) => void;
  disabled?: boolean;
}) {
  const [customPicked, setCustom] = useState(false);
  // Anything that is not a catalog page (a deep link, an https address, an
  // empty new row) is edited as a custom URL.
  const custom = customPicked || !KNOWN_PATHS.has(value);
  const problem = custom ? hrefProblem(value) : null;
  return (
    <div className="min-w-0 space-y-1.5">
      <select
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        disabled={disabled}
        aria-label="Page"
        className={inputCls}
      >
        {PAGE_GROUPS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.pages.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label} ({p.path})
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Custom URL…</option>
      </select>
      {custom && (
        <div className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="/earn?tab=x  or  https://…"
            disabled={disabled}
            aria-label="Custom URL"
            aria-invalid={!!problem}
            className={cn(inputCls, problem && "border-amber-500")}
          />
          <button
            type="button"
            aria-label="Back to the page list"
            onClick={() => {
              setCustom(false);
              if (!KNOWN_PATHS.has(value)) onChange("/dashboard");
            }}
            disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {problem && <p className="text-[11px] text-amber-300">Link {problem}.</p>}
    </div>
  );
}

// ── Feature picker ───────────────────────────────────────────────────────────

export function FeaturePicker({
  value,
  onChange,
  disabled,
}: {
  value: string | undefined;
  onChange: (feature: string | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      disabled={disabled}
      aria-label="Only for users with feature"
      className={inputCls}
    >
      <option value="">Everyone (no feature needed)</option>
      {FEATURES.map((f) => (
        <option key={f.key} value={f.key}>
          Needs: {f.label}
        </option>
      ))}
    </select>
  );
}

// ── Preview frame ────────────────────────────────────────────────────────────

export function PreviewFrame({
  title,
  children,
  width = 360,
}: {
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div
        className="mx-auto w-full overflow-hidden rounded-2xl border border-slate-700 bg-[#0b0f1a]"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  );
}
