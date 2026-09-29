"use client";

import { useState } from "react";
import { ChevronDown, Eye, EyeOff, Lock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavIcon } from "@/lib/nav-icons";
import {
  DEFAULT_SIDEBAR,
  NAV_KEYS,
  SIDEBAR_ITEM_MAX,
  SIDEBAR_LABEL_MAX,
  SIDEBAR_MODES,
  SIDEBAR_SECTION_MAX,
  navSettingProblems,
  type SidebarConfig,
  type SidebarItem,
  type SidebarMode,
  type SidebarSection,
} from "@/lib/nav-config";
import {
  FeaturePicker,
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

function ItemRow({
  item,
  index,
  count,
  canEdit,
  sections,
  sectionId,
  onChange,
  onRemove,
  onMove,
  onMoveTo,
}: {
  item: SidebarItem;
  index: number;
  count: number;
  canEdit: boolean;
  sections: SidebarSection[];
  sectionId: string;
  onChange: (p: Partial<SidebarItem>) => void;
  onRemove: () => void;
  onMove: (d: number) => void;
  onMoveTo: (sectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("rounded-lg border border-slate-800 bg-slate-950/50 p-2", !item.visible && "opacity-60")}>
      <div className="flex items-center gap-1.5">
        <MoveButtons index={index} count={count} onMove={onMove} disabled={!canEdit} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-800/60"
        >
          <NavIcon iconKey={item.icon} className="h-4 w-4 shrink-0 text-slate-300" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{item.label || "…"}</span>
            <span className="block truncate text-[11px] text-slate-500">
              {item.href}
              {item.feature && ` · needs ${item.feature}`}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => onChange({ visible: !item.visible })}
          disabled={!canEdit}
          aria-label={item.visible ? "Shown — click to hide" : "Hidden — click to show"}
          className={cn(
            "shrink-0 rounded-lg p-2 disabled:opacity-50",
            item.visible ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
          )}
        >
          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-slate-800 pt-2 sm:grid-cols-2">
          <input
            value={item.label}
            onChange={(e) => onChange({ label: e.target.value })}
            maxLength={SIDEBAR_LABEL_MAX}
            placeholder="Label"
            aria-label="Label"
            disabled={!canEdit}
            className={inputCls}
          />
          <PagePicker value={item.href} onChange={(href) => onChange({ href })} disabled={!canEdit} />
          <IconPicker value={item.icon} onChange={(icon) => onChange({ icon })} disabled={!canEdit} />
          <FeaturePicker value={item.feature} onChange={(feature) => onChange({ feature })} disabled={!canEdit} />
          <select
            value={sectionId}
            onChange={(e) => onMoveTo(e.target.value)}
            disabled={!canEdit}
            aria-label="Section"
            className={inputCls}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                In section: {s.title || "…"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canEdit}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-slate-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove item
          </button>
        </div>
      )}
    </li>
  );
}

function SidebarPreview({ config }: { config: SidebarConfig }) {
  return (
    <PreviewFrame title="Menu preview (drawer / rail)" width={300}>
      <div className="max-h-[560px] space-y-4 overflow-y-auto p-3">
        {config.sections.map((s) => {
          const items = s.items.filter((i) => i.visible);
          if (items.length === 0) return null;
          return (
            <div key={s.id}>
              <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.title}</p>
              <ul className="space-y-0.5">
                {items.map((i) => {
                  return (
                    <li key={i.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-200">
                      <NavIcon iconKey={i.icon} className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 truncate">{i.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {config.modes.map((m) => (
          <div key={m.kind} className="border-t border-slate-800 pt-3">
            <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{m.title}</p>
            <p className="px-2 pt-1 text-[11px] text-slate-600">
              {SIDEBAR_MODES.find((d) => d.kind === m.kind)?.gate}
            </p>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

export function SidebarEditor({
  initial,
  canEdit,
}: {
  initial: SidebarConfig;
  canEdit: boolean;
}) {
  const [sections, setSections] = useState<SidebarSection[]>(initial.sections);
  const [modes, setModes] = useState<SidebarMode[]>(initial.modes);
  const { save, busy } = useNavSave(NAV_KEYS.sidebar);
  const value: SidebarConfig = { sections, modes };
  const problems = navSettingProblems(NAV_KEYS.sidebar, value);
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  const patchSection = (id: string, p: Partial<SidebarSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const patchItems = (id: string, fn: (items: SidebarItem[]) => SidebarItem[]) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, items: fn(s.items) } : s)));
  const moveTo = (from: string, itemId: string, to: string) =>
    setSections((prev) => {
      const item = prev.find((s) => s.id === from)?.items.find((i) => i.id === itemId);
      if (!item || from === to) return prev;
      return prev.map((s) =>
        s.id === from
          ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
          : s.id === to
            ? { ...s, items: [...s.items, item] }
            : s
      );
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 space-y-4">
        <p className="text-xs leading-relaxed text-slate-400">
          The left menu on tablet/desktop and the phone&apos;s Menu drawer (same
          list). Tap an item to edit it. Hidden items (eye off) never show; an item
          whose page is hidden for a user, or whose feature they lack, is dropped
          for that user as before. Sections with nothing visible disappear.
        </p>

        {sections.map((sec, si) => (
          <div key={sec.id} className="rounded-xl glass p-3">
            <div className="flex items-center gap-2">
              <MoveButtons
                index={si}
                count={sections.length}
                disabled={!canEdit}
                onMove={(d) => setSections((prev) => moveItem(prev, si, d))}
              />
              <input
                value={sec.title}
                onChange={(e) => patchSection(sec.id, { title: e.target.value })}
                maxLength={SIDEBAR_LABEL_MAX}
                placeholder="Section title"
                aria-label="Section title"
                disabled={!canEdit}
                className={cn(inputCls, "flex-1 font-semibold")}
              />
              <button
                type="button"
                onClick={() => {
                  if (sec.items.length > 0 && !window.confirm(`Remove "${sec.title}" and its ${sec.items.length} items?`)) return;
                  setSections((prev) => prev.filter((s) => s.id !== sec.id));
                }}
                disabled={!canEdit || sections.length <= 1}
                aria-label="Remove section"
                className="shrink-0 rounded-lg bg-slate-800 p-2 text-red-400 hover:bg-slate-700 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-2 space-y-1.5">
              {sec.items.map((item, ii) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={ii}
                  count={sec.items.length}
                  canEdit={canEdit}
                  sections={sections}
                  sectionId={sec.id}
                  onChange={(p) => patchItems(sec.id, (items) => items.map((i) => (i.id === item.id ? { ...i, ...p } : i)))}
                  onRemove={() => patchItems(sec.id, (items) => items.filter((i) => i.id !== item.id))}
                  onMove={(d) => patchItems(sec.id, (items) => moveItem(items, ii, d))}
                  onMoveTo={(to) => moveTo(sec.id, item.id, to)}
                />
              ))}
            </ul>
            {canEdit && total < SIDEBAR_ITEM_MAX && (
              <button
                type="button"
                onClick={() =>
                  patchItems(sec.id, (items) => [
                    ...items,
                    { id: newId("sb"), label: "New link", href: "/dashboard", icon: "zap", visible: true },
                  ])
                }
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add item
              </button>
            )}
          </div>
        ))}

        {canEdit && sections.length < SIDEBAR_SECTION_MAX && (
          <button
            type="button"
            onClick={() => setSections((prev) => [...prev, { id: newId("sb-sec"), title: "New section", items: [] }])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add section
          </button>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <Lock className="h-4 w-4 text-slate-400" /> Pinned sections
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Pinned under the menu. Who sees them and what they contain is fixed
            (role- and capability-gated); you can rename them and change their order.
          </p>
          <ol className="mt-2 space-y-2">
            {modes.map((m, mi) => {
              const def = SIDEBAR_MODES.find((d) => d.kind === m.kind)!;
              return (
                <li key={m.kind} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                  <MoveButtons
                    index={mi}
                    count={modes.length}
                    disabled={!canEdit}
                    onMove={(d) => setModes((prev) => moveItem(prev, mi, d))}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      value={m.title}
                      onChange={(e) => setModes((prev) => prev.map((x) => (x.kind === m.kind ? { ...x, title: e.target.value } : x)))}
                      maxLength={SIDEBAR_LABEL_MAX}
                      aria-label={`${def.title} section title`}
                      disabled={!canEdit}
                      className={inputCls}
                    />
                    <p className="text-[11px] text-slate-500">
                      {def.items} — {def.gate}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <SaveBar
          canEdit={canEdit}
          busy={busy}
          problems={problems}
          onSave={() => void save(value)}
          onReset={() => {
            setSections(DEFAULT_SIDEBAR.sections);
            setModes(DEFAULT_SIDEBAR.modes);
          }}
        />
      </section>
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <SidebarPreview config={value} />
      </aside>
    </div>
  );
}
