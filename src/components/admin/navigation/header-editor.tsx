"use client";

import { useState } from "react";
import {
  Bell,
  Eye,
  EyeOff,
  Flame,
  Lock,
  Menu,
  Moon,
  Plus,
  Search,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavIcon } from "@/lib/nav-icons";
import {
  DEFAULT_HEADER,
  HEADER_BUILTINS,
  HEADER_LABEL_MAX,
  HEADER_SHORTCUT_MAX,
  NAV_KEYS,
  navSettingProblems,
  type HeaderConfig,
  type HeaderItem,
} from "@/lib/nav-config";
import {
  IconPicker,
  MoveButtons,
  PagePicker,
  PreviewFrame,
  SaveBar,
  inputCls,
  moveItem,
  newId,
  useNavSave,
} from "./nav-editor-kit";

const BUILTIN_ICON: Record<string, LucideIcon> = {
  search: Search,
  wallet: Wallet,
  streak: Flame,
  theme: Moon,
  notifications: Bell,
};

/**
 * Which items the real header draws at a given width — the same breakpoints
 * header.tsx uses (wallet from 640px, streak and the search box from 768px,
 * the first shortcut from 360px, the others from 640px).
 */
function shownAt(items: HeaderItem[], width: number): HeaderItem[] {
  const firstShortcut = items.find((i) => i.visible && i.kind === "shortcut")?.id;
  return items.filter((i) => {
    if (!i.visible) return false;
    switch (i.kind) {
      case "wallet":
        return width >= 640;
      case "streak":
        return width >= 768;
      case "search":
        return width < 768; // the phone magnifier; desktop gets the box
      case "shortcut":
        return i.id === firstShortcut ? width >= 360 : width >= 640;
      default:
        return true;
    }
  });
}

function MockRow({ items, width }: { items: HeaderItem[]; width: number }) {
  const phone = width < 768;
  const shown = shownAt(items, width);
  const searchBox = !phone && items.some((i) => i.kind === "search" && i.visible);
  return (
    <PreviewFrame title={phone ? `Phone (${width}px)` : "Desktop"} width={phone ? width : 720}>
      <div className="flex h-14 items-center justify-between gap-1 border-b border-slate-800 bg-slate-900 px-2">
        <div className="flex min-w-0 items-center gap-1">
          {phone && <Menu className="m-2.5 h-5 w-5 shrink-0 text-slate-400" />}
          {phone && <span className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />}
          {searchBox && (
            <span className="flex h-9 w-56 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-500">
              <Search className="h-4 w-4" /> Search…
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {shown.map((i) => {
            if (i.kind === "wallet") {
              return (
                <span key={i.id} className="mx-0.5 flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs font-extrabold text-white">
                  <Wallet className="h-3.5 w-3.5 text-slate-400" /> 1,250
                </span>
              );
            }
            if (i.kind === "streak") {
              return (
                <span key={i.id} className="mx-0.5 flex h-8 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 text-xs font-extrabold text-amber-300">
                  <Flame className="h-3.5 w-3.5" /> 4d
                </span>
              );
            }
            return (
              <span key={i.id} title={i.label} className="grid h-11 w-11 place-items-center text-slate-300">
                <NavIcon iconKey={i.kind === "shortcut" ? i.icon : null} fallback={BUILTIN_ICON[i.kind]} className="h-5 w-5" />
              </span>
            );
          })}
          <span className="ml-0.5 grid h-11 w-11 place-items-center">
            <span className="h-8 w-8 rounded-full bg-slate-600" />
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function HeaderEditor({
  initial,
  canEdit,
}: {
  initial: HeaderConfig;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<HeaderItem[]>(initial.items);
  const { save, busy } = useNavSave(NAV_KEYS.header);
  const value: HeaderConfig = { items };
  const problems = navSettingProblems(NAV_KEYS.header, value);
  const shortcuts = items.filter((i) => i.kind === "shortcut").length;
  const patch = (id: string, p: Partial<HeaderItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section className="min-w-0 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-400">
            <p>
              The right-hand side of the top bar, in order. Fixed and not listed here:
              the phone&apos;s back arrow, menu button and logo on the left, and the{" "}
              <strong className="text-slate-200">account menu</strong> (avatar), which
              is always last — it holds Profile, Settings and Sign Out.
            </p>
            <p className="mt-1.5">
              The <strong className="text-slate-200">notifications bell</strong> can be
              moved but not hidden: on a tablet or desktop it is the only live unread
              count, and its dropdown is where &ldquo;Mark all read&rdquo; lives.
            </p>
            <p className="mt-1.5">
              Up to {HEADER_SHORTCUT_MAX} shortcut icons. A 320px phone has no room for
              any: the first shortcut appears from 360px wide, the rest from 640px.
            </p>
          </div>
          <ol className="space-y-2">
            {items.map((item, idx) => {
              const builtin = HEADER_BUILTINS.find((b) => b.kind === item.kind);
              return (
                <li key={item.id} className={cn("rounded-xl glass p-3", !item.visible && "opacity-60")}>
                  <div className="flex gap-2">
                    <MoveButtons
                      index={idx}
                      count={items.length}
                      disabled={!canEdit}
                      onMove={(d) => setItems((prev) => moveItem(prev, idx, d))}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <NavIcon iconKey={item.kind === "shortcut" ? item.icon : null} fallback={BUILTIN_ICON[item.kind]} className="h-4 w-4 shrink-0 text-slate-300" />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                          {builtin ? builtin.label : `Shortcut: ${item.label || "…"}`}
                        </p>
                        {builtin?.locked ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 text-[11px] font-bold text-slate-400">
                            <Lock className="h-3.5 w-3.5" /> Always shown
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => patch(item.id, { visible: !item.visible })}
                            disabled={!canEdit}
                            aria-label={item.visible ? "Shown — click to hide" : "Hidden — click to show"}
                            className={cn(
                              "shrink-0 rounded-lg p-2 disabled:opacity-50",
                              item.visible ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
                            )}
                          >
                            {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                        )}
                        {item.kind === "shortcut" && (
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                            disabled={!canEdit}
                            aria-label="Remove shortcut"
                            className="shrink-0 rounded-lg bg-slate-800 p-2 text-red-400 hover:bg-slate-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {builtin && <p className="text-[11px] leading-snug text-slate-500">{builtin.note}</p>}
                      {item.kind === "shortcut" && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            value={item.label ?? ""}
                            onChange={(e) => patch(item.id, { label: e.target.value })}
                            maxLength={HEADER_LABEL_MAX}
                            placeholder="Tooltip label"
                            aria-label="Tooltip label"
                            disabled={!canEdit}
                            className={inputCls}
                          />
                          <PagePicker value={item.href ?? ""} onChange={(href) => patch(item.id, { href })} disabled={!canEdit} />
                          <IconPicker value={item.icon ?? "zap"} onChange={(icon) => patch(item.id, { icon })} disabled={!canEdit} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {canEdit && shortcuts < HEADER_SHORTCUT_MAX && (
            <button
              type="button"
              onClick={() =>
                setItems((prev) => {
                  // New shortcuts go just before the bell, where they read as
                  // part of the action cluster.
                  const at = prev.findIndex((i) => i.kind === "notifications");
                  const next = [...prev];
                  next.splice(at === -1 ? next.length : at, 0, {
                    id: newId("hdr-sc"),
                    kind: "shortcut",
                    visible: true,
                    label: "Leaderboard",
                    href: "/leaderboard",
                    icon: "trophy",
                  });
                  return next;
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add shortcut ({shortcuts}/{HEADER_SHORTCUT_MAX})
            </button>
          )}
          <SaveBar
            canEdit={canEdit}
            busy={busy}
            problems={problems}
            onSave={() => void save(value)}
            onReset={() => setItems(DEFAULT_HEADER.items)}
          />
        </section>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <MockRow items={items} width={320} />
          <MockRow items={items} width={375} />
        </aside>
      </div>
      <MockRow items={items} width={1280} />
    </div>
  );
}
