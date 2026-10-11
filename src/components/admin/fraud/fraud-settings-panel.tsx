"use client";

import { Section, Toggle } from "@/components/admin/shared/controls";
import { RiskPointsEditor } from "@/components/admin/settings/risk-points-editor";
import {
  Field,
  SaveBar,
  SeeAlso,
  inp,
  useKeyedSettings,
  type SettingsBag,
} from "@/components/admin/settings/keyed-settings";

/**
 * Every `antifraud.*` setting, next to the monitor that shows what they catch.
 *
 * Moved here from System Settings → Limits. Same keys, same row category
 * ("limits"), same save route and validation (`antifraud.auto_suspend_at` and
 * `antifraud.max_users_per_ip` are bounded in setting-guards.ts) — only the
 * screen changed.
 */
const DEFAULTS: SettingsBag = {
  "antifraud.auto_approve_min_trust": 0,
  "antifraud.spot_check_percent": 0,
  "antifraud.block_duplicate_proof": false,
  "antifraud.risk_enabled": true,
  "antifraud.auto_suspend_enabled": true,
  "antifraud.auto_suspend_at": 100,
  "antifraud.risk_points": {},
  "antifraud.max_users_per_ip": 0,
  "antifraud.ip_limit_action": "flag",
  "antifraud.max_accounts_per_device": 3,
  "antifraud.device_limit_action": "block",
  "antifraud.vpn_block_enabled": false,
  "antifraud.vpn_ranges": "",
  "antifraud.one_account_per_device": true,
  "antifraud.device_login_exempt": "",
  "antifraud.vpn_provider": "none",
  "antifraud.vpn_api_key": "",
  "antifraud.vpn_block_all_tasks": false,
  "antifraud.vpn_locked_paths": "",
  "antifraud.adblock_gate_enabled": true,
  "antifraud.adblock_reminder_minutes": 0,
};

export function FraudSettingsPanel({
  initial,
  canEdit,
}: {
  initial: SettingsBag;
  canEdit: boolean;
}) {
  const { values, set, busy, dirty, save } = useKeyedSettings(DEFAULTS, initial, {
    savedMessage: "Anti-fraud settings saved",
  });

  return (
    <div className="max-w-4xl space-y-4">
      <Section title="Task approval automation">
        <div className="grid grid-cols-2 gap-3">
          <Field settingKey="antifraud.auto_approve_min_trust">
            <input
              type="number"
              min={0}
              max={100}
              value={Number(values["antifraud.auto_approve_min_trust"] ?? 0)}
              onChange={(e) =>
                set(
                  "antifraud.auto_approve_min_trust",
                  parseInt(e.target.value) || 0
                )
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field settingKey="antifraud.spot_check_percent">
            <input
              type="number"
              min={0}
              max={100}
              value={Number(values["antifraud.spot_check_percent"] ?? 0)}
              onChange={(e) =>
                set(
                  "antifraud.spot_check_percent",
                  parseInt(e.target.value) || 0
                )
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
        </div>
        <Toggle settingKey="antifraud.block_duplicate_proof"
          checked={values["antifraud.block_duplicate_proof"] === true}
          onChange={(v) => set("antifraud.block_duplicate_proof", v)}
          disabled={!canEdit}
        />
      </Section>

      <Section title="Fraud risk & auto-suspension">
        <Toggle settingKey="antifraud.risk_enabled"
          checked={values["antifraud.risk_enabled"] !== false}
          onChange={(v) => set("antifraud.risk_enabled", v)}
          disabled={!canEdit}
          tone="red"
        />
        <Toggle settingKey="antifraud.auto_suspend_enabled"
          checked={values["antifraud.auto_suspend_enabled"] !== false}
          onChange={(v) => set("antifraud.auto_suspend_enabled", v)}
          disabled={!canEdit}
          tone="red"
        />
        <Field settingKey="antifraud.auto_suspend_at">
          <input
            type="number"
            min={10}
            max={100}
            value={Number(values["antifraud.auto_suspend_at"] ?? 100)}
            onChange={(e) => set("antifraud.auto_suspend_at", parseInt(e.target.value) || 100)}
            disabled={!canEdit}
            className={inp}
          />
        </Field>
        <Field settingKey="antifraud.risk_points">
          <RiskPointsEditor
            value={(values["antifraud.risk_points"] as Record<string, number> | undefined) ?? {}}
            onChange={(v) => set("antifraud.risk_points", v)}
            disabled={!canEdit}
          />
        </Field>
      </Section>

      <Section title="Network anti-abuse">
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-sky-100/90 space-y-1">
          <p>
            <b>Device first, IP second.</b> Many honest people share one IP — everyone on a home or office WiFi —
            and one person&apos;s mobile data changes IP all day. Several accounts on the <i>same device</i> is
            what multi-accounting actually looks like.
          </p>
          <p>
            Recommended: accounts per device <b>2–3</b>, action <b>Block</b>. Accounts per IP <b>10–20</b>,
            action <b>Flag only</b> — hits go to the Fraud Monitor for review, nobody on shared WiFi is locked
            out, and they add no fraud risk.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field settingKey="antifraud.max_accounts_per_device">
            <input
              type="number"
              min={0}
              value={Number(values["antifraud.max_accounts_per_device"] ?? 3)}
              onChange={(e) => set("antifraud.max_accounts_per_device", Math.max(0, parseInt(e.target.value) || 0))}
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field settingKey="antifraud.device_limit_action">
            <select
              value={String(values["antifraud.device_limit_action"] ?? "block")}
              onChange={(e) => set("antifraud.device_limit_action", e.target.value)}
              disabled={!canEdit}
              className={inp}
            >
              <option value="block">Block — refuse the sign-up / task</option>
              <option value="flag">Flag only — allow, report to Fraud Monitor</option>
            </select>
          </Field>
          <Field settingKey="antifraud.max_users_per_ip">
            <input
              type="number"
              min={0}
              value={Number(values["antifraud.max_users_per_ip"] ?? 0)}
              onChange={(e) =>
                set("antifraud.max_users_per_ip", parseInt(e.target.value) || 0)
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field settingKey="antifraud.ip_limit_action">
            <select
              value={String(values["antifraud.ip_limit_action"] ?? "flag")}
              onChange={(e) => set("antifraud.ip_limit_action", e.target.value)}
              disabled={!canEdit}
              className={inp}
            >
              <option value="flag">Flag only — allow, report to Fraud Monitor (recommended)</option>
              <option value="block">Block — refuse (locks out shared WiFi)</option>
            </select>
          </Field>
        </div>
        <Toggle settingKey="antifraud.one_account_per_device"
          checked={values["antifraud.one_account_per_device"] !== false}
          onChange={(v) => set("antifraud.one_account_per_device", v)}
          disabled={!canEdit}
        />
        <Field settingKey="antifraud.device_login_exempt">
          <input
            type="text"
            value={String(values["antifraud.device_login_exempt"] ?? "")}
            onChange={(e) => set("antifraud.device_login_exempt", e.target.value)}
            disabled={!canEdit}
            placeholder="mother@example.com, son@example.com"
            className={inp}
          />
        </Field>
      </Section>

      <Section title="VPN / proxy">
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-sky-100/90">
          Members on a VPN are <b>recorded either way</b> — see the <b>VPN users</b> tab — even with every block
          below off. Then choose what they can&apos;t do: all task work, every task, single tasks (&ldquo;No
          VPN&rdquo; on the task form), or chosen pages.
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field settingKey="antifraud.vpn_provider">
            <select
              value={String(values["antifraud.vpn_provider"] ?? "none")}
              onChange={(e) => set("antifraud.vpn_provider", e.target.value)}
              disabled={!canEdit}
              className={inp}
            >
              <option value="none">None — the IP prefix list only</option>
              <option value="proxycheck">proxycheck.io — real VPN / proxy detection</option>
            </select>
          </Field>
          <Field settingKey="antifraud.vpn_api_key">
            <input
              type="password"
              autoComplete="off"
              value={String(values["antifraud.vpn_api_key"] ?? "")}
              onChange={(e) => set("antifraud.vpn_api_key", e.target.value)}
              disabled={!canEdit}
              className={inp}
            />
          </Field>
        </div>
        <Toggle settingKey="antifraud.vpn_block_enabled"
          checked={values["antifraud.vpn_block_enabled"] === true}
          onChange={(v) => set("antifraud.vpn_block_enabled", v)}
          disabled={!canEdit}
        />
        <Toggle settingKey="antifraud.vpn_block_all_tasks"
          checked={values["antifraud.vpn_block_all_tasks"] === true}
          onChange={(v) => set("antifraud.vpn_block_all_tasks", v)}
          disabled={!canEdit}
        />
        <Field settingKey="antifraud.vpn_locked_paths">
          <input
            type="text"
            value={String(values["antifraud.vpn_locked_paths"] ?? "")}
            onChange={(e) => set("antifraud.vpn_locked_paths", e.target.value)}
            disabled={!canEdit}
            placeholder="/withdrawal /cpa /tasks"
            className={inp}
          />
        </Field>
        <Field settingKey="antifraud.vpn_ranges">
          <input
            type="text"
            value={String(values["antifraud.vpn_ranges"] ?? "")}
            onChange={(e) => set("antifraud.vpn_ranges", e.target.value)}
            disabled={!canEdit}
            placeholder="45.83. 185.220. 2607:5300:"
            className={inp}
          />
        </Field>
      </Section>

      {/* The ad-blocker gate guards TASKS (a task will not open while an
          ad-blocker is detected), so it stays with the anti-fraud rules rather
          than the ad settings. */}
      <Section title="Ad-blockers on tasks">
        <Toggle settingKey="antifraud.adblock_gate_enabled"
          checked={values["antifraud.adblock_gate_enabled"] !== false}
          onChange={(v) => set("antifraud.adblock_gate_enabled", v)}
          disabled={!canEdit}
        />
        <Field settingKey="antifraud.adblock_reminder_minutes">
          <input
            type="number"
            min={0}
            value={Number(values["antifraud.adblock_reminder_minutes"] ?? 0)}
            onChange={(e) =>
              set(
                "antifraud.adblock_reminder_minutes",
                parseInt(e.target.value) || 0
              )
            }
            disabled={!canEdit}
            className={inp}
          />
        </Field>
      </Section>

      <SaveBar canEdit={canEdit} busy={busy} dirty={dirty} onSave={save} />

      <h3 className="pt-2 text-sm font-semibold text-white">Other fraud controls — kept with the pages they belong to</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SeeAlso
          label="Require email verification to sign in"
          href="/admin/settings?tab=users"
          linkLabel="System Settings → Users & sign-up"
          why="Stops accounts made with fake addresses from signing in at all."
        />
        <SeeAlso
          label="Require KYC for withdrawals · withdrawal limits"
          href="/admin/withdrawals?tab=settings"
          linkLabel="Withdrawals → Settings"
          why="The last line against a farm: money only leaves to verified people."
        />
        <SeeAlso
          label="Referral limits & self-referral holds"
          href="/admin/referrals?tab=limits"
          linkLabel="Referrals → Limits"
          why="How many referrals pay, and the bonuses held for same-device sign-ups."
        />
        <SeeAlso
          label="Abuse signals & cases"
          href="/admin/abuse"
          linkLabel="Abuse Center"
          why="Everything the fraud rules caught (device sharing, blocked logins, …) as cases to review."
        />
        <SeeAlso
          label="Match country targeting by IP only"
          href="/admin/settings"
          linkLabel="System Settings → Limits"
          why="Decides which country a user counts as for every targeting rule (tasks, ads, banners, notifications), so it stays with the site-wide limits."
        />
        <SeeAlso
          label="KYC thresholds"
          href="/admin/users/kyc?tab=settings"
          linkLabel="KYC → Settings"
          why="The face-match and OCR confidence the automatic KYC check uses."
        />
      </div>
    </div>
  );
}
