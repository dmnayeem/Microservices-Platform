"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Settings as SettingsIcon,
  DollarSign,
  Shield,
  Mail,
  Bell,
  Plug,
  SlidersHorizontal,
  Loader2,
  RotateCcw,
  Save,
  Send,
  MonitorSmartphone,
  ExternalLink,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
import {
  NotActiveBadge,
  Section,
  Toggle,
} from "@/components/admin/shared/controls";
import { BUYER_TASK_TYPES } from "@/lib/buyer-task-types";
import {
  CATEGORY_FOR_KEY,
  SETTING_GROUPS,
  settingDomId,
  settingEntry,
  type SettingGroupId,
} from "@/lib/admin-settings-catalog";
import { SettingsSearch } from "./settings-search";

export type SettingsBag = Record<string, unknown>;

interface SystemSettingsFormProps {
  initial: SettingsBag;
  canEdit: boolean;
  /**
   * The social platform catalog, for the buyer allow-list. Passed as data
   * because `social-tasks.ts` is ~3,000 lines and this is a client component.
   */
  platformList?: { key: string; label: string; emoji: string }[];
}

const TAB_ICONS: Record<SettingGroupId, typeof SettingsIcon> = {
  general: SettingsIcon,
  financial: DollarSign,
  limits: SlidersHorizontal,
  security: Shield,
  ui_toggles: MonitorSmartphone,
  notifications: Bell,
  email: Mail,
  integrations: Plug,
};

/**
 * The tab strip. Names, order and the one-line blurb under each tab all come
 * from `SETTING_GROUPS`, so the tab an admin clicks and the group a key is
 * filed under are the same fact stated once. Only the icon is chosen here.
 */
const TABS = [...SETTING_GROUPS]
  .sort((a, b) => a.order - b.order)
  .map((g) => ({ ...g, icon: TAB_ICONS[g.id] }));

type TabId = SettingGroupId;

const DEFAULTS: SettingsBag = {
  // General
  platform_name: "EarnGPT",
  maintenance_mode: false,
  maintenance_message: "",
  // Financial
  currency: "USD",
  // The global click price every ad space falls back to. Not a new default —
  // 0.05 is the value `getAdClickCost()` has always used when the row is absent;
  // it is stated here so the form shows what is actually in force.
  "ads.cpcUsd": 0.05,
  min_withdrawal: 5,
  max_withdrawal: 10000,
  withdrawal_fee_percent: 5,
  allow_withdrawals: true,
  withdrawal_requires_subscription: false,
  withdrawal_payout_time_message: "1-3 business days",
  points_per_usd: 1000,
  points_convert_threshold: 1000,
  "bkash.usdToBdtRate": 123,
  vat_enabled: false,
  vat_pct: 15,
  // Buyer & task funding
  "buyer.enabled": true,
  "buyer.fee_percent": 0,
  "marketplace.fee_percent": 5,
  "buyer.min_points_per_task": 1,
  "buyer.max_points_per_task": 100000,
  "buyer.max_completions": 100000,
  "buyer.min_purchase_points": 1000,
  "buyer.max_purchase_points": 10000000,
  "buyer.max_active_tasks": 0,
  "buyer.allowed_task_types": ["SOCIAL", "VIDEO", "CUSTOM"],
  "buyer.require_kyc": false,
  "buyer.auto_approve_tasks": false,
  "buyer.refund_fee_on_reject": true,
  // Security
  password_min_length: 8,
  require_strong_passwords: true,
  "kyc.autoEnabled": true,
  "kyc.faceMinSimilarity": 88,
  "kyc.ocrMinConfidence": 0.7,
  "kyc.ocrRejectBelow": 0.2,
  // Email
  smtp_host: "smtp.gmail.com",
  smtp_port: 587,
  smtp_username: "noreply@earngpt.com",
  smtp_password: "",
  email_from_address: "noreply@earngpt.com",
  email_from_name: "EarnGPT Team",
  email_notifications_enabled: true,
  // Notifications
  push_notifications_enabled: true,
  notify_new_task: true,
  notify_withdrawal: true,
  notify_referral: true,
  notify_level_up: true,
  // Integrations
  gemini_api_key: "",
  openai_api_key: "",
  magnific_api_key: "",
  magnific_webhook_secret: "",
  "bkash.appKey": "",
  "bkash.appSecret": "",
  "bkash.username": "",
  "bkash.password": "",
  "sslcommerz.storeId": "",
  "sslcommerz.storePasswd": "",
  "integrations.telegram_bot_token": "",
  "integrations.telegram_bot_username": "",
  "integrations.discord_client_id": "",
  "integrations.discord_client_secret": "",
  "integrations.discord_bot_token": "",
  // Limits
  max_withdrawals_per_day: 1,
  max_referrals_per_user: 0,
  max_active_listings: 0,
  "ai.daily_limit_per_user": 50,
  "social.ai_regenerate_limit": 2,
  "tasks.sequential_unlock": false,
  "antifraud.auto_approve_min_trust": 0,
  "antifraud.spot_check_percent": 0,
  "antifraud.block_duplicate_proof": false,
  "antifraud.max_users_per_ip": 0,
  "antifraud.vpn_block_enabled": false,
  "antifraud.vpn_ranges": "",
  "antifraud.adblock_gate_enabled": true,
  "antifraud.adblock_reminder_minutes": 0,
  // Log retention windows (days) — consumed by the daily pruning cron
  retention_days: { views: 90, logs: 120, audit: 365, notifications: 60 },
  // Popups / install (site-wide)
  "ui.cookies_popup_enabled": true,
  "ui.notification_popup_enabled": true,
  "ui.pwa_install_prompt_enabled": true,
  "ui.require_profile_completion": false,
  "ui.require_kyc_for_withdrawal": true,
  "ui.groups_enabled": false,
  // Dark, and users may choose — the behaviour before these settings existed,
  // so an install with no rows saved is unchanged.
  "ui.theme_default": "dark",
  "ui.theme_user_choice": true,
  analytics_pageviews_enabled: true,
};


export function SystemSettingsForm({
  initial,
  canEdit,
  platformList = [],
}: SystemSettingsFormProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("general");
  const [values, setValues] = useState<SettingsBag>({
    ...DEFAULTS,
    ...initial,
  });
  const [busy, setBusy] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const set = <K extends string>(k: K, v: unknown) =>
    setValues((p) => ({ ...p, [k]: v }));

  const saveCategory = async (category: string) => {
    setBusy(true);
    try {
      // Pluck only keys that belong to this category
      const payload: SettingsBag = {};
      for (const [k, v] of Object.entries(values)) {
        if (CATEGORY_FOR_KEY[k] === category) payload[k] = v;
      }
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, settings: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${category[0].toUpperCase() + category.slice(1)} settings saved`);
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const resetCategory = async (category: string) => {
    if (!(await confirmDialog({ title: `Reset all ${category} settings to defaults?`, tone: "danger", confirmLabel: "Reset" }))) return;
    setValues((p) => {
      const next = { ...p };
      for (const [k, v] of Object.entries(DEFAULTS)) {
        if (CATEGORY_FOR_KEY[k] === category) next[k] = v;
      }
      return next;
    });
    toast.info("Reset to defaults — click Save to persist");
  };

  const sendTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.details ?? data?.error ?? "Failed to send");
      }
      toast.success(data?.message ?? "Test email sent");
    } catch (err) {
      toast.error("Test email failed", {
        description:
          err instanceof Error ? err.message : "Check SMTP settings",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  /**
   * Jump to a control the search box found.
   *
   * The tab has to change before the element exists, so the scroll waits a
   * frame. The ring is applied to the DOM directly rather than held in state:
   * it is a two-second visual cue, not a fact about the form.
   */
  const jumpTo = (group: SettingGroupId, key: string) => {
    setTab(group);
    requestAnimationFrame(() => {
      const el = document.getElementById(settingDomId(key));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-blue-500/70", "rounded-lg");
      window.setTimeout(
        () => el.classList.remove("ring-2", "ring-blue-500/70", "rounded-lg"),
        2200
      );
    });
  };

  const activeGroup = TABS.find((t) => t.id === tab);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800">
      <SettingsSearch onPick={jumpTo} />

      {/* Tab strip */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto px-3 pt-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap inline-flex items-center gap-2 transition-colors",
                tab === t.id
                  ? "bg-slate-800 text-white border-b-2 border-blue-500 -mb-px"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-6 space-y-4">
        {activeGroup && (
          <p className="-mt-1 mb-1 text-xs text-slate-500">
            {activeGroup.blurb}
          </p>
        )}
        {tab === "general" && (
          <div className="space-y-4">
            <Field settingKey="platform_name"
            >
              <input
                value={(values.platform_name as string) || ""}
                onChange={(e) => set("platform_name", e.target.value)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <NotWired
              items={[
                {
                  label: "Platform URL, Logo, Favicon, Support email",
                  why: "The page title, social cards, logo, favicon and the support address are compile-time values (app/layout.tsx, config/company.ts). Changing them is a rebrand \u2014 canonical URLs, the PWA manifest and the legal pages all have to move together \u2014 not a settings row.",
                },
                {
                  label: "Timezone & Language",
                  why: "Dates render in each visitor's own locale and the app ships in English only. Neither box has anything to change yet.",
                },
              ]}
            />
            <Toggle settingKey="maintenance_mode"
              checked={!!values.maintenance_mode}
              onChange={(v) => set("maintenance_mode", v)}
              disabled={!canEdit}
              tone="red"
            />
            {!!values.maintenance_mode && (
              <Field settingKey="maintenance_message"
              >
                <textarea
                  rows={3}
                  value={(values.maintenance_message as string) || ""}
                  onChange={(e) => set("maintenance_message", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                  placeholder="We are performing scheduled maintenance. Please check back shortly."
                />
              </Field>
            )}
          </div>
        )}

        {tab === "financial" && (
          <div className="space-y-4">
            <Field settingKey="currency">
              <select
                value={(values.currency as string) || "USD"}
                onChange={(e) => set("currency", e.target.value)}
                disabled={!canEdit}
                className={inp}
              >
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
                <option>INR</option>
                <option>BDT</option>
              </select>
            </Field>
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
            <Field settingKey="withdrawal_fee_percent"
            >
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
            <Field settingKey="marketplace.fee_percent"
            >
              <input
                type="number"
                step={0.1}
                min={0}
                max={100}
                value={Number(values["marketplace.fee_percent"] ?? 5)}
                onChange={(e) =>
                  set("marketplace.fee_percent", parseFloat(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
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
            <Field settingKey="withdrawal_payout_time_message"
            >
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
            <ManagedElsewhere
              label="Referral commission %"
              href="/admin/referrals/settings"
              linkLabel="Referral Settings"
              why="Commission is per level and there can be up to 10 of them, so it lives in its own table — three boxes here could never describe it."
            />
            <ManagedElsewhere
              label="Task reward multiplier"
              href="/admin/packages"
              linkLabel="Packages"
              why="The multiplier is a property of the user's package, not one global number — that is what task approval actually reads."
            />
            <Field settingKey="points_per_usd"
              /* eslint-disable-next-line no-restricted-syntax -- a per-point
                 RATE shown at 4dp, not a currency amount; usd() would round it
                 to $0.00. */
              hint={`${Number(values.points_per_usd ?? 1000).toLocaleString()} pts = $1 · 1 pt = $${(
                1 / Math.max(1, Number(values.points_per_usd ?? 1000))
              ).toFixed(4)} — controls all earnings & withdrawals`}
            >
              <input
                type="number"
                step={1}
                min={1}
                value={Number(values.points_per_usd ?? 1000)}
                onChange={(e) =>
                  set("points_per_usd", parseFloat(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field settingKey="points_convert_threshold"
            >
              <input
                type="number"
                min={1}
                step={1}
                value={Number(values.points_convert_threshold ?? 1000)}
                onChange={(e) =>
                  set("points_convert_threshold", parseInt(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field settingKey="bkash.usdToBdtRate"
            >
              <input
                type="number"
                min={1}
                step={0.01}
                value={Number(values["bkash.usdToBdtRate"] ?? 123)}
                onChange={(e) =>
                  set("bkash.usdToBdtRate", parseFloat(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Toggle settingKey="vat_enabled"
              checked={!!values.vat_enabled}
              onChange={(v) => set("vat_enabled", v)}
              disabled={!canEdit}
              tone="amber"
            />
            {!!values.vat_enabled && (
              <Field settingKey="vat_pct">
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={100}
                  value={Number(values.vat_pct ?? 15)}
                  onChange={(e) => set("vat_pct", parseFloat(e.target.value))}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            )}
            <Section title="Advertising">
              <p className="-mt-1 mb-2 text-xs leading-relaxed text-slate-500">
                The default price an advertiser pays for one click, used by any
                ad space that has no price of its own. Today that is every space:
                none of the 29 has a per-space rate set, so this one number
                prices a click on the withdrawal page — the longest-dwell screen
                on the platform — exactly the same as a click on a banner nobody
                scrolls to. Per-space prices live in{" "}
                <Link href="/admin/ads" className="text-blue-400 hover:underline">
                  Ad Manager &rarr; Spaces
                </Link>
                , and anything set there overrides this.
              </p>
              <Field settingKey="ads.cpcUsd"
              >
                <input
                  type="number"
                  min={0.001}
                  max={100}
                  step={0.01}
                  value={Number(values["ads.cpcUsd"] ?? 0.05)}
                  onChange={(e) => set("ads.cpcUsd", parseFloat(e.target.value))}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </Section>
            <Section title="Buyer & task funding">
              <p className="-mt-1 mb-2 text-xs leading-relaxed text-slate-500">
                A buyer funds a task from bought task credit: nothing is taken
                up front, and each approved completion charges the buyer for
                itself, plus the fee below as the platform&rsquo;s cut. A task
                stops being shown the moment the buyer can no longer cover one
                more completion. Who may create tasks at all is a per-user
                grant (Users &rarr; features), not a switch here.
              </p>
              <Toggle settingKey="buyer.enabled"
                checked={values["buyer.enabled"] !== false}
                onChange={(v) => set("buyer.enabled", v)}
                disabled={!canEdit}
                tone="amber"
              />
              <Field settingKey="buyer.fee_percent"
                hint={(() => {
                  const pct = Number(values["buyer.fee_percent"] ?? 0);
                  const ppu = Math.max(1, Number(values.points_per_usd ?? 1000));
                  const example = (100 * 50) / ppu;
                  return pct > 0
                    ? `e.g. 100 completions x 50 pts = ${usd(example)} of rewards + ${usd((example * pct) / 100)} fee = ${usd(example * (1 + pct / 100))} charged, as those completions happen`
                    : "0 means buyers pay only the reward per completion and the platform earns nothing on task funding";
                })()}
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={Number(values["buyer.fee_percent"] ?? 0)}
                  onChange={(e) =>
                    set("buyer.fee_percent", parseFloat(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field settingKey="buyer.min_points_per_task">
                  <input
                    type="number"
                    min={1}
                    value={Number(values["buyer.min_points_per_task"] ?? 1)}
                    onChange={(e) =>
                      set("buyer.min_points_per_task", parseInt(e.target.value))
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="buyer.max_points_per_task">
                  <input
                    type="number"
                    min={1}
                    value={Number(values["buyer.max_points_per_task"] ?? 100000)}
                    onChange={(e) =>
                      set("buyer.max_points_per_task", parseInt(e.target.value))
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              <Field settingKey="buyer.max_active_tasks"
              >
                <input
                  type="number"
                  min={0}
                  value={Number(values["buyer.max_active_tasks"] ?? 0)}
                  onChange={(e) =>
                    set("buyer.max_active_tasks", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field settingKey="buyer.max_completions"
              >
                <input
                  type="number"
                  min={1}
                  value={Number(values["buyer.max_completions"] ?? 100000)}
                  onChange={(e) =>
                    set("buyer.max_completions", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field settingKey="buyer.min_purchase_points"
                >
                  <input
                    type="number"
                    min={1}
                    value={Number(values["buyer.min_purchase_points"] ?? 1000)}
                    onChange={(e) =>
                      set("buyer.min_purchase_points", parseInt(e.target.value))
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="buyer.max_purchase_points"
                >
                  <input
                    type="number"
                    min={1}
                    value={Number(values["buyer.max_purchase_points"] ?? 10000000)}
                    onChange={(e) =>
                      set("buyer.max_purchase_points", parseInt(e.target.value))
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              <Field settingKey="buyer.allowed_task_types"
              >
                <div className="flex flex-wrap gap-2 pt-1">
                  {BUYER_TASK_TYPES.map((t) => {
                    const list = Array.isArray(values["buyer.allowed_task_types"])
                      ? (values["buyer.allowed_task_types"] as string[])
                      : [];
                    const on = list.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          set(
                            "buyer.allowed_task_types",
                            on ? list.filter((x) => x !== t) : [...list, t]
                          )
                        }
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                          on
                            ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                            : "border-slate-700 text-slate-500 hover:text-slate-300"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field settingKey="buyer.allowed_platforms"
                hint={(() => {
                  const list = Array.isArray(values["buyer.allowed_platforms"])
                    ? (values["buyer.allowed_platforms"] as string[])
                    : [];
                  return list.length === 0
                    ? `all ${platformList.length} · a platform added later is included automatically`
                    : `${list.length} of ${platformList.length} selected`;
                })()}
              >
                <PlatformAllowList
                  all={platformList}
                  value={
                    Array.isArray(values["buyer.allowed_platforms"])
                      ? (values["buyer.allowed_platforms"] as string[])
                      : []
                  }
                  onChange={(v) => set("buyer.allowed_platforms", v)}
                  disabled={!canEdit}
                />
              </Field>

              <Toggle settingKey="buyer.require_kyc"
                checked={!!values["buyer.require_kyc"]}
                onChange={(v) => set("buyer.require_kyc", v)}
                disabled={!canEdit}
              />
              <Toggle settingKey="buyer.auto_approve_tasks"
                checked={!!values["buyer.auto_approve_tasks"]}
                onChange={(v) => set("buyer.auto_approve_tasks", v)}
                disabled={!canEdit}
                tone="red"
              />
              <Toggle settingKey="buyer.refund_fee_on_reject"
                checked={values["buyer.refund_fee_on_reject"] !== false}
                onChange={(v) => set("buyer.refund_fee_on_reject", v)}
                disabled={!canEdit}
              />
            </Section>
          </div>
        )}

        {tab === "security" && (
          <div className="space-y-4">
            <Section title="Passwords">
              <Field settingKey="password_min_length"
              >
                <input
                  type="number"
                  min={6}
                  max={64}
                  value={Number(values.password_min_length ?? 8)}
                  onChange={(e) =>
                    set("password_min_length", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Toggle settingKey="require_strong_passwords"
                checked={values.require_strong_passwords !== false}
                onChange={(v) => set("require_strong_passwords", v)}
                disabled={!canEdit}
              />
            </Section>
            <ManagedElsewhere
              label="Require KYC for withdrawals"
              href="/admin/settings"
              linkLabel="Toggles tab"
              why="There were two switches for this and only the one on the Toggles tab (ui.require_kyc_for_withdrawal) was ever read by the withdrawal gate."
            />
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
            <Field settingKey="kyc.ocrRejectBelow"
            >
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
            <ManagedElsewhere
              label="Fraud detection"
              href="/admin/settings"
              linkLabel="Limits tab"
              why="The switches that actually run — accounts per IP, duplicate-proof blocking, VPN ranges, spot-check rate, the ad-block gate — are the antifraud group on the Limits tab."
            />
            <ManagedElsewhere
              label="Require full profile before withdrawing"
              href="/admin/settings"
              linkLabel="Toggles tab"
              why="Enforced by ui.require_profile_completion on the Toggles tab. The duplicate here was never read."
            />
            <NotWired
              items={[
                {
                  label: "Session timeout",
                  why: "Session lifetime is fixed in the Auth.js config and applied when the process boots, so it cannot be changed from a settings row without a redeploy.",
                },
                {
                  label: "Max login attempts / lockout",
                  why: "There is no lockout store yet. Login is rate-limited per IP (10/min) but failures are not counted per account.",
                },
                {
                  label: "Admin IP whitelist",
                  why: "Nothing checks a source IP against a list. Restrict admin access at the firewall for now.",
                },
                {
                  label: "Force 2FA for admins",
                  why: "2FA can be enrolled voluntarily (/api/2fa/setup) but nothing requires it at login.",
                },
              ]}
            />
          </div>
        )}

        {tab === "email" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field settingKey="smtp_host">
                <input
                  value={(values.smtp_host as string) || ""}
                  onChange={(e) => set("smtp_host", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field settingKey="smtp_port">
                <input
                  type="number"
                  value={Number(values.smtp_port ?? 587)}
                  onChange={(e) => set("smtp_port", parseInt(e.target.value))}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <Field settingKey="smtp_username">
              <input
                value={(values.smtp_username as string) || ""}
                onChange={(e) => set("smtp_username", e.target.value)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field settingKey="smtp_password">
              <input
                type="password"
                value={(values.smtp_password as string) || ""}
                onChange={(e) => set("smtp_password", e.target.value)}
                disabled={!canEdit}
                className={inp}
                placeholder="••••••••"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field settingKey="email_from_address">
                <input
                  type="email"
                  value={(values.email_from_address as string) || ""}
                  onChange={(e) => set("email_from_address", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field settingKey="email_from_name">
                <input
                  value={(values.email_from_name as string) || ""}
                  onChange={(e) => set("email_from_name", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <Toggle settingKey="email_notifications_enabled"
              checked={!!values.email_notifications_enabled}
              onChange={(v) => set("email_notifications_enabled", v)}
              disabled={!canEdit}
            />
            <button
              type="button"
              onClick={sendTestEmail}
              disabled={testingEmail || !canEdit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 disabled:opacity-50"
            >
              {testingEmail ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Test Email
            </button>
          </div>
        )}

        {tab === "notifications" && (
          <div className="space-y-3">
            <Toggle settingKey="push_notifications_enabled"
              checked={values.push_notifications_enabled !== false}
              onChange={(v) => set("push_notifications_enabled", v)}
              disabled={!canEdit}
            />
            <div className="border-t border-slate-800 pt-3 mt-3 space-y-3">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                Auto-notify users on
              </p>
              <p className="text-xs text-slate-500">
                Off means the email and push are not sent. The in-app
                notification is still recorded either way — muting a channel
                should not erase the record of what happened to a user.
              </p>
              <Toggle settingKey="notify_new_task"
                checked={values.notify_new_task !== false}
                onChange={(v) => set("notify_new_task", v)}
                disabled={!canEdit}
              />
              <Toggle settingKey="notify_withdrawal"
                checked={values.notify_withdrawal !== false}
                onChange={(v) => set("notify_withdrawal", v)}
                disabled={!canEdit}
              />
              <Toggle settingKey="notify_referral"
                checked={values.notify_referral !== false}
                onChange={(v) => set("notify_referral", v)}
                disabled={!canEdit}
              />
              <Toggle settingKey="notify_level_up"
                checked={values.notify_level_up !== false}
                onChange={(v) => set("notify_level_up", v)}
                disabled={!canEdit}
              />
            </div>
          </div>
        )}

        {tab === "integrations" && (
          <div className="space-y-4">
            <Section title="AI & Machine Learning">
              <p className="text-xs text-slate-500 -mt-1 mb-2">
                Paste a key and press Save — it takes effect immediately, with no
                redeploy. The matching environment variable wins when it is set.
                &ldquo;Test&rdquo; asks the provider whether the key is good using a
                read-only call, so it never spends generation credits.
              </p>
              <div className="space-y-3">
                <Field settingKey="gemini_api_key">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={(values.gemini_api_key as string) || ""}
                      onChange={(e) => set("gemini_api_key", e.target.value)}
                      disabled={!canEdit}
                      className={inp}
                      placeholder="AIza…"
                    />
                    <TestKeyButton provider="GEMINI" disabled={!canEdit} />
                  </div>
                </Field>
                <Field settingKey="openai_api_key">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={(values.openai_api_key as string) || ""}
                      onChange={(e) => set("openai_api_key", e.target.value)}
                      disabled={!canEdit}
                      className={inp}
                      placeholder="sk-…"
                    />
                    <TestKeyButton provider="OPENAI" disabled={!canEdit} />
                  </div>
                </Field>
                <Field settingKey="magnific_api_key">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={(values.magnific_api_key as string) || ""}
                      onChange={(e) => set("magnific_api_key", e.target.value)}
                      disabled={!canEdit}
                      className={inp}
                    />
                    <TestKeyButton provider="MAGNIFIC" disabled={!canEdit} />
                  </div>
                </Field>
                <Field settingKey="magnific_webhook_secret">
                  <input
                    type="password"
                    value={(values.magnific_webhook_secret as string) || ""}
                    onChange={(e) => set("magnific_webhook_secret", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
            </Section>
            <Section title="Payment gateway credentials">
              <p className="text-xs text-slate-500 -mt-1 mb-2">
                Used by the bKash and SSLCommerz deposit flows. The matching
                environment variables win when they are set, so these boxes are
                for deployments that cannot set env vars. Which methods are
                offered to users is configured under Payment Methods.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field settingKey="bkash.appKey">
                  <input
                    type="password"
                    value={(values["bkash.appKey"] as string) || ""}
                    onChange={(e) => set("bkash.appKey", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="bkash.appSecret">
                  <input
                    type="password"
                    value={(values["bkash.appSecret"] as string) || ""}
                    onChange={(e) => set("bkash.appSecret", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="bkash.username">
                  <input
                    value={(values["bkash.username"] as string) || ""}
                    onChange={(e) => set("bkash.username", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="bkash.password">
                  <input
                    type="password"
                    value={(values["bkash.password"] as string) || ""}
                    onChange={(e) => set("bkash.password", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="sslcommerz.storeId">
                  <input
                    value={(values["sslcommerz.storeId"] as string) || ""}
                    onChange={(e) => set("sslcommerz.storeId", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="sslcommerz.storePasswd">
                  <input
                    type="password"
                    value={(values["sslcommerz.storePasswd"] as string) || ""}
                    onChange={(e) =>
                      set("sslcommerz.storePasswd", e.target.value)
                    }
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
            </Section>
            <ManagedElsewhere
              label="Payment gateways"
              href="/admin/payment-methods"
              linkLabel="Payment Methods"
              why="Deposits and payouts run on the payment methods you configure there (bKash, SSLCommerz and the manual methods). There is no Stripe or Twilio integration in the platform, so those key boxes stored text nothing could ever use."
            />
            <NotWired
              items={[
                {
                  label: "Google Analytics / Facebook Pixel",
                  why: "No third-party tracking script is injected. Page and traffic analytics are first-party (/admin/analytics), and adding a tag also has to pass the cookie-consent gate — so it needs building, not just an ID.",
                },
              ]}
            />
            <Section title="Social task verification (bots)">
              <p className="text-xs text-slate-500 -mt-1 mb-2">
                Powers auto-verified Telegram/Discord JOIN tasks. Create a bot,
                add it to the target channel/server as admin, then paste the
                tokens here. Feature stays dormant until set.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field settingKey="integrations.telegram_bot_token">
                  <input
                    type="password"
                    value={(values["integrations.telegram_bot_token"] as string) || ""}
                    onChange={(e) => set("integrations.telegram_bot_token", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="integrations.telegram_bot_username">
                  <input
                    value={(values["integrations.telegram_bot_username"] as string) || ""}
                    onChange={(e) => set("integrations.telegram_bot_username", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field settingKey="integrations.discord_client_id">
                  <input
                    value={(values["integrations.discord_client_id"] as string) || ""}
                    onChange={(e) => set("integrations.discord_client_id", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field settingKey="integrations.discord_client_secret">
                  <input
                    type="password"
                    value={(values["integrations.discord_client_secret"] as string) || ""}
                    onChange={(e) => set("integrations.discord_client_secret", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              <Field settingKey="integrations.discord_bot_token">
                <input
                  type="password"
                  value={(values["integrations.discord_bot_token"] as string) || ""}
                  onChange={(e) => set("integrations.discord_bot_token", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </Section>
          </div>
        )}

        {tab === "limits" && (
          <div className="space-y-4">
            <ManagedElsewhere
              label="Max tasks per day"
              href="/admin/packages"
              linkLabel="Packages"
              why="The daily task limit is per package (Daily Task Limit), which is what the task list actually enforces. One global number here would override nothing."
            />
            <div className="grid grid-cols-2 gap-3">
              <Field settingKey="max_withdrawals_per_day"
              >
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
              <Field settingKey="max_referrals_per_user"
              >
                <input
                  type="number"
                  min={0}
                  value={Number(values.max_referrals_per_user ?? 0)}
                  onChange={(e) =>
                    set("max_referrals_per_user", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field settingKey="max_active_listings"
              >
                <input
                  type="number"
                  min={0}
                  value={Number(values.max_active_listings ?? 0)}
                  onChange={(e) =>
                    set("max_active_listings", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field settingKey="ai.daily_limit_per_user">
                <input
                  type="number"
                  min={-1}
                  value={Number(values["ai.daily_limit_per_user"] ?? 50)}
                  onChange={(e) =>
                    set("ai.daily_limit_per_user", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              {/*
                Read by `api/tasks/[id]/ai-recipe` since the day it shipped and
                editable nowhere: the key sat in DEFAULTS and in the category
                map, which was enough to satisfy the "every setting has an
                editor" check without any admin ever being able to change it.
                A default that can only be changed in code is not a setting.
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
            </div>
            <Toggle settingKey="tasks.sequential_unlock"
              checked={values["tasks.sequential_unlock"] === true}
              onChange={(v) => set("tasks.sequential_unlock", v)}
              disabled={!canEdit}
            />
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

            <Section title="Network anti-abuse">
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <Toggle settingKey="antifraud.vpn_block_enabled"
                checked={values["antifraud.vpn_block_enabled"] === true}
                onChange={(v) => set("antifraud.vpn_block_enabled", v)}
                disabled={!canEdit}
              />
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
              <Toggle settingKey="antifraud.adblock_gate_enabled"
                checked={values["antifraud.adblock_gate_enabled"] !== false}
                onChange={(v) => set("antifraud.adblock_gate_enabled", v)}
                disabled={!canEdit}
              />
            </Section>

            {/*
              Four inputs, one key: `retention_days` is a single JSON row. The
              anchor goes on the section so the search box can still land on it.
            */}
            <Section
              title="Log retention (days)"
              id={settingDomId("retention_days")}
              settingKey="retention_days"
            >
              <p className="text-xs text-slate-500 -mt-1 mb-2">
                {settingEntry("retention_days")?.description}. Higher = keep
                longer. Unread notifications are never deleted.
              </p>
              {(() => {
                const r = {
                  ...(DEFAULTS.retention_days as Record<string, number>),
                  ...((values.retention_days as Record<string, number>) ?? {}),
                };
                const setR = (k: string, v: number) =>
                  set("retention_days", { ...r, [k]: v });
                const fields: Array<{ k: string; label: string }> = [
                  { k: "views", label: "View/impression logs" },
                  { k: "logs", label: "Ad & social action logs" },
                  { k: "audit", label: "Audit log" },
                  { k: "notifications", label: "Read notifications" },
                ];
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {fields.map((f) => (
                      <Field key={f.k} label={f.label}>
                        <input
                          type="number"
                          min={1}
                          value={Number(r[f.k] ?? 0)}
                          onChange={(e) =>
                            setR(f.k, parseInt(e.target.value) || 1)
                          }
                          disabled={!canEdit}
                          className={inp}
                        />
                      </Field>
                    ))}
                  </div>
                );
              })()}
            </Section>
          </div>
        )}

        {tab === "ui_toggles" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Site-wide switches. These apply to every user immediately
              (within a minute — the values are memoised server-side).
            </p>
            <Toggle settingKey="analytics_pageviews_enabled"
              checked={values.analytics_pageviews_enabled !== false}
              onChange={(v) => set("analytics_pageviews_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle settingKey="ui.cookies_popup_enabled"
              checked={values["ui.cookies_popup_enabled"] !== false}
              onChange={(v) => set("ui.cookies_popup_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle settingKey="ui.notification_popup_enabled"
              checked={values["ui.notification_popup_enabled"] !== false}
              onChange={(v) => set("ui.notification_popup_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle settingKey="ui.pwa_install_prompt_enabled"
              checked={values["ui.pwa_install_prompt_enabled"] !== false}
              onChange={(v) => set("ui.pwa_install_prompt_enabled", v)}
              disabled={!canEdit}
              tone="purple"
            />
            <Toggle settingKey="ui.require_profile_completion"
              checked={values["ui.require_profile_completion"] === true}
              onChange={(v) => set("ui.require_profile_completion", v)}
              disabled={!canEdit}
              tone="amber"
            />
            <Toggle settingKey="ui.require_kyc_for_withdrawal"
              checked={values["ui.require_kyc_for_withdrawal"] !== false}
              onChange={(v) => set("ui.require_kyc_for_withdrawal", v)}
              disabled={!canEdit}
              tone="red"
            />
            <Toggle settingKey="ui.groups_enabled"
              checked={values["ui.groups_enabled"] === true}
              onChange={(v) => set("ui.groups_enabled", v)}
              disabled={!canEdit}
              tone="purple"
            />
            {/* Appearance. Two controls that belong together: which theme the
                platform wears, and whether a user may change it. With choice
                off the default is not a starting point any more — it is the
                theme, for everyone, including users who had already picked the
                other one. */}
            <Field settingKey="ui.theme_default">
              <select
                value={(values["ui.theme_default"] as string) || "dark"}
                onChange={(e) => set("ui.theme_default", e.target.value)}
                disabled={!canEdit}
                className={inp}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </Field>
            <Toggle settingKey="ui.theme_user_choice"
              checked={values["ui.theme_user_choice"] !== false}
              onChange={(v) => set("ui.theme_user_choice", v)}
              disabled={!canEdit}
              tone="emerald"
            />
            <Toggle settingKey="ui.require_email_verification"
              checked={values["ui.require_email_verification"] === true}
              onChange={(v) => set("ui.require_email_verification", v)}
              disabled={!canEdit}
              tone="amber"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => resetCategory(tab)}
          disabled={!canEdit || busy}
          className="inline-flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Defaults
        </button>
        <button
          type="button"
          onClick={() => saveCategory(tab)}
          disabled={!canEdit || busy}
          className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save {TABS.find((t) => t.id === tab)?.label} Settings
        </button>
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

/**
 * A control that used to live here and does not any more.
 *
 * Several boxes on this form wrote a `SystemSetting` row that **nothing on the
 * platform ever read** — `task_reward_multiplier`, `referral_l*_pct`,
 * `max_tasks_per_day`. The real value was always somewhere else (the package
 * row, the `ReferralLevel` table). An admin who typed a number here and pressed
 * Save got a success toast and no change in behaviour, which is worse than
 * having no control at all.
 *
 * Rather than delete them silently — an admin looking for "referral %" would
 * then find nothing — each one is replaced by a pointer to where the value
 * really lives.
 */
function ManagedElsewhere({
  label,
  href,
  linkLabel,
  why,
}: {
  label: string;
  href: string;
  linkLabel: string;
  why: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
        >
          {linkLabel}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{why}</p>
    </div>
  );
}

/**
 * Controls this screen used to offer that the platform cannot yet honour.
 *
 * The honest alternative to a switch that silently does nothing is not to
 * delete the idea — an owner who goes looking for "force 2FA" and finds no
 * mention of it assumes they missed it, and may assume it is on. It is to say
 * plainly that it is not built, and why, so the gap is a known one.
 *
 * An entry here is a promise to either build it or drop it, not a permanent
 * home. `scripts/verify-settings-truth.ts` keeps the list honest from the other
 * direction: a key that IS wired must not sit here.
 */
function NotWired({
  items,
}: {
  items: { label: string; why: string }[];
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Not built yet
      </p>
      <p className="mt-1 text-xs text-slate-500">
        These used to be switches here that saved successfully and changed
        nothing. They are listed rather than hidden so the gap is visible.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.label} className="text-xs leading-relaxed">
            <span className="font-medium text-slate-400">{it.label}</span>
            <span className="text-slate-600"> — {it.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Which of the 40 social platforms buyers may target.
 *
 * EMPTY MEANS ALL, deliberately. An allow-list that starts empty and means
 * "none" would silently close buyer social tasks the moment anyone opened this
 * screen; and if it meant "the ones ticked today", every platform added to the
 * catalog later would be invisible to buyers until somebody remembered to come
 * back here. Empty = everything current and future; tick some to narrow it.
 */
function PlatformAllowList({
  all,
  value,
  onChange,
  disabled,
}: {
  all: { key: string; label: string; emoji: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const allowAll = value.length === 0;
  const shown = q.trim()
    ? all.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()))
    : all;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-xs font-semibold",
            allowAll
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
              : "border-slate-700 text-slate-400 hover:text-white"
          )}
        >
          All platforms
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(all.map((p) => p.key))}
          className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-400 hover:text-white"
        >
          Select each
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="ml-auto w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div
        className={cn(
          "flex max-h-40 flex-wrap gap-1.5 overflow-y-auto",
          allowAll && "opacity-50"
        )}
      >
        {shown.map((p) => {
          const on = allowAll || value.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  // Coming out of "all", the first click means "everything
                  // except this one" — which is what unticking one of a full
                  // set has to mean.
                  allowAll
                    ? all.map((x) => x.key).filter((k) => k !== p.key)
                    : value.includes(p.key)
                      ? value.filter((k) => k !== p.key)
                      : [...value, p.key]
                )
              }
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                on
                  ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              )}
            >
              {p.emoji} {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One labelled control.
 *
 * Pass `settingKey` and nothing else: the name and the plain-language
 * description come from `admin-settings-catalog.ts`, which is also what the
 * search box indexes and what `CATEGORY_FOR_KEY` is derived from. One row in
 * one file describes a setting completely, so the label and the key cannot
 * drift apart — which is exactly how users once got charged a 5% withdrawal
 * fee from a box the owner had set to 2.5%.
 *
 * `label`/`hint` remain for the handful of controls that are not one setting
 * each (the retention-window grid writes four fields of one JSON key).
 */
/**
 * Ask the provider whether the SAVED key works.
 *
 * Deliberately tests what is stored, not what is typed in the box beside it: an
 * owner who pastes a key and tests without saving would otherwise be told it is
 * fine while every feature still reads the old one.
 */
function TestKeyButton({
  provider,
  disabled,
}: {
  provider: "GEMINI" | "OPENAI" | "MAGNIFIC";
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "bad">("idle");
  const [note, setNote] = useState("");

  const run = async () => {
    setState("busy");
    setNote("");
    try {
      const res = await fetch("/api/admin/settings/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setState("ok");
        setNote(json.message ?? "Key works.");
      } else {
        setState("bad");
        setNote(json.error ?? "That key did not work.");
      }
    } catch (e) {
      setState("bad");
      setNote(e instanceof Error ? e.message : "Could not reach the provider");
    }
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={run}
        disabled={disabled || state === "busy"}
        className="h-full px-3 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50"
      >
        {state === "busy" ? "Testing…" : "Test"}
      </button>
      {note && (
        <p
          className={`mt-1 max-w-[16rem] text-[11px] ${
            state === "ok" ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  settingKey,
  children,
}: {
  label?: string;
  hint?: string;
  settingKey?: string;
  children: React.ReactNode;
}) {
  const entry = settingKey ? settingEntry(settingKey) : undefined;
  const shownLabel = label ?? entry?.label ?? settingKey;
  const shownHint = hint ?? entry?.description;
  return (
    <div
      id={settingKey ? settingDomId(settingKey) : undefined}
      data-setting-key={settingKey}
      className="scroll-mt-28"
    >
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {shownLabel}
        {entry?.status === "not-active" && <NotActiveBadge />}
        {shownHint && <span className="text-slate-600 ml-2">{shownHint}</span>}
      </label>
      {children}
    </div>
  );
}

// `Section` and `Toggle` now live in components/admin/shared/controls.tsx so the
// social-earning screen uses the same switch rather than a look-alike.
