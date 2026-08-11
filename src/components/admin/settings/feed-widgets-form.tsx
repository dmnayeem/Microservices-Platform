"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Reorder, useDragControls } from "framer-motion";
import {
  GripVertical,
  LayoutList,
  Save,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Zap,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEED_WIDGETS, type FeedWidgetConfig } from "@/lib/feed-widgets";
import {
  ICON_OPTIONS,
  COLOR_OPTIONS,
  COLOR_CLASSES,
  QUICK_EARN_ICONS,
  DEFAULT_QUICK_EARN,
  type QuickEarnTile,
} from "@/lib/feed-quick-earn";
import {
  GRADIENT_OPTIONS,
  type CustomWidget,
} from "@/lib/feed-custom-widgets";

const BUILTIN = Object.fromEntries(FEED_WIDGETS.map((w) => [w.id, w]));
const inputCls =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500";

interface Props {
  initial: {
    widgets: FeedWidgetConfig;
    quickEarn: QuickEarnTile[];
    customWidgets: CustomWidget[];
  };
  canEdit: boolean;
}

// ── Widget order row ─────────────────────────────────────────────────────────
function WidgetRow({
  item,
  label,
  description,
  canEdit,
  onToggle,
}: {
  item: { id: string; enabled: boolean };
  label: string;
  description?: string;
  canEdit: boolean;
  onToggle: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={item}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl glass",
        !item.enabled && "opacity-60"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => canEdit && controls.start(e)}
        disabled={!canEdit}
        className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing disabled:cursor-not-allowed"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 truncate">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={!canEdit}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 disabled:opacity-50",
          item.enabled
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-slate-800 text-slate-400"
        )}
      >
        {item.enabled ? (
          <>
            <Eye className="w-3.5 h-3.5" /> Shown
          </>
        ) : (
          <>
            <EyeOff className="w-3.5 h-3.5" /> Hidden
          </>
        )}
      </button>
    </Reorder.Item>
  );
}

// ── Quick Earn tile row ──────────────────────────────────────────────────────
function TileRow({
  tile,
  canEdit,
  onChange,
  onRemove,
}: {
  tile: QuickEarnTile;
  canEdit: boolean;
  onChange: (patch: Partial<QuickEarnTile>) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const Icon = QUICK_EARN_ICONS[tile.icon] ?? Zap;
  return (
    <Reorder.Item
      as="div"
      value={tile}
      dragListener={false}
      dragControls={controls}
      className={cn("rounded-xl glass p-3 space-y-2", !tile.enabled && "opacity-60")}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={(e) => canEdit && controls.start(e)}
          disabled={!canEdit}
          className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing disabled:cursor-not-allowed"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <Icon className={cn("w-4 h-4 shrink-0", COLOR_CLASSES[tile.color])} />
        <input
          value={tile.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Label"
          disabled={!canEdit}
          className={cn(inputCls, "flex-1")}
        />
        <button
          type="button"
          onClick={() => onChange({ enabled: !tile.enabled })}
          disabled={!canEdit}
          className={cn(
            "shrink-0 p-2 rounded-lg text-xs font-bold disabled:opacity-50",
            tile.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
          )}
          title={tile.enabled ? "Shown" : "Hidden"}
        >
          {tile.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canEdit}
          className="shrink-0 p-2 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700 disabled:opacity-50"
          title="Remove tile"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
        <input
          value={tile.href}
          onChange={(e) => onChange({ href: e.target.value })}
          placeholder="/link"
          disabled={!canEdit}
          className={cn(inputCls, "sm:col-span-1")}
        />
        <select
          value={tile.icon}
          onChange={(e) => onChange({ icon: e.target.value })}
          disabled={!canEdit}
          className={inputCls}
        >
          {ICON_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <select
          value={tile.color}
          onChange={(e) => onChange({ color: e.target.value })}
          disabled={!canEdit}
          className={inputCls}
        >
          {COLOR_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
    </Reorder.Item>
  );
}

// ── Custom widget card ───────────────────────────────────────────────────────
function CustomWidgetCard({
  widget,
  canEdit,
  onChange,
  onRemove,
}: {
  widget: CustomWidget;
  canEdit: boolean;
  onChange: (patch: Partial<CustomWidget>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl glass p-3 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={widget.kind}
          onChange={(e) => onChange({ kind: e.target.value as CustomWidget["kind"] })}
          disabled={!canEdit}
          className={cn(inputCls, "w-32 shrink-0")}
        >
          <option value="promo">Promo card</option>
          <option value="links">Links list</option>
        </select>
        <input
          value={widget.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Widget title"
          disabled={!canEdit}
          className={cn(inputCls, "flex-1")}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={!canEdit}
          className="shrink-0 p-2 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700 disabled:opacity-50"
          title="Remove widget"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {widget.kind === "promo" ? (
        <div className="space-y-2">
          <input
            value={widget.subtitle ?? ""}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="Subtitle"
            disabled={!canEdit}
            className={inputCls}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={widget.href ?? ""}
              onChange={(e) => onChange({ href: e.target.value })}
              placeholder="Link (/packages)"
              disabled={!canEdit}
              className={inputCls}
            />
            <select
              value={widget.gradient ?? GRADIENT_OPTIONS[0].key}
              onChange={(e) => onChange({ gradient: e.target.value })}
              disabled={!canEdit}
              className={inputCls}
            >
              {GRADIENT_OPTIONS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {(widget.links ?? []).map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={l.label}
                onChange={(e) => {
                  const links = [...(widget.links ?? [])];
                  links[i] = { ...links[i], label: e.target.value };
                  onChange({ links });
                }}
                placeholder="Label"
                disabled={!canEdit}
                className={cn(inputCls, "flex-1")}
              />
              <input
                value={l.href}
                onChange={(e) => {
                  const links = [...(widget.links ?? [])];
                  links[i] = { ...links[i], href: e.target.value };
                  onChange({ links });
                }}
                placeholder="/link"
                disabled={!canEdit}
                className={cn(inputCls, "flex-1")}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ links: (widget.links ?? []).filter((_, j) => j !== i) })
                }
                disabled={!canEdit}
                className="shrink-0 p-2 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ links: [...(widget.links ?? []), { label: "", href: "" }] })
            }
            disabled={!canEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add link
          </button>
        </div>
      )}
    </div>
  );
}

export function FeedWidgetsForm({ initial, canEdit }: Props) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<FeedWidgetConfig>(initial.widgets);
  const [tiles, setTiles] = useState<QuickEarnTile[]>(
    initial.quickEarn.length ? initial.quickEarn : DEFAULT_QUICK_EARN
  );
  const [custom, setCustom] = useState<CustomWidget[]>(initial.customWidgets);
  const [busy, setBusy] = useState(false);

  const labelFor = (id: string) =>
    BUILTIN[id]?.label ?? custom.find((c) => c.id === id)?.title ?? id;
  const descFor = (id: string) =>
    BUILTIN[id]?.description ?? (custom.find((c) => c.id === id) ? "Custom widget" : "");

  const toggleWidget = (id: string) =>
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );

  // Quick Earn helpers
  const patchTile = (id: string, patch: Partial<QuickEarnTile>) =>
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeTile = (id: string) =>
    setTiles((prev) => prev.filter((t) => t.id !== id));
  const addTile = () =>
    setTiles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "New", href: "/earn", icon: "zap", color: "indigo", enabled: true },
    ]);

  // Custom widget helpers
  const patchCustom = (id: string, patch: Partial<CustomWidget>) =>
    setCustom((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCustom = (id: string) => {
    setCustom((prev) => prev.filter((c) => c.id !== id));
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };
  const addCustom = () => {
    const id = crypto.randomUUID();
    setCustom((prev) => [
      ...prev,
      { id, kind: "promo", title: "New Widget", subtitle: "", href: "/packages", gradient: GRADIENT_OPTIONS[0].key },
    ]);
    setWidgets((prev) => [...prev, { id, enabled: true }]);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings/feed-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets, quickEarn: tiles, customWidgets: custom }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Feed widgets saved");
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-4">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <LayoutList className="w-6 h-6 text-indigo-400" />
          Feed Sidebar Widgets
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Reorder + show/hide the social-feed sidebar widgets, edit the Quick
          Earn tiles, and add your own custom widgets. Applies to every user.
        </p>
      </div>

      {/* Section 1 — widget order & visibility */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-white">Widget order &amp; visibility</h2>
        <Reorder.Group as="div" axis="y" values={widgets} onReorder={setWidgets} className="space-y-2.5">
          {widgets.map((item) => (
            <WidgetRow
              key={item.id}
              item={item}
              label={labelFor(item.id)}
              description={descFor(item.id)}
              canEdit={canEdit}
              onToggle={() => toggleWidget(item.id)}
            />
          ))}
        </Reorder.Group>
      </section>

      {/* Section 2 — Quick Earn tiles */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" /> Quick Earn tiles
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={addTile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add tile
            </button>
          )}
        </div>
        <Reorder.Group as="div" axis="y" values={tiles} onReorder={setTiles} className="space-y-2.5">
          {tiles.map((tile) => (
            <TileRow
              key={tile.id}
              tile={tile}
              canEdit={canEdit}
              onChange={(patch) => patchTile(tile.id, patch)}
              onRemove={() => removeTile(tile.id)}
            />
          ))}
        </Reorder.Group>
      </section>

      {/* Section 3 — custom widgets */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-violet-400" /> Custom widgets
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={addCustom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add widget
            </button>
          )}
        </div>
        {custom.length === 0 ? (
          <p className="text-xs text-slate-500">
            No custom widgets. Add a promo card or a links list — it appears in
            the order list above where you can position it.
          </p>
        ) : (
          <div className="space-y-2.5">
            {custom.map((w) => (
              <CustomWidgetCard
                key={w.id}
                widget={w}
                canEdit={canEdit}
                onChange={(patch) => patchCustom(w.id, patch)}
                onRemove={() => removeCustom(w.id)}
              />
            ))}
          </div>
        )}
      </section>

      {canEdit && (
        <div className="sticky bottom-0 flex justify-end py-3 -mx-4 px-4 glass-strong rounded-none">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
