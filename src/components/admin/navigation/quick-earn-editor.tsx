"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Eye, EyeOff, GripVertical, Plus, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COLOR_OPTIONS,
  DEFAULT_QUICK_EARN,
  type QuickEarnTile,
} from "@/lib/feed-quick-earn";
import { NavIcon } from "@/lib/nav-icons";
import {
  NAV_KEYS,
  QUICK_EARN_LABEL_MAX,
  QUICK_EARN_MAX,
  navSettingProblems,
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

function TileRow({
  tile,
  index,
  count,
  canEdit,
  onChange,
  onRemove,
  onMove,
}: {
  tile: QuickEarnTile;
  index: number;
  count: number;
  canEdit: boolean;
  onChange: (patch: Partial<QuickEarnTile>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={tile}
      dragListener={false}
      dragControls={controls}
      className={cn("rounded-xl glass p-3", !tile.enabled && "opacity-60")}
    >
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col items-center">
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => canEdit && controls.start(e)}
            disabled={!canEdit}
            className="hidden cursor-grab touch-none rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing disabled:cursor-not-allowed sm:block"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <MoveButtons index={index} count={count} onMove={onMove} disabled={!canEdit} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={tile.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Label"
              maxLength={QUICK_EARN_LABEL_MAX}
              aria-label="Label"
              disabled={!canEdit}
              className={cn(inputCls, "flex-1")}
            />
            <button
              type="button"
              onClick={() => onChange({ enabled: !tile.enabled })}
              disabled={!canEdit}
              aria-label={tile.enabled ? "Shown — click to hide" : "Hidden — click to show"}
              className={cn(
                "shrink-0 rounded-lg p-2 disabled:opacity-50",
                tile.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
              )}
            >
              {tile.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={!canEdit}
              aria-label="Remove tile"
              className="shrink-0 rounded-lg bg-slate-800 p-2 text-red-400 hover:bg-slate-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <PagePicker value={tile.href} onChange={(href) => onChange({ href })} disabled={!canEdit} />
            <IconPicker value={tile.icon} onChange={(icon) => onChange({ icon })} disabled={!canEdit} />
          </div>
          {/* NOT USED. The feed and the sidebar rail render these tiles in the
              app's neutral style — twelve shortcuts in twelve hues was the
              thing the redesign removed — so this no longer changes anything a
              user sees. It stays visible and disabled rather than deleted: the
              stored value is preserved on save, and an admin can see WHY the
              control does nothing. */}
          <div className="min-w-0">
            <select
              value={tile.color}
              disabled
              aria-describedby={`qe-color-note-${tile.id}`}
              title="Not used — tiles render in the app's neutral style"
              className={cn(inputCls, "w-full cursor-not-allowed opacity-60")}
            >
              {COLOR_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <p id={`qe-color-note-${tile.id}`} className="mt-1 text-[11px] leading-tight text-slate-400">
              Colour is no longer used — tiles render in the app&apos;s neutral style.
            </p>
          </div>
        </div>
      </div>
    </Reorder.Item>
  );
}

/** Phone mock of the feed's Quick Earn card (mobile-earn-block.tsx). */
function QuickEarnPreview({ tiles }: { tiles: QuickEarnTile[] }) {
  const shown = tiles.filter((t) => t.enabled);
  return (
    <PreviewFrame title="Phone preview (feed)">
      <div className="p-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold text-white">Quick Earn</span>
          </div>
          {shown.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">No tiles shown — the card disappears.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 [&>*:last-child:nth-child(3n+1)]:col-span-3">
              {shown.map((t) => {
                return (
                  <div
                    key={t.id}
                    className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/60 px-2 py-3 text-center"
                  >
                    <NavIcon iconKey={t.icon} className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="w-full truncate text-xs font-bold leading-tight text-white">{t.label || "…"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PreviewFrame>
  );
}

export function QuickEarnEditor({
  initial,
  canEdit,
}: {
  initial: QuickEarnTile[];
  canEdit: boolean;
}) {
  const [tiles, setTiles] = useState<QuickEarnTile[]>(initial.length ? initial : DEFAULT_QUICK_EARN);
  const { save, busy } = useNavSave(NAV_KEYS.quickEarn);
  const problems = navSettingProblems(NAV_KEYS.quickEarn, tiles);

  const patch = (id: string, p: Partial<QuickEarnTile>) =>
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Shortcut tiles on the feed (phone card and desktop right rail). A tile
            whose page is hidden for a user is not shown to them.
          </p>
          {canEdit && tiles.length < QUICK_EARN_MAX && (
            <button
              type="button"
              onClick={() =>
                setTiles((prev) => [
                  ...prev,
                  { id: newId("qe"), label: "New", href: "/earn", icon: "zap", color: "indigo", enabled: true },
                ])
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add tile
            </button>
          )}
        </div>
        <Reorder.Group as="div" axis="y" values={tiles} onReorder={setTiles} className="space-y-2.5">
          {tiles.map((tile, i) => (
            <TileRow
              key={tile.id}
              tile={tile}
              index={i}
              count={tiles.length}
              canEdit={canEdit}
              onChange={(p) => patch(tile.id, p)}
              onRemove={() => setTiles((prev) => prev.filter((t) => t.id !== tile.id))}
              onMove={(d) => setTiles((prev) => moveItem(prev, i, d))}
            />
          ))}
        </Reorder.Group>
        <SaveBar
          canEdit={canEdit}
          busy={busy}
          problems={problems}
          onSave={() => void save(tiles)}
          onReset={() => setTiles(DEFAULT_QUICK_EARN)}
        />
      </section>
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <QuickEarnPreview tiles={tiles} />
      </aside>
    </div>
  );
}
