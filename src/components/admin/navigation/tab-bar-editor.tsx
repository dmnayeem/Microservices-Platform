"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavIcon } from "@/lib/nav-icons";
import {
  BOTTOM_TAB_LABEL_MAX,
  DEFAULT_BOTTOM_TABS,
  NAV_KEYS,
  navSettingProblems,
  type BottomTab,
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
  useNavSave,
} from "./nav-editor-kit";

/** Phone mock of bottom-tab-bar.tsx at 320px — the narrowest phone we support. */
export function TabBarPreview({ tabs, width = 320 }: { tabs: BottomTab[]; width?: number }) {
  return (
    <PreviewFrame title={`Phone preview (${width}px)`} width={width}>
      <div className="h-24 bg-slate-950/40" />
      <div className="grid grid-cols-5 items-center border-t border-slate-800 bg-slate-900 pb-1">
        {tabs.map((t, i) => {
          return (
            <div
              key={t.id}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 py-2 text-[11px] font-bold tracking-tight",
                i === 0 ? "text-indigo-300" : "text-slate-400"
              )}
            >
              {t.primary ? (
                <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
                  <NavIcon iconKey={t.icon} className="h-6 w-6" />
                </span>
              ) : (
                <NavIcon iconKey={t.icon} className="h-5.5 w-5.5" />
              )}
              <span className={cn("block max-w-full truncate whitespace-nowrap px-0.5", t.primary && "mt-0.5")}>
                {t.label || "…"}
              </span>
            </div>
          );
        })}
        <div className="flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-bold tracking-tight text-slate-400">
          <Menu className="h-5.5 w-5.5" />
          Menu
        </div>
      </div>
    </PreviewFrame>
  );
}

export function TabBarEditor({
  initial,
  canEdit,
}: {
  initial: BottomTab[];
  canEdit: boolean;
}) {
  const [tabs, setTabs] = useState<BottomTab[]>(initial);
  const { save, busy } = useNavSave(NAV_KEYS.bottomTabs);
  const problems = navSettingProblems(NAV_KEYS.bottomTabs, tabs);
  const patch = (id: string, p: Partial<BottomTab>) =>
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-3">
        <p className="text-xs text-slate-400">
          The phone&apos;s bottom bar has exactly four slots, left to right, then the
          fixed <strong className="text-slate-200">Menu</strong> button (it opens the
          sidebar drawer and carries the unread count, so it cannot be moved or
          removed). One slot is the big raised button — keep it in slot 3 to keep
          it centred. Labels are at most {BOTTOM_TAB_LABEL_MAX} characters so they
          never wrap. A tab whose page is hidden for a user, or whose feature they
          lack, is dropped for them and the bar closes up.
        </p>
        <ol className="space-y-2.5">
          {tabs.map((t, i) => (
            <li key={t.id} className="rounded-xl glass p-3">
              <div className="flex gap-2">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
                    {i + 1}
                  </span>
                  <MoveButtons
                    index={i}
                    count={tabs.length}
                    disabled={!canEdit}
                    onMove={(d) => setTabs((prev) => moveItem(prev, i, d))}
                  />
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <input
                      value={t.label}
                      onChange={(e) => patch(t.id, { label: e.target.value })}
                      maxLength={BOTTOM_TAB_LABEL_MAX}
                      placeholder="Label"
                      aria-label={`Tab ${i + 1} label`}
                      disabled={!canEdit}
                      className={inputCls}
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t.label.trim().length}/{BOTTOM_TAB_LABEL_MAX}
                    </p>
                  </div>
                  <PagePicker value={t.href} onChange={(href) => patch(t.id, { href })} disabled={!canEdit} />
                  <IconPicker value={t.icon} onChange={(icon) => patch(t.id, { icon })} disabled={!canEdit} />
                  <FeaturePicker value={t.feature} onChange={(feature) => patch(t.id, { feature })} disabled={!canEdit} />
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200 sm:col-span-2">
                    <input
                      type="radio"
                      name="primary-tab"
                      checked={t.primary}
                      disabled={!canEdit}
                      onChange={() => setTabs((prev) => prev.map((x) => ({ ...x, primary: x.id === t.id })))}
                      className="h-4 w-4"
                    />
                    Big centre button
                  </label>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <SaveBar
          canEdit={canEdit}
          busy={busy}
          problems={problems}
          onSave={() => void save(tabs)}
          onReset={() => setTabs(DEFAULT_BOTTOM_TABS)}
        />
      </section>
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <TabBarPreview tabs={tabs} />
      </aside>
    </div>
  );
}
