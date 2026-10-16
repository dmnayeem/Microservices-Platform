"use client";

import { Toggle } from "@/components/admin/shared/controls";
import {
  Field,
  SaveBar,
  SeeAlso,
  inp,
  useKeyedSettings,
  type SettingsBag,
} from "@/components/admin/settings/keyed-settings";

/**
 * The feed's loose switches, gathered from where they used to sit:
 *   - `ui.groups_enabled`            ← System Settings → Site toggles
 *   - `social.ai_regenerate_limit`   ← System Settings → Limits
 *
 * Same keys, same save route — only the screen changed. The feed ad intervals
 * stay in the Ad Manager with the rest of the ad inventory.
 *
 * The old boost cap (`feed.boost_max_per_user`) moved to Post boosts →
 * Pricing as "Times one viewer sees a boost" — the feed now reads only that
 * one, so a box left here would have been a dead control.
 */
const DEFAULTS: SettingsBag = {
  "ui.groups_enabled": false,
  "social.ai_regenerate_limit": 2,
};

export function FeedGeneralPanel({
  initial,
  canEdit,
}: {
  initial: SettingsBag;
  canEdit: boolean;
}) {
  const { values, set, busy, dirty, save } = useKeyedSettings(DEFAULTS, initial, {
    savedMessage: "Feed settings saved",
  });

  return (
    <div className="max-w-3xl space-y-4">
      <Toggle settingKey="ui.groups_enabled"
        checked={values["ui.groups_enabled"] === true}
        onChange={(v) => set("ui.groups_enabled", v)}
        disabled={!canEdit}
        tone="purple"
      />
      {/*
        Read by `api/tasks/[id]/ai-recipe` since the day it shipped and
        editable nowhere until it got a box on System Settings: a default that
        can only be changed in code is not a setting.
      */}
      <Field settingKey="social.ai_regenerate_limit">
        <input
          type="number"
          min={0}
          value={Number(values["social.ai_regenerate_limit"] ?? 2)}
          onChange={(e) =>
            set(
              "social.ai_regenerate_limit",
              Math.max(0, parseInt(e.target.value) || 0)
            )
          }
          disabled={!canEdit}
          className={inp}
        />
      </Field>
      <SaveBar canEdit={canEdit} busy={busy} dirty={dirty} onSave={save} />

      <div className="pt-2 space-y-2">
        <SeeAlso
          label="Boosted post — times shown per viewer"
          href="/admin/boosts?tab=pricing"
          linkLabel="Post boosts → Pricing"
          why="How many times the feed may show the same boosted post to one person, next to the boost prices and limits it belongs with."
        />
        <SeeAlso
          label="Feed ad density"
          href="/admin/ads?tab=placements"
          linkLabel="Ad Manager → Ad Spaces"
          why="How often a native ad, a promoted post and the under-post banner appear in the feed. They are part of the ad inventory, so they stay with the ad spaces."
        />
      </div>
    </div>
  );
}
