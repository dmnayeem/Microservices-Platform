"use client";

import { Field, SaveBar, inp, useKeyedSettings, type SettingsBag } from "@/components/admin/settings/keyed-settings";

/**
 * The new-user welcome bonus — the one bonus edited on the Bonus Center itself
 * (it used to be the WELCOME_BONUS_POINTS env var, with no admin control).
 * Saved through the shared settings route, so bounds + audit apply.
 */
export function WelcomeBonusPanel({ initial, canEdit }: { initial: SettingsBag; canEdit: boolean }) {
  const { values, set, busy, dirty, save } = useKeyedSettings({ "bonus.welcome_points": 0 }, initial, {
    savedMessage: "Welcome bonus saved",
  });
  return (
    <div className="mt-3 space-y-3">
      <Field settingKey="bonus.welcome_points">
        <input
          type="number"
          min={0}
          max={100000}
          value={Number(values["bonus.welcome_points"] ?? 0)}
          onChange={(e) => set("bonus.welcome_points", Math.max(0, parseInt(e.target.value) || 0))}
          disabled={!canEdit}
          className={inp}
        />
      </Field>
      <SaveBar canEdit={canEdit} busy={busy} dirty={dirty} onSave={save} />
    </div>
  );
}
