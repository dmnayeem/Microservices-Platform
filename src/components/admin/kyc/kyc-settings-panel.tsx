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
 * The automatic KYC thresholds, next to the queue they decide.
 *
 * Moved here from System Settings → Security. Same keys, same row category
 * ("security"), same save route and validation — only the screen changed.
 */
const DEFAULTS: SettingsBag = {
  "kyc.autoEnabled": true,
  "kyc.faceMinSimilarity": 88,
  "kyc.ocrMinConfidence": 0.7,
  "kyc.ocrRejectBelow": 0.2,
};

export function KycSettingsPanel({
  initial,
  canEdit,
}: {
  initial: SettingsBag;
  canEdit: boolean;
}) {
  const { values, set, busy, dirty, save } = useKeyedSettings(DEFAULTS, initial, {
    savedMessage: "KYC settings saved",
  });

  return (
    <div className="max-w-3xl space-y-4">
      <Toggle settingKey="kyc.autoEnabled"
        checked={values["kyc.autoEnabled"] !== false}
        onChange={(v) => set("kyc.autoEnabled", v)}
        disabled={!canEdit}
      />
      <Field settingKey="kyc.faceMinSimilarity">
        <input
          type="number"
          min={50}
          max={100}
          value={Number(values["kyc.faceMinSimilarity"] ?? 88)}
          onChange={(e) => set("kyc.faceMinSimilarity", parseInt(e.target.value) || 88)}
          disabled={!canEdit}
          className={inp}
        />
      </Field>
      <Field settingKey="kyc.ocrMinConfidence">
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={Number(values["kyc.ocrMinConfidence"] ?? 0.7)}
          onChange={(e) => set("kyc.ocrMinConfidence", parseFloat(e.target.value) || 0.7)}
          disabled={!canEdit}
          className={inp}
        />
      </Field>
      <Field settingKey="kyc.ocrRejectBelow">
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={Number(values["kyc.ocrRejectBelow"] ?? 0.2)}
          onChange={(e) =>
            set("kyc.ocrRejectBelow", parseFloat(e.target.value) || 0.2)
          }
          disabled={!canEdit}
          className={inp}
        />
      </Field>

      <SaveBar canEdit={canEdit} busy={busy} dirty={dirty} onSave={save} />

      <div className="grid gap-3 sm:grid-cols-2 pt-2">
        <SeeAlso
          label="Require KYC for withdrawals"
          href="/admin/withdrawals?tab=settings"
          linkLabel="Withdrawals → Settings"
          why="The switch that makes users verify before they can withdraw lives with the other withdrawal rules."
        />
        <SeeAlso
          label="Require KYC before a buyer funds a task"
          href="/admin/settings"
          linkLabel="System Settings → Money"
          why="Part of the Buyer & task funding rules (buyer.require_kyc), which stay together on the Money tab."
        />
      </div>
    </div>
  );
}
