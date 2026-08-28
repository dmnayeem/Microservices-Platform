"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { Section, Toggle } from "@/components/admin/shared/controls";

export type SettingsBag = Record<string, unknown>;

interface SystemSettingsFormProps {
  initial: SettingsBag;
  canEdit: boolean;
}

const TABS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "financial", label: "Financial", icon: DollarSign },
  { id: "security", label: "Security", icon: Shield },
  { id: "email", label: "Email", icon: Mail },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "limits", label: "Limits", icon: SlidersHorizontal },
  { id: "ui_toggles", label: "Toggles", icon: MonitorSmartphone },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DEFAULTS: SettingsBag = {
  // General
  platform_name: "EarnGPT",
  platform_url: "https://earngpt.com",
  support_email: "support@earngpt.com",
  logo_url: "/logo.png",
  favicon_url: "/favicon.ico",
  timezone: "UTC",
  language: "en",
  workspace_locked: false,
  maintenance_mode: false,
  // Financial
  currency: "USD",
  min_withdrawal: 5,
  max_withdrawal: 10000,
  withdrawal_fee_pct: 2.5,
  referral_l1_pct: 10,
  referral_l2_pct: 5,
  referral_l3_pct: 2,
  task_reward_multiplier: 1.0,
  points_per_usd: 1000,
  vat_enabled: false,
  vat_pct: 15,
  // Security
  session_timeout_seconds: 3600,
  max_login_attempts: 5,
  password_min_length: 8,
  require_kyc: true,
  require_2fa: false,
  require_strong_passwords: true,
  ip_whitelist_enabled: false,
  fraud_detection_enabled: true,
  require_full_profile_for_withdraw: false,
  "kyc.autoEnabled": true,
  "kyc.faceMinSimilarity": 88,
  "kyc.ocrMinConfidence": 0.7,
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
  sms_notifications_enabled: false,
  notify_new_task: true,
  notify_withdrawal: true,
  notify_referral: true,
  notify_level_up: true,
  // Integrations
  gemini_api_key: "",
  stripe_public_key: "",
  stripe_secret_key: "",
  twilio_sid: "",
  twilio_token: "",
  google_analytics_id: "",
  facebook_pixel_id: "",
  "integrations.telegram_bot_token": "",
  "integrations.telegram_bot_username": "",
  "integrations.discord_client_id": "",
  "integrations.discord_client_secret": "",
  "integrations.discord_bot_token": "",
  // Limits
  max_tasks_per_day: 50,
  max_withdrawals_per_day: 3,
  max_referrals_per_user: 1000,
  max_active_listings: 10,
  file_upload_max_mb: 5,
  api_rate_limit_per_min: 100,
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
};

const CATEGORY_FOR_KEY: Record<string, string> = {
  // General
  platform_name: "general", platform_url: "general", support_email: "general",
  logo_url: "general", favicon_url: "general", timezone: "general",
  language: "general", workspace_locked: "general", maintenance_mode: "general",
  // Financial
  currency: "financial", min_withdrawal: "financial", max_withdrawal: "financial",
  withdrawal_fee_pct: "financial", referral_l1_pct: "financial",
  referral_l2_pct: "financial", referral_l3_pct: "financial",
  task_reward_multiplier: "financial", points_per_usd: "financial",
  vat_enabled: "financial", vat_pct: "financial",
  // Security
  session_timeout_seconds: "security", max_login_attempts: "security",
  password_min_length: "security", require_kyc: "security", require_2fa: "security",
  require_strong_passwords: "security", ip_whitelist_enabled: "security",
  fraud_detection_enabled: "security", require_full_profile_for_withdraw: "security",
  "kyc.autoEnabled": "security", "kyc.faceMinSimilarity": "security",
  "kyc.ocrMinConfidence": "security",
  // Email
  smtp_host: "email", smtp_port: "email", smtp_username: "email",
  smtp_password: "email", email_from_address: "email", email_from_name: "email",
  email_notifications_enabled: "email",
  // Notifications
  push_notifications_enabled: "notifications", sms_notifications_enabled: "notifications",
  notify_new_task: "notifications", notify_withdrawal: "notifications",
  notify_referral: "notifications", notify_level_up: "notifications",
  // Integrations
  gemini_api_key: "integrations", stripe_public_key: "integrations",
  stripe_secret_key: "integrations", twilio_sid: "integrations",
  twilio_token: "integrations", google_analytics_id: "integrations",
  facebook_pixel_id: "integrations",
  "integrations.telegram_bot_token": "integrations",
  "integrations.telegram_bot_username": "integrations",
  "integrations.discord_client_id": "integrations",
  "integrations.discord_client_secret": "integrations",
  "integrations.discord_bot_token": "integrations",
  // Limits
  max_tasks_per_day: "limits", max_withdrawals_per_day: "limits",
  max_referrals_per_user: "limits", max_active_listings: "limits",
  file_upload_max_mb: "limits", api_rate_limit_per_min: "limits",
  "ai.daily_limit_per_user": "limits", "social.ai_regenerate_limit": "limits",
  "tasks.sequential_unlock": "limits",
  "antifraud.auto_approve_min_trust": "limits",
  "antifraud.spot_check_percent": "limits",
  "antifraud.block_duplicate_proof": "limits",
  "antifraud.max_users_per_ip": "limits",
  "antifraud.vpn_block_enabled": "limits",
  "antifraud.vpn_ranges": "limits",
  "antifraud.adblock_gate_enabled": "limits",
  "antifraud.adblock_reminder_minutes": "limits",
  retention_days: "limits",
  // Popups / install
  "ui.cookies_popup_enabled": "ui_toggles",
  "ui.notification_popup_enabled": "ui_toggles",
  "ui.pwa_install_prompt_enabled": "ui_toggles",
  "ui.require_profile_completion": "ui_toggles",
  "ui.require_kyc_for_withdrawal": "ui_toggles",
  "ui.require_email_verification": "ui_toggles",
  "ui.groups_enabled": "ui_toggles",
};

export function SystemSettingsForm({
  initial,
  canEdit,
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

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800">
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
        {tab === "general" && (
          <div className="space-y-4">
            <Field label="Platform Name">
              <input
                value={(values.platform_name as string) || ""}
                onChange={(e) => set("platform_name", e.target.value)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field label="Platform URL">
              <input
                value={(values.platform_url as string) || ""}
                onChange={(e) => set("platform_url", e.target.value)}
                disabled={!canEdit}
                className={inp}
                placeholder="https://earngpt.com"
              />
            </Field>
            <Field label="Support Email">
              <input
                type="email"
                value={(values.support_email as string) || ""}
                onChange={(e) => set("support_email", e.target.value)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo">
                <ImageUploadField
                  value={(values.logo_url as string) || ""}
                  onChange={(url) => set("logo_url", url)}
                  title="Select Logo"
                  previewSize="square"
                />
              </Field>
              <Field label="Favicon">
                <ImageUploadField
                  value={(values.favicon_url as string) || ""}
                  onChange={(url) => set("favicon_url", url)}
                  title="Select Favicon"
                  previewSize="sm"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Timezone">
                <select
                  value={(values.timezone as string) || "UTC"}
                  onChange={(e) => set("timezone", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                >
                  <option>UTC</option>
                  <option value="America/New_York">Eastern (US)</option>
                  <option value="America/Chicago">Central (US)</option>
                  <option value="America/Los_Angeles">Pacific (US)</option>
                  <option value="Europe/London">London</option>
                  <option value="Asia/Dhaka">Dhaka</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </Field>
              <Field label="Language">
                <select
                  value={(values.language as string) || "en"}
                  onChange={(e) => set("language", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="bn">বাংলা</option>
                </select>
              </Field>
            </div>
            <Toggle
              label="Workspace Locked"
              description="Restricts all earning activities (use during incidents)"
              checked={!!values.workspace_locked}
              onChange={(v) => set("workspace_locked", v)}
              disabled={!canEdit}
              tone="amber"
            />
            <Toggle
              label="Maintenance Mode"
              description="Show maintenance page to all users"
              checked={!!values.maintenance_mode}
              onChange={(v) => set("maintenance_mode", v)}
              disabled={!canEdit}
              tone="red"
            />
          </div>
        )}

        {tab === "financial" && (
          <div className="space-y-4">
            <Field label="Currency">
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
              <Field label="Min Withdrawal ($)">
                <input
                  type="number"
                  step={0.01}
                  value={Number(values.min_withdrawal ?? 0)}
                  onChange={(e) => set("min_withdrawal", parseFloat(e.target.value))}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Max Withdrawal ($)">
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
            <Field label="Withdrawal Fee (%)">
              <input
                type="number"
                step={0.1}
                value={Number(values.withdrawal_fee_pct ?? 0)}
                onChange={(e) =>
                  set("withdrawal_fee_pct", parseFloat(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Referral L1 (%)">
                <input
                  type="number"
                  value={Number(values.referral_l1_pct ?? 0)}
                  onChange={(e) =>
                    set("referral_l1_pct", parseFloat(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Referral L2 (%)">
                <input
                  type="number"
                  value={Number(values.referral_l2_pct ?? 0)}
                  onChange={(e) =>
                    set("referral_l2_pct", parseFloat(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Referral L3 (%)">
                <input
                  type="number"
                  value={Number(values.referral_l3_pct ?? 0)}
                  onChange={(e) =>
                    set("referral_l3_pct", parseFloat(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <Field label="Task Reward Multiplier">
              <input
                type="number"
                step={0.1}
                value={Number(values.task_reward_multiplier ?? 1)}
                onChange={(e) =>
                  set("task_reward_multiplier", parseFloat(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field
              label="Points per $1 (USD)"
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
            <Toggle
              label="Charge VAT on deposits"
              description="Add VAT on top of the deposit amount (shown on the deposit page)"
              checked={!!values.vat_enabled}
              onChange={(v) => set("vat_enabled", v)}
              disabled={!canEdit}
              tone="amber"
            />
            {!!values.vat_enabled && (
              <Field label="VAT (%)" hint="Applied to the deposit amount + method charge">
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
          </div>
        )}

        {tab === "security" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session Timeout (seconds)">
                <input
                  type="number"
                  value={Number(values.session_timeout_seconds ?? 3600)}
                  onChange={(e) =>
                    set("session_timeout_seconds", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Max Login Attempts">
                <input
                  type="number"
                  value={Number(values.max_login_attempts ?? 5)}
                  onChange={(e) =>
                    set("max_login_attempts", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <Field label="Password Min Length">
              <input
                type="number"
                min={6}
                value={Number(values.password_min_length ?? 8)}
                onChange={(e) =>
                  set("password_min_length", parseInt(e.target.value))
                }
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Toggle
              label="Require KYC Verification"
              checked={!!values.require_kyc}
              onChange={(v) => set("require_kyc", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="Instant (auto) KYC verification"
              description="Let users verify instantly via AI OCR + selfie face-match. Uncertain cases still go to manual review."
              checked={values["kyc.autoEnabled"] !== false}
              onChange={(v) => set("kyc.autoEnabled", v)}
              disabled={!canEdit}
            />
            <Field label="Auto KYC — min face-match %">
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
            <Field label="Auto KYC — min OCR confidence (0–1)">
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
            <Toggle
              label="Two-Factor Authentication"
              description="Require 2FA for all admin accounts"
              checked={!!values.require_2fa}
              onChange={(v) => set("require_2fa", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="Require Strong Passwords"
              checked={!!values.require_strong_passwords}
              onChange={(v) => set("require_strong_passwords", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="IP Whitelist (Admin)"
              checked={!!values.ip_whitelist_enabled}
              onChange={(v) => set("ip_whitelist_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="Fraud Detection"
              description="Auto-flag suspicious activity"
              checked={!!values.fraud_detection_enabled}
              onChange={(v) => set("fraud_detection_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="Require 100% Profile Completion for Withdrawals"
              description="Users must complete every profile field before withdrawing"
              checked={!!values.require_full_profile_for_withdraw}
              onChange={(v) => set("require_full_profile_for_withdraw", v)}
              disabled={!canEdit}
              tone="purple"
            />
          </div>
        )}

        {tab === "email" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP Host">
                <input
                  value={(values.smtp_host as string) || ""}
                  onChange={(e) => set("smtp_host", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="SMTP Port">
                <input
                  type="number"
                  value={Number(values.smtp_port ?? 587)}
                  onChange={(e) => set("smtp_port", parseInt(e.target.value))}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <Field label="SMTP Username">
              <input
                value={(values.smtp_username as string) || ""}
                onChange={(e) => set("smtp_username", e.target.value)}
                disabled={!canEdit}
                className={inp}
              />
            </Field>
            <Field label="SMTP Password">
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
              <Field label="From Email">
                <input
                  type="email"
                  value={(values.email_from_address as string) || ""}
                  onChange={(e) => set("email_from_address", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="From Name">
                <input
                  value={(values.email_from_name as string) || ""}
                  onChange={(e) => set("email_from_name", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <Toggle
              label="Enable Email Notifications"
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
            <Toggle
              label="Push Notifications"
              description="Mobile push via OneSignal"
              checked={!!values.push_notifications_enabled}
              onChange={(v) => set("push_notifications_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="SMS Notifications"
              description="SMS via Twilio"
              checked={!!values.sms_notifications_enabled}
              onChange={(v) => set("sms_notifications_enabled", v)}
              disabled={!canEdit}
            />
            <div className="border-t border-slate-800 pt-3 mt-3 space-y-3">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                Auto-notify users on
              </p>
              <Toggle
                label="New Task Available"
                checked={!!values.notify_new_task}
                onChange={(v) => set("notify_new_task", v)}
                disabled={!canEdit}
              />
              <Toggle
                label="Withdrawal Status Updates"
                checked={!!values.notify_withdrawal}
                onChange={(v) => set("notify_withdrawal", v)}
                disabled={!canEdit}
              />
              <Toggle
                label="New Referral"
                checked={!!values.notify_referral}
                onChange={(v) => set("notify_referral", v)}
                disabled={!canEdit}
              />
              <Toggle
                label="Level Up"
                checked={!!values.notify_level_up}
                onChange={(v) => set("notify_level_up", v)}
                disabled={!canEdit}
              />
            </div>
          </div>
        )}

        {tab === "integrations" && (
          <div className="space-y-4">
            <Section title="AI & Machine Learning">
              <Field label="Gemini API Key">
                <input
                  type="password"
                  value={(values.gemini_api_key as string) || ""}
                  onChange={(e) => set("gemini_api_key", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                  placeholder="AIza…"
                />
              </Field>
            </Section>
            <Section title="Payments — Stripe">
              <Field label="Public Key">
                <input
                  value={(values.stripe_public_key as string) || ""}
                  onChange={(e) => set("stripe_public_key", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                  placeholder="pk_live_…"
                />
              </Field>
              <Field label="Secret Key">
                <input
                  type="password"
                  value={(values.stripe_secret_key as string) || ""}
                  onChange={(e) => set("stripe_secret_key", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                  placeholder="sk_live_…"
                />
              </Field>
            </Section>
            <Section title="SMS — Twilio">
              <Field label="Account SID">
                <input
                  value={(values.twilio_sid as string) || ""}
                  onChange={(e) => set("twilio_sid", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Auth Token">
                <input
                  type="password"
                  value={(values.twilio_token as string) || ""}
                  onChange={(e) => set("twilio_token", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </Section>
            <Section title="Analytics">
              <Field label="Google Analytics ID">
                <input
                  value={(values.google_analytics_id as string) || ""}
                  onChange={(e) => set("google_analytics_id", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                  placeholder="G-XXXXXXXX"
                />
              </Field>
              <Field label="Facebook Pixel ID">
                <input
                  value={(values.facebook_pixel_id as string) || ""}
                  onChange={(e) => set("facebook_pixel_id", e.target.value)}
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </Section>
            <Section title="Social task verification (bots)">
              <p className="text-xs text-slate-500 -mt-1 mb-2">
                Powers auto-verified Telegram/Discord JOIN tasks. Create a bot,
                add it to the target channel/server as admin, then paste the
                tokens here. Feature stays dormant until set.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telegram bot token">
                  <input
                    type="password"
                    value={(values["integrations.telegram_bot_token"] as string) || ""}
                    onChange={(e) => set("integrations.telegram_bot_token", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field label="Telegram bot username (@handle)">
                  <input
                    value={(values["integrations.telegram_bot_username"] as string) || ""}
                    onChange={(e) => set("integrations.telegram_bot_username", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discord client ID">
                  <input
                    value={(values["integrations.discord_client_id"] as string) || ""}
                    onChange={(e) => set("integrations.discord_client_id", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
                <Field label="Discord client secret">
                  <input
                    type="password"
                    value={(values["integrations.discord_client_secret"] as string) || ""}
                    onChange={(e) => set("integrations.discord_client_secret", e.target.value)}
                    disabled={!canEdit}
                    className={inp}
                  />
                </Field>
              </div>
              <Field label="Discord bot token">
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max Tasks Per Day">
                <input
                  type="number"
                  value={Number(values.max_tasks_per_day ?? 50)}
                  onChange={(e) =>
                    set("max_tasks_per_day", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Max Withdrawals Per Day">
                <input
                  type="number"
                  value={Number(values.max_withdrawals_per_day ?? 3)}
                  onChange={(e) =>
                    set("max_withdrawals_per_day", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max Referrals Per User">
                <input
                  type="number"
                  value={Number(values.max_referrals_per_user ?? 1000)}
                  onChange={(e) =>
                    set("max_referrals_per_user", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="Max Active Marketplace Listings">
                <input
                  type="number"
                  value={Number(values.max_active_listings ?? 10)}
                  onChange={(e) =>
                    set("max_active_listings", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="File Upload Max Size (MB)">
                <input
                  type="number"
                  value={Number(values.file_upload_max_mb ?? 5)}
                  onChange={(e) =>
                    set("file_upload_max_mb", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="API Rate Limit (per min)">
                <input
                  type="number"
                  value={Number(values.api_rate_limit_per_min ?? 100)}
                  onChange={(e) =>
                    set("api_rate_limit_per_min", parseInt(e.target.value))
                  }
                  disabled={!canEdit}
                  className={inp}
                />
              </Field>
              <Field label="AI Generations / User / Day">
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
            </div>
            <Toggle
              label="Sequential task unlock"
              description="Lock every task behind the previous one — users must finish tasks one-by-one in the admin-set Sequence Order. Resets daily; admins are never locked."
              checked={values["tasks.sequential_unlock"] === true}
              onChange={(v) => set("tasks.sequential_unlock", v)}
              disabled={!canEdit}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Auto-approve min trust (0 = off)">
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
              <Field label="Spot-check % of auto-approvals">
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
            <Toggle
              label="Block duplicate proof"
              description="Reject a task submission whose proof (post/profile URL, username, or re-uploaded screenshot) already matches another user's. Off = flag for review only. Public links can legitimately repeat, so leave off unless abuse is high."
              checked={values["antifraud.block_duplicate_proof"] === true}
              onChange={(v) => set("antifraud.block_duplicate_proof", v)}
              disabled={!canEdit}
            />

            <Section title="Network anti-abuse">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Max accounts per IP (0 = off)">
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
                <Field label="Ad-blocker reminder every N minutes (0 = off)">
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
              <Toggle
                label="Block VPN / proxy (best-effort)"
                description="Block task work from IPs that match the datacenter/VPN prefix list below. Heuristic only — catches roughly 50–70%, not 100%. For full accuracy, integrate a detection provider later."
                checked={values["antifraud.vpn_block_enabled"] === true}
                onChange={(v) => set("antifraud.vpn_block_enabled", v)}
                disabled={!canEdit}
              />
              <Field label="VPN/datacenter IP prefixes (space or comma separated, e.g. 45.83. 2607:5300:)">
                <input
                  type="text"
                  value={String(values["antifraud.vpn_ranges"] ?? "")}
                  onChange={(e) => set("antifraud.vpn_ranges", e.target.value)}
                  disabled={!canEdit}
                  placeholder="45.83. 185.220. 2607:5300:"
                  className={inp}
                />
              </Field>
              <Toggle
                label="Ad-blocker gate on tasks"
                description="Block opening a task while an ad-blocker is detected (a re-check overlay is shown). Turn off to allow tasks with an ad-blocker on."
                checked={values["antifraud.adblock_gate_enabled"] !== false}
                onChange={(v) => set("antifraud.adblock_gate_enabled", v)}
                disabled={!canEdit}
              />
            </Section>

            <Section title="Log retention (days)">
              <p className="text-xs text-slate-500 -mt-1 mb-2">
                The daily pruning job deletes rows older than these windows.
                Higher = keep longer. Unread notifications are never deleted.
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
            <Toggle
              label="Cookie consent popup"
              description="Show the cookie consent banner to visitors"
              checked={values["ui.cookies_popup_enabled"] !== false}
              onChange={(v) => set("ui.cookies_popup_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="Notification permission popup"
              description="Show the “Enable notifications” prompt"
              checked={values["ui.notification_popup_enabled"] !== false}
              onChange={(v) => set("ui.notification_popup_enabled", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="PWA install prompt"
              description="Prompt users who haven't installed the app (Android & iOS); hidden once installed"
              checked={values["ui.pwa_install_prompt_enabled"] !== false}
              onChange={(v) => set("ui.pwa_install_prompt_enabled", v)}
              disabled={!canEdit}
              tone="purple"
            />
            <Toggle
              label="Require profile completion for Tasks & Missions"
              description="Users must fill their core profile (photo, name, DOB, gender, country, phone) before accessing Tasks and Daily Missions"
              checked={values["ui.require_profile_completion"] === true}
              onChange={(v) => set("ui.require_profile_completion", v)}
              disabled={!canEdit}
              tone="amber"
            />
            <Toggle
              label="Require KYC for withdrawals"
              description="Users must be KYC-verified to withdraw. When off, only withdrawals over $100 require KYC."
              checked={values["ui.require_kyc_for_withdrawal"] !== false}
              onChange={(v) => set("ui.require_kyc_for_withdrawal", v)}
              disabled={!canEdit}
              tone="red"
            />
            <Toggle
              label="Groups"
              description="Show the Groups tab on the social feed. When off the tab is hidden AND the group pages and API are blocked, so the feature is genuinely off. Existing groups and their members are kept and come back when you turn this on."
              checked={values["ui.groups_enabled"] === true}
              onChange={(v) => set("ui.groups_enabled", v)}
              disabled={!canEdit}
              tone="purple"
            />
            <Toggle
              label="Require email verification to log in"
              description="Users must verify their email before they can sign in. When off, unverified accounts can log in (Google accounts are always verified)."
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
        {hint && <span className="text-slate-600 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// `Section` and `Toggle` now live in components/admin/shared/controls.tsx so the
// social-earning screen uses the same switch rather than a look-alike.
