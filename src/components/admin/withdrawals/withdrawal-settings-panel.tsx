"use client";

import { Section, Toggle } from "@/components/admin/shared/controls";
import {
  Field,
  SaveBar,
  SeeAlso,
  inp,
  useKeyedSettings,
  type SettingsBag,
} from "@/components/admin/settings/keyed-settings";

/**
 * Every platform-wide withdrawal setting, in one place.
 *
 * Moved here from System Settings (Money, Limits and Site toggles tabs). Same
 * keys, same row categories, same save route and validation — only the screen
 * changed. Read by `getWithdrawalConfig()` (src/lib/withdrawal.ts) and the
 * KYC gate in `api/withdrawals`.
 */

/**
 * What is in force when a key has never been saved. These are the fallbacks
 * the code reads with (`getWithdrawalConfig()`), so an unsaved box shows the
 * real value — `max_withdrawal` falls back to 1000 there.
 */
const DEFAULTS: SettingsBag = {
  min_withdrawal: 5,
  max_withdrawal: 1000,
  withdrawal_fee_percent: 5,
  allow_withdrawals: true,
  withdrawal_requires_subscription: false,
  withdrawal_payout_time_message: "1-3 business days",
  max_withdrawals_per_day: 1,
  "ui.require_kyc_for_withdrawal": true,
};

export function WithdrawalSettingsPanel({
  initial,
  canEdit,
}: {
  initial: SettingsBag;
  canEdit: boolean;
}) {
  const { values, set, busy, dirty, save } = useKeyedSettings(DEFAULTS, initial, {
    savedMessage: "Withdrawal settings saved",
  });

  return (
    <div className="max-w-3xl space-y-4">
      <Section title="Switches">
        <Toggle settingKey="allow_withdrawals"
          checked={values.allow_withdrawals !== false}
          onChange={(v) => set("allow_withdrawals", v)}
          disabled={!canEdit}
          tone="amber"
        />
        <Toggle settingKey="withdrawal_requires_subscription"
          checked={!!values.withdrawal_requires_subscription}
          onChange={(v) => set("withdrawal_requires_subscription", v)}
          disabled={!canEdit}
        />
        <Toggle settingKey="ui.require_kyc_for_withdrawal"
          checked={values["ui.require_kyc_for_withdrawal"] !== false}
          onChange={(v) => set("ui.require_kyc_for_withdrawal", v)}
          disabled={!canEdit}
          tone="red"
        />
      </Section>

      <Section title="Limits & fee">
        <div className="grid grid-cols-2 gap-3">
          <Field settingKey="min_withdrawal">
            <input
              type="number"
              step={0.01}
              value={Number(values.min_withdrawal ?? 0)}
              onChange={(e) => set("min_withdrawal", parseFloat(e.target.value))}
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field settingKey="max_withdrawal">
            <input
              type="number"
              step={0.01}
              value={Number(values.max_withdrawal ?? 0)}
              onChange={(e) => set("max_withdrawal", parseFloat(e.target.value))}
              disabled={!canEdit}
              className={inp}
            />
          </Field>
        </div>
        <Field settingKey="withdrawal_fee_percent">
          <input
            type="number"
            step={0.1}
            min={0}
            max={100}
            value={Number(values.withdrawal_fee_percent ?? 5)}
            onChange={(e) =>
              set("withdrawal_fee_percent", parseFloat(e.target.value))
            }
            disabled={!canEdit}
            className={inp}
          />
        </Field>
        <Field settingKey="max_withdrawals_per_day">
          <input
            type="number"
            min={0}
            value={Number(values.max_withdrawals_per_day ?? 1)}
            onChange={(e) =>
              set("max_withdrawals_per_day", parseInt(e.target.value))
            }
            disabled={!canEdit}
            className={inp}
          />
        </Field>
        <p className="text-xs leading-relaxed text-slate-500">
          How these combine for one user: the minimum is the higher of this
          number and their package&rsquo;s minimum withdrawal; the fee is this
          percentage minus their package&rsquo;s withdrawal-fee discount (never
          below 0). The maximum and the per-day count apply to everyone.
        </p>
      </Section>

      <Field settingKey="withdrawal_payout_time_message">
        <input
          type="text"
          value={
            (values.withdrawal_payout_time_message as string) ??
            "1-3 business days"
          }
          onChange={(e) =>
            set("withdrawal_payout_time_message", e.target.value)
          }
          disabled={!canEdit}
          className={inp}
        />
      </Field>

      <SaveBar canEdit={canEdit} busy={busy} dirty={dirty} onSave={save} />

      <div className="grid gap-3 sm:grid-cols-2 pt-2">
        <SeeAlso
          label="Per-package minimum & fee discount"
          href="/admin/packages"
          linkLabel="Packages"
          why="Each package can raise the minimum withdrawal, discount the fee, and switch the withdrawals feature off for its users."
        />
        <SeeAlso
          label="Payout & deposit methods"
          href="/admin/payment-methods"
          linkLabel="Payment Methods"
          why="Method cards, deposit methods and currency rates. The per-method min / max / fee there are NOT applied to withdrawals — the numbers on this tab are."
        />
      </div>
    </div>
  );
}
