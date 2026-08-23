import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "../_components/SettingsForm";
import { ArrowLeft, Settings, DollarSign, Shield, Mail, Bell, Palette, Database, Zap, Globe } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ category: string }>;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; description: string; icon: typeof Settings }
> = {
  general: {
    label: "General Settings",
    description: "Site name, logo, and basic configuration",
    icon: Globe,
  },
  earning: {
    label: "Earning Settings",
    description: "Points conversion, withdrawal limits, and fees",
    icon: DollarSign,
  },
  security: {
    label: "Security Settings",
    description: "KYC requirements, anti-fraud measures",
    icon: Shield,
  },
  email: {
    label: "Email Settings",
    description: "SMTP configuration and email templates",
    icon: Mail,
  },
  notifications: {
    label: "Notification Settings",
    description: "Push notification and alert settings",
    icon: Bell,
  },
  appearance: {
    label: "Appearance Settings",
    description: "Theme, colors, and UI customization",
    icon: Palette,
  },
  integrations: {
    label: "Integrations",
    description: "Third-party services and API keys",
    icon: Zap,
  },
  maintenance: {
    label: "Maintenance",
    description: "System maintenance and data management",
    icon: Database,
  },
  ui_toggles: {
    label: "Popups & Install",
    description: "Turn the cookie, notification, and PWA install popups on/off",
    icon: Bell,
  },
};

// Default settings for each category
const DEFAULT_SETTINGS: Record<string, Array<{ key: string; label: string; description: string; type: string; defaultValue: unknown }>> = {
  general: [
    { key: "site_name", label: "Site Name", description: "The name of your platform", type: "text", defaultValue: "EarnGPT" },
    { key: "site_description", label: "Site Description", description: "A brief description of your site", type: "textarea", defaultValue: "Earn While You Learn" },
    { key: "support_email", label: "Support Email", description: "Email address for user support", type: "email", defaultValue: "support@earngpt.com" },
    { key: "timezone", label: "Default Timezone", description: "Default timezone for the platform", type: "select", defaultValue: "UTC" },
  ],
  earning: [
    { key: "points_per_usd", label: "Points per $1 (USD)", description: "How many points equal $1 USD — controls all earnings & withdrawals", type: "number", defaultValue: 1000 },
    { key: "min_withdrawal", label: "Minimum Withdrawal ($)", description: "Minimum amount for withdrawal", type: "number", defaultValue: 5 },
    { key: "max_withdrawal", label: "Maximum Withdrawal ($)", description: "Maximum amount per withdrawal", type: "number", defaultValue: 1000 },
    { key: "withdrawal_fee_percent", label: "Withdrawal Fee (%)", description: "Fee percentage on withdrawals", type: "number", defaultValue: 5 },
    { key: "withdrawal_requires_subscription", label: "Require Subscription for Withdrawal", description: "Users on the free/default plan must buy a subscription before they can withdraw", type: "boolean", defaultValue: false },
    { key: "withdrawal_payout_time_message", label: "Payout Time Message", description: "Shown to users as the estimated time to receive funds after a withdrawal request", type: "text", defaultValue: "1-3 business days" },
    { key: "daily_earning_limit", label: "Daily Earning Limit", description: "Maximum points a user can earn per day", type: "number", defaultValue: 1000 },
  ],
  security: [
    { key: "kyc_required", label: "KYC Required for Withdrawal", description: "Require KYC verification for withdrawals", type: "boolean", defaultValue: true },
    { key: "kyc_min_withdrawal", label: "KYC Threshold ($)", description: "Withdrawal amount that triggers KYC requirement", type: "number", defaultValue: 50 },
    { key: "max_login_attempts", label: "Max Login Attempts", description: "Maximum failed login attempts before lockout", type: "number", defaultValue: 5 },
    { key: "lockout_duration", label: "Lockout Duration (minutes)", description: "How long to lock account after failed attempts", type: "number", defaultValue: 30 },
    { key: "require_email_verification", label: "Require Email Verification", description: "Users must verify email before accessing features", type: "boolean", defaultValue: true },
  ],
  email: [
    { key: "smtp_host", label: "SMTP Host", description: "SMTP server hostname", type: "text", defaultValue: "" },
    { key: "smtp_port", label: "SMTP Port", description: "SMTP server port", type: "number", defaultValue: 587 },
    { key: "smtp_user", label: "SMTP Username", description: "SMTP authentication username", type: "text", defaultValue: "" },
    { key: "smtp_password", label: "SMTP Password", description: "SMTP authentication password", type: "password", defaultValue: "" },
    { key: "from_email", label: "From Email", description: "Email address to send from", type: "email", defaultValue: "noreply@earngpt.com" },
    { key: "from_name", label: "From Name", description: "Display name for emails", type: "text", defaultValue: "EarnGPT" },
  ],
  notifications: [
    { key: "push_enabled", label: "Push Notifications", description: "Enable push notifications", type: "boolean", defaultValue: true },
    { key: "email_on_withdrawal", label: "Email on Withdrawal", description: "Send email when withdrawal is processed", type: "boolean", defaultValue: true },
    { key: "email_on_task_approval", label: "Email on Task Approval", description: "Send email when task is approved", type: "boolean", defaultValue: true },
    { key: "email_on_referral", label: "Email on Referral", description: "Send email when someone uses referral code", type: "boolean", defaultValue: true },
  ],
  appearance: [
    { key: "primary_color", label: "Primary Color", description: "Main brand color", type: "color", defaultValue: "#EF4444" },
    { key: "dark_mode_default", label: "Dark Mode Default", description: "Use dark mode by default", type: "boolean", defaultValue: true },
    { key: "show_leaderboard", label: "Show Leaderboard", description: "Display public leaderboard", type: "boolean", defaultValue: true },
    { key: "show_social_feed", label: "Show Social Feed", description: "Enable social features", type: "boolean", defaultValue: true },
  ],
  integrations: [
    { key: "google_analytics_id", label: "Google Analytics ID", description: "Google Analytics tracking ID", type: "text", defaultValue: "" },
    { key: "recaptcha_site_key", label: "reCAPTCHA Site Key", description: "Google reCAPTCHA site key", type: "text", defaultValue: "" },
    { key: "recaptcha_secret", label: "reCAPTCHA Secret", description: "Google reCAPTCHA secret key", type: "password", defaultValue: "" },
  ],
  maintenance: [
    { key: "maintenance_mode", label: "Maintenance Mode", description: "Put site in maintenance mode", type: "boolean", defaultValue: false },
    { key: "maintenance_message", label: "Maintenance Message", description: "Message to show during maintenance", type: "textarea", defaultValue: "We are currently performing maintenance. Please check back soon." },
    { key: "allow_registration", label: "Allow Registrations", description: "Allow new user registrations", type: "boolean", defaultValue: true },
    { key: "allow_withdrawals", label: "Allow Withdrawals", description: "Allow withdrawal requests", type: "boolean", defaultValue: true },
  ],
  ui_toggles: [
    { key: "ui.cookies_popup_enabled", label: "Cookie consent popup", description: "Show the cookie consent banner to visitors", type: "boolean", defaultValue: true },
    { key: "ui.notification_popup_enabled", label: "Notification permission popup", description: "Show the “Enable notifications” prompt", type: "boolean", defaultValue: true },
    { key: "ui.pwa_install_prompt_enabled", label: "PWA install prompt", description: "Show the “Install app” prompt to users who haven’t installed it (Android & iOS)", type: "boolean", defaultValue: true },
  ],
};

export default async function SettingsCategoryPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "settings.view"))) {
    redirect("/admin");
  }

  const { category } = await params;
  const categoryConfig = CATEGORY_CONFIG[category];

  if (!categoryConfig) {
    notFound();
  }

  // Fetch settings for this category
  const settings = await prisma.systemSetting.findMany({
    where: { category },
    orderBy: { key: "asc" },
  });

  // Create a map of existing settings
  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.key] = setting;
    return acc;
  }, {} as Record<string, typeof settings[0]>);

  // Merge with defaults
  const defaultSettings = DEFAULT_SETTINGS[category] || [];
  const mergedSettings = defaultSettings.map((def) => ({
    ...def,
    id: settingsMap[def.key]?.id || null,
    value: settingsMap[def.key]?.value ?? def.defaultValue,
  }));

  const Icon = categoryConfig.icon;
  const canEdit = await can(session.user.id, "settings.edit");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/settings"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800">
            <Icon className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{categoryConfig.label}</h1>
            <p className="text-gray-400">{categoryConfig.description}</p>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <SettingsForm
        category={category}
        settings={mergedSettings}
        canEdit={canEdit}
      />
    </div>
  );
}
