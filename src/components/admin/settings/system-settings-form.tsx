"use client";

import { confirmDialog } from "@/lib/confirm";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Palette,
  UserCheck,
  ExternalLink,
  ArrowRight,
  Eye,
  EyeOff,
  Undo2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { ProfileGateStandard, ProfileGateFeatures, ProfileGatePercent } from "@/components/admin/settings/profile-gate-settings";
import { cn, usd } from "@/lib/utils";
import { NotActiveBadge } from "@/components/admin/shared/controls";
import { inp } from "@/components/admin/settings/keyed-settings";
import { useUrlTab } from "@/components/admin/ui/use-url-tab";
import { BUYER_TASK_TYPES } from "@/lib/buyer-task-types";
import {
  CATEGORY_FOR_KEY,
  LOCATION_FOR_KEY,
  SETTINGS_CATALOG,
  SETTINGS_TABS,
  editedOnSettingsForm,
  keyLabel,
  sectionDomId,
  settingDomId,
  settingEntry,
  type SettingsLinkCard,
  type SettingsSection,
  type SettingsTabId,
  type SettingsWidget,
} from "@/lib/admin-settings-catalog";
import { SettingsSearch } from "./settings-search";
import { LinkSafetyTest } from "./link-safety-test";
import { EmailDeliverabilityPanel } from "./email-deliverability-panel";

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

/**
 * Tabs, sections, labels, descriptions, units and the "which page owns this"
 * link cards all come from `SETTINGS_TABS` / `SETTINGS_CATALOG` in
 * `admin-settings-catalog.ts`. Only the icon and the input widget for each key
 * are chosen here.
 */
const TAB_ICONS: Record<SettingsTabId, typeof SettingsIcon> = {
  general: SettingsIcon,
  money: DollarSign,
  users: UserCheck,
  email: Mail,
  notifications: Bell,
  security: Shield,
  integrations: Plug,
  appearance: Palette,
  limits: SlidersHorizontal,
};

const TAB_IDS = SETTINGS_TABS.map((t) => t.id);

/** Every key this form edits (keys with a `home` are edited elsewhere). */
const FORM_KEYS = SETTINGS_CATALOG.filter((e) => editedOnSettingsForm(e.key)).map(
  (e) => e.key
);

const DEFAULTS: SettingsBag = {
  // General
  platform_name: "RevType",
  maintenance_mode: false,
  maintenance_message: "",
  // Financial
  currency: "USD",
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
  "buyer.allowed_platforms": [],
  "buyer.require_kyc": false,
  "buyer.auto_approve_tasks": false,
  "buyer.refund_fee_on_reject": true,
  // Security
  password_min_length: 8,
  require_strong_passwords: true,
  // Link safety — "flag" is the non-breaking default: nothing is refused
  // except the blocked-domain list and javascript:/data:/file: links.
  "security.link_policy": "flag",
  "security.blocked_domains": [],
  "security.safe_browsing_api_key": "",
  "security.upload_archive_policy": "review",
  "security.virustotal_api_key": "",
  "security.outbound_domain_per_min": 30,
  "security.outbound_user_per_hour": 60,
  // Email
  smtp_host: "smtp.gmail.com",
  smtp_port: 587,
  smtp_username: "noreply@revtype.com",
  smtp_password: "",
  email_from_address: "noreply@revtype.com",
  email_from_name: "RevType Team",
  email_reply_to: "",
  email_test_recipient: "",
  email_notifications_enabled: true,
  email_daily_cap: 500,
  email_per_minute: 60,
  // Notifications
  push_notifications_enabled: true,
  notify_new_task: true,
  notify_withdrawal: true,
  notify_level_up: true,
  "celebrate.achievement_min_points": 200,
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
  max_active_listings: 0,
  "ai.daily_limit_per_user": 50,
  "tasks.sequential_unlock": false,
  "targeting.country_ip_only": false,
  // Log retention windows (days) — consumed by the daily pruning cron
  retention_days: { views: 90, logs: 120, audit: 365, notifications: 60 },
  // Popups / install (site-wide)
  "ui.cookies_popup_enabled": true,
  "ui.notification_popup_enabled": true,
  "ui.pwa_install_prompt_enabled": true,
  "ui.require_profile_completion": false,
  "ui.require_email_verification": false,
  "profile_gate.mode": "ESSENTIALS",
  "profile_gate.features": ["tasks", "missions"],
  "profile_gate.min_percent": 100,
  // Dark, and users may choose — the behaviour before these settings existed,
  // so an install with no rows saved is unchanged.
  "ui.theme_default": "dark",
  "ui.theme_user_choice": true,
  "ui.accent_user_choice": true,
  analytics_pageviews_enabled: true,
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Briefly ring an element the admin was just sent to. */
function flash(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-blue-500/70");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-blue-500/70"), 2200);
}

/** What each control needs to show its badges: current, saved and default. */
const MetaCtx = createContext<{ values: SettingsBag; baseline: SettingsBag }>({
  values: {},
  baseline: {},
});

export function SystemSettingsForm({
  initial,
  canEdit,
  platformList = [],
}: SystemSettingsFormProps) {
  const router = useRouter();
  const search = useSearchParams();
  // Old tab ids from before the regroup still land on the right tab.
  const [tab, setTabUrl] = useUrlTab<SettingsTabId>("general", TAB_IDS, {
    aliases: { financial: "money", ui_toggles: "appearance" },
  });
  const sectionParam = search?.get("section") ?? null;

  const [values, setValues] = useState<SettingsBag>(() => ({
    ...DEFAULTS,
    ...initial,
  }));
  // What is stored right now. "Unsaved" = differs from this.
  const [baseline, setBaseline] = useState<SettingsBag>(() => ({
    ...DEFAULTS,
    ...initial,
  }));
  const [busy, setBusy] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  // A scroll waiting for its tab to render.
  const [pending, setPending] = useState<{
    tab: SettingsTabId;
    section?: string;
    key?: string;
  } | null>(null);

  const set = <K extends string>(k: K, v: unknown) =>
    setValues((p) => ({ ...p, [k]: v }));

  const gateFeatures = Array.isArray(values["profile_gate.features"])
    ? (values["profile_gate.features"] as string[])
    : ["tasks", "missions"];

  /* ── Unsaved changes ── */
  const changedKeys = FORM_KEYS.filter((k) => !same(values[k], baseline[k]));
  const changedByTab = new Map<SettingsTabId, number>();
  for (const k of changedKeys) {
    const t = LOCATION_FOR_KEY[k]?.tab;
    if (t) changedByTab.set(t, (changedByTab.get(t) ?? 0) + 1);
  }
  const dirty = changedKeys.length > 0;

  /**
   * Save every changed control, each under its catalog row category, through
   * the same POST /api/admin/settings. Only what changed is sent: a control
   * the admin did not touch keeps its row exactly as it is.
   */
  const saveAll = async () => {
    // Keys edited on a feature page are never re-sent from here — `values`
    // holds every stored row, and re-sending one would overwrite a newer value
    // saved over there.
    const keys = Object.keys(values).filter(
      (k) => editedOnSettingsForm(k) && !same(values[k], baseline[k])
    );
    if (keys.length === 0) return;

    const dangers = keys.flatMap((k) => {
      const e = settingEntry(k);
      return e?.danger ? [`${e.label}: ${e.danger}`] : [];
    });
    if (
      dangers.length > 0 &&
      !(await confirmDialog({
        title: "Save a platform-wide change?",
        description: dangers.join("\n\n"),
        tone: "danger",
        confirmLabel: "Save anyway",
      }))
    )
      return;

    const byCategory = new Map<string, SettingsBag>();
    for (const k of keys) {
      const category = CATEGORY_FOR_KEY[k];
      const bag = byCategory.get(category) ?? {};
      bag[k] = values[k];
      byCategory.set(category, bag);
    }

    setBusy(true);
    try {
      for (const [category, settings] of byCategory) {
        const res = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, settings }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        // This category is stored — never re-send it or show it as unsaved.
        setBaseline((b) => ({ ...b, ...settings }));
      }
      toast.success(
        keys.length === 1 ? "Setting saved" : `${keys.length} settings saved`
      );
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const discardAll = () => {
    setValues((p) => {
      const next = { ...p };
      for (const k of changedKeys) next[k] = baseline[k];
      return next;
    });
  };

  const activeTab = SETTINGS_TABS.find((t) => t.id === tab) ?? SETTINGS_TABS[0];

  const resetTab = async () => {
    if (
      !(await confirmDialog({
        title: `Reset every ${activeTab.label} setting to its default?`,
        description: "Nothing is saved until you press Save.",
        tone: "danger",
        confirmLabel: "Reset",
      }))
    )
      return;
    const tabKeys = activeTab.sections.flatMap((s) => s.keys);
    setValues((p) => {
      const next = { ...p };
      for (const k of tabKeys) {
        if (editedOnSettingsForm(k) && k in DEFAULTS) next[k] = DEFAULTS[k];
      }
      return next;
    });
    toast.info("Reset to defaults — click Save to keep them");
  };

  /* ── Leaving with unsaved changes ── */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // In-app links do not fire beforeunload, so they are caught here.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmDialog({
        title: "Leave without saving?",
        description: `You have ${changedKeys.length} unsaved change${changedKeys.length === 1 ? "" : "s"} on this page. They will be lost.`,
        tone: "warning",
        confirmLabel: "Leave",
        cancelLabel: "Stay",
      }).then((ok) => {
        if (ok) router.push(url.pathname + url.search + url.hash);
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, changedKeys.length, router]);

  /* ── Navigation within the page ── */
  const goTo = (t: SettingsTabId, section?: string, key?: string) => {
    setTabUrl(t, { section: section ?? null });
    setPending({ tab: t, section, key });
  };

  // A deep link with ?section= scrolls to it once the page is on screen.
  useEffect(() => {
    if (sectionParam) setPending({ tab, section: sectionParam });
    // Only on first load: later section changes come through goTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pending || pending.tab !== tab) return;
    const id = requestAnimationFrame(() => {
      const el =
        (pending.key && document.getElementById(settingDomId(pending.key))) ||
        (pending.section && document.getElementById(sectionDomId(pending.section)));
      if (el) flash(el);
      setPending(null);
    });
    return () => cancelAnimationFrame(id);
  }, [pending, tab]);

  // On a phone the strip scrolls sideways; keep the open tab in view.
  useEffect(() => {
    document
      .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

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

  const numInp = cn(inp, "sm:max-w-xs");

  /*
   * One renderer per key. The layout (which tab, which section, what order)
   * is the catalog's; this only decides what kind of input a key gets.
   */
  const controls: Record<string, () => ReactNode> = {
    /* ── General ── */
    platform_name: () => (
      <Row settingKey="platform_name">
        <input
          value={(values.platform_name as string) || ""}
          onChange={(e) => set("platform_name", e.target.value)}
          disabled={!canEdit}
          className={inp}
        />
      </Row>
    ),
    maintenance_mode: () => (
      <SwitchRow settingKey="maintenance_mode"
        checked={!!values.maintenance_mode}
        onChange={(v) => set("maintenance_mode", v)}
        disabled={!canEdit}
        tone="red"
      />
    ),
    maintenance_message: () =>
      !!values.maintenance_mode && (
        <Row settingKey="maintenance_message">
          <textarea
            rows={3}
            value={(values.maintenance_message as string) || ""}
            onChange={(e) => set("maintenance_message", e.target.value)}
            disabled={!canEdit}
            className={inp}
            placeholder="We are performing scheduled maintenance. Please check back shortly."
          />
        </Row>
      ),

    /* ── Money ── */
    currency: () => (
      <Row settingKey="currency">
        <select
          value={(values.currency as string) || "USD"}
          onChange={(e) => set("currency", e.target.value)}
          disabled={!canEdit}
          className={numInp}
        >
          <option>USD</option>
          <option>EUR</option>
          <option>GBP</option>
          <option>INR</option>
          <option>BDT</option>
        </select>
      </Row>
    ),
    "marketplace.fee_percent": () => (
      <Row settingKey="marketplace.fee_percent">
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
          className={numInp}
        />
      </Row>
    ),
    points_per_usd: () => (
      <Row settingKey="points_per_usd"
        hint={pointRateHint(Number(values.points_per_usd ?? 1000))}
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
          className={numInp}
        />
      </Row>
    ),
    points_convert_threshold: () => (
      <Row settingKey="points_convert_threshold">
        <input
          type="number"
          min={1}
          step={1}
          value={Number(values.points_convert_threshold ?? 1000)}
          onChange={(e) =>
            set("points_convert_threshold", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "bkash.usdToBdtRate": () => (
      <Row settingKey="bkash.usdToBdtRate">
        <input
          type="number"
          min={1}
          step={0.01}
          value={Number(values["bkash.usdToBdtRate"] ?? 123)}
          onChange={(e) =>
            set("bkash.usdToBdtRate", parseFloat(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    vat_enabled: () => (
      <SwitchRow settingKey="vat_enabled"
        checked={!!values.vat_enabled}
        onChange={(v) => set("vat_enabled", v)}
        disabled={!canEdit}
        tone="amber"
      />
    ),
    vat_pct: () =>
      !!values.vat_enabled && (
        <Row settingKey="vat_pct">
          <input
            type="number"
            step={0.5}
            min={0}
            max={100}
            value={Number(values.vat_pct ?? 15)}
            onChange={(e) => set("vat_pct", parseFloat(e.target.value))}
            disabled={!canEdit}
            className={numInp}
          />
        </Row>
      ),
    "buyer.enabled": () => (
      <SwitchRow settingKey="buyer.enabled"
        checked={values["buyer.enabled"] !== false}
        onChange={(v) => set("buyer.enabled", v)}
        disabled={!canEdit}
        tone="amber"
      />
    ),
    "buyer.fee_percent": () => (
      <Row settingKey="buyer.fee_percent"
        hint={(() => {
          const pct = Number(values["buyer.fee_percent"] ?? 0);
          const ppu = Math.max(1, Number(values.points_per_usd ?? 1000));
          const example = (100 * 50) / ppu;
          return pct > 0
            ? `e.g. 100 completions x 50 pts = ${usd(example)} of rewards + ${usd((example * pct) / 100)} fee = ${usd(example * (1 + pct / 100))} charged, as those completions happen`
            : undefined;
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
          className={numInp}
        />
      </Row>
    ),
    "buyer.min_points_per_task": () => (
      <Row settingKey="buyer.min_points_per_task">
        <input
          type="number"
          min={1}
          value={Number(values["buyer.min_points_per_task"] ?? 1)}
          onChange={(e) =>
            set("buyer.min_points_per_task", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "buyer.max_points_per_task": () => (
      <Row settingKey="buyer.max_points_per_task">
        <input
          type="number"
          min={1}
          value={Number(values["buyer.max_points_per_task"] ?? 100000)}
          onChange={(e) =>
            set("buyer.max_points_per_task", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "buyer.max_active_tasks": () => (
      <Row settingKey="buyer.max_active_tasks">
        <input
          type="number"
          min={0}
          value={Number(values["buyer.max_active_tasks"] ?? 0)}
          onChange={(e) =>
            set("buyer.max_active_tasks", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "buyer.max_completions": () => (
      <Row settingKey="buyer.max_completions">
        <input
          type="number"
          min={1}
          value={Number(values["buyer.max_completions"] ?? 100000)}
          onChange={(e) =>
            set("buyer.max_completions", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "buyer.min_purchase_points": () => (
      <Row settingKey="buyer.min_purchase_points">
        <input
          type="number"
          min={1}
          value={Number(values["buyer.min_purchase_points"] ?? 1000)}
          onChange={(e) =>
            set("buyer.min_purchase_points", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "buyer.max_purchase_points": () => (
      <Row settingKey="buyer.max_purchase_points">
        <input
          type="number"
          min={1}
          value={Number(values["buyer.max_purchase_points"] ?? 10000000)}
          onChange={(e) =>
            set("buyer.max_purchase_points", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "buyer.allowed_task_types": () => (
      <Row settingKey="buyer.allowed_task_types">
        <div className="flex flex-wrap gap-2">
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
                aria-pressed={on}
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
      </Row>
    ),
    "buyer.allowed_platforms": () => (
      <Row settingKey="buyer.allowed_platforms"
        hint={(() => {
          const list = Array.isArray(values["buyer.allowed_platforms"])
            ? (values["buyer.allowed_platforms"] as string[])
            : [];
          return list.length === 0
            ? `All ${platformList.length} allowed · a platform added later is included automatically`
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
      </Row>
    ),
    "buyer.require_kyc": () => (
      <SwitchRow settingKey="buyer.require_kyc"
        checked={!!values["buyer.require_kyc"]}
        onChange={(v) => set("buyer.require_kyc", v)}
        disabled={!canEdit}
      />
    ),
    "buyer.auto_approve_tasks": () => (
      <SwitchRow settingKey="buyer.auto_approve_tasks"
        checked={!!values["buyer.auto_approve_tasks"]}
        onChange={(v) => set("buyer.auto_approve_tasks", v)}
        disabled={!canEdit}
        tone="red"
      />
    ),
    "buyer.refund_fee_on_reject": () => (
      <SwitchRow settingKey="buyer.refund_fee_on_reject"
        checked={values["buyer.refund_fee_on_reject"] !== false}
        onChange={(v) => set("buyer.refund_fee_on_reject", v)}
        disabled={!canEdit}
      />
    ),

    /* ── Users & sign-up ── */
    "ui.require_email_verification": () => (
      <SwitchRow settingKey="ui.require_email_verification"
        checked={values["ui.require_email_verification"] === true}
        onChange={(v) => set("ui.require_email_verification", v)}
        disabled={!canEdit}
        tone="amber"
      />
    ),
    password_min_length: () => (
      <Row settingKey="password_min_length">
        <input
          type="number"
          min={6}
          max={64}
          value={Number(values.password_min_length ?? 8)}
          onChange={(e) =>
            set("password_min_length", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    require_strong_passwords: () => (
      <SwitchRow settingKey="require_strong_passwords"
        checked={values.require_strong_passwords !== false}
        onChange={(v) => set("require_strong_passwords", v)}
        disabled={!canEdit}
      />
    ),
    "ui.require_profile_completion": () => (
      <SwitchRow settingKey="ui.require_profile_completion"
        checked={values["ui.require_profile_completion"] === true}
        onChange={(v) => set("ui.require_profile_completion", v)}
        disabled={!canEdit}
        tone="amber"
      />
    ),
    "profile_gate.mode": () => (
      <Row settingKey="profile_gate.mode">
        <ProfileGateStandard
          on={values["ui.require_profile_completion"] === true}
          mode={String(values["profile_gate.mode"] ?? "ESSENTIALS")}
          minPercent={Number(values["profile_gate.min_percent"] ?? 100)}
          features={gateFeatures}
          onMode={(v) => set("profile_gate.mode", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "profile_gate.min_percent": () =>
      values["profile_gate.mode"] === "FULL" && (
        <Row settingKey="profile_gate.min_percent">
          <ProfileGatePercent
            value={Number(values["profile_gate.min_percent"] ?? 100)}
            onChange={(v) => set("profile_gate.min_percent", v)}
            disabled={!canEdit}
          />
        </Row>
      ),
    "profile_gate.features": () => (
      <Row settingKey="profile_gate.features">
        <ProfileGateFeatures
          features={gateFeatures}
          onFeatures={(v) => set("profile_gate.features", v)}
          disabled={!canEdit}
        />
      </Row>
    ),

    /* ── Email ── */
    smtp_host: () => (
      <Row settingKey="smtp_host">
        <input
          value={(values.smtp_host as string) || ""}
          onChange={(e) => set("smtp_host", e.target.value)}
          disabled={!canEdit}
          className={inp}
        />
      </Row>
    ),
    smtp_port: () => (
      <Row settingKey="smtp_port">
        <input
          type="number"
          value={Number(values.smtp_port ?? 587)}
          onChange={(e) => set("smtp_port", parseInt(e.target.value))}
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    smtp_username: () => (
      <Row settingKey="smtp_username">
        <input
          value={(values.smtp_username as string) || ""}
          onChange={(e) => set("smtp_username", e.target.value)}
          disabled={!canEdit}
          className={inp}
          autoComplete="off"
        />
      </Row>
    ),
    smtp_password: () => (
      <Row settingKey="smtp_password">
        <SecretInput
          value={(values.smtp_password as string) || ""}
          saved={(baseline.smtp_password as string) || ""}
          onChange={(v) => set("smtp_password", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    email_from_address: () => (
      <Row settingKey="email_from_address">
        <input
          type="email"
          value={(values.email_from_address as string) || ""}
          onChange={(e) => set("email_from_address", e.target.value)}
          disabled={!canEdit}
          className={inp}
        />
      </Row>
    ),
    email_from_name: () => (
      <Row settingKey="email_from_name">
        <input
          value={(values.email_from_name as string) || ""}
          onChange={(e) => set("email_from_name", e.target.value)}
          disabled={!canEdit}
          className={inp}
        />
      </Row>
    ),
    email_reply_to: () => (
      <Row settingKey="email_reply_to">
        <input
          type="email"
          value={(values.email_reply_to as string) || ""}
          onChange={(e) => set("email_reply_to", e.target.value)}
          disabled={!canEdit}
          className={inp}
          placeholder={(values.email_from_address as string) || "support@yourdomain.com"}
        />
      </Row>
    ),
    email_test_recipient: () => (
      <Row settingKey="email_test_recipient">
        <input
          type="email"
          value={(values.email_test_recipient as string) || ""}
          onChange={(e) => set("email_test_recipient", e.target.value)}
          disabled={!canEdit}
          className={inp}
          placeholder="you@yourdomain.com"
        />
      </Row>
    ),
    email_notifications_enabled: () => (
      <SwitchRow settingKey="email_notifications_enabled"
        checked={!!values.email_notifications_enabled}
        onChange={(v) => set("email_notifications_enabled", v)}
        disabled={!canEdit}
        tone="amber"
      />
    ),
    email_daily_cap: () => (
      <Row settingKey="email_daily_cap">
        <input
          type="number"
          min={0}
          value={Number(values.email_daily_cap ?? 500)}
          onChange={(e) => set("email_daily_cap", Number(e.target.value))}
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    email_per_minute: () => (
      <Row settingKey="email_per_minute">
        <input
          type="number"
          min={0}
          value={Number(values.email_per_minute ?? 60)}
          onChange={(e) => set("email_per_minute", Number(e.target.value))}
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),

    /* ── Notifications ── */
    push_notifications_enabled: () => (
      <SwitchRow settingKey="push_notifications_enabled"
        checked={values.push_notifications_enabled !== false}
        onChange={(v) => set("push_notifications_enabled", v)}
        disabled={!canEdit}
      />
    ),
    "celebrate.achievement_min_points": () => (
      <Row settingKey="celebrate.achievement_min_points">
        <input
          type="number"
          min={0}
          value={Number(values["celebrate.achievement_min_points"] ?? 200)}
          onChange={(e) => set("celebrate.achievement_min_points", Math.max(0, parseInt(e.target.value) || 0))}
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    notify_new_task: () => (
      <SwitchRow settingKey="notify_new_task"
        checked={values.notify_new_task !== false}
        onChange={(v) => set("notify_new_task", v)}
        disabled={!canEdit}
      />
    ),
    notify_withdrawal: () => (
      <SwitchRow settingKey="notify_withdrawal"
        checked={values.notify_withdrawal !== false}
        onChange={(v) => set("notify_withdrawal", v)}
        disabled={!canEdit}
      />
    ),
    notify_level_up: () => (
      <SwitchRow settingKey="notify_level_up"
        checked={values.notify_level_up !== false}
        onChange={(v) => set("notify_level_up", v)}
        disabled={!canEdit}
      />
    ),

    /* ── Security ── */
    "security.link_policy": () => (
      <Row settingKey="security.link_policy">
        <select
          value={String(values["security.link_policy"] ?? "flag")}
          onChange={(e) => set("security.link_policy", e.target.value)}
          disabled={!canEdit}
          className={inp}
        >
          <option value="flag">Flag for review (recommended)</option>
          <option value="block">Block unsafe links</option>
          <option value="off">Off (blocked domains only)</option>
        </select>
      </Row>
    ),
    "security.blocked_domains": () => (
      <Row settingKey="security.blocked_domains">
        <textarea
          rows={5}
          value={
            Array.isArray(values["security.blocked_domains"])
              ? (values["security.blocked_domains"] as string[]).join("\n")
              : String(values["security.blocked_domains"] ?? "")
          }
          onChange={(e) =>
            set("security.blocked_domains", e.target.value.split("\n"))
          }
          disabled={!canEdit}
          className={inp}
          placeholder={"bad-site.com\nphishing-example.net"}
        />
      </Row>
    ),
    "security.upload_archive_policy": () => (
      <Row settingKey="security.upload_archive_policy">
        <select
          value={String(values["security.upload_archive_policy"] ?? "review")}
          onChange={(e) => set("security.upload_archive_policy", e.target.value)}
          disabled={!canEdit}
          className={inp}
        >
          <option value="review">Review — accept and flag (recommended)</option>
          <option value="block">Block — refuse the upload</option>
          <option value="allow">Allow — do nothing</option>
        </select>
      </Row>
    ),
    "security.outbound_domain_per_min": () => (
      <Row settingKey="security.outbound_domain_per_min">
        <input
          type="number"
          min={1}
          max={10000}
          value={Number(values["security.outbound_domain_per_min"] ?? 30)}
          onChange={(e) =>
            set("security.outbound_domain_per_min", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "security.outbound_user_per_hour": () => (
      <Row settingKey="security.outbound_user_per_hour">
        <input
          type="number"
          min={1}
          max={100000}
          value={Number(values["security.outbound_user_per_hour"] ?? 60)}
          onChange={(e) =>
            set("security.outbound_user_per_hour", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),

    /* ── Integrations ── */
    gemini_api_key: () => (
      <Row settingKey="gemini_api_key">
        <SecretInput
          value={(values.gemini_api_key as string) || ""}
          saved={(baseline.gemini_api_key as string) || ""}
          onChange={(v) => set("gemini_api_key", v)}
          disabled={!canEdit}
          placeholder="AIza…"
          extra={<TestKeyButton provider="GEMINI" disabled={!canEdit} />}
        />
      </Row>
    ),
    openai_api_key: () => (
      <Row settingKey="openai_api_key">
        <SecretInput
          value={(values.openai_api_key as string) || ""}
          saved={(baseline.openai_api_key as string) || ""}
          onChange={(v) => set("openai_api_key", v)}
          disabled={!canEdit}
          placeholder="sk-…"
          extra={<TestKeyButton provider="OPENAI" disabled={!canEdit} />}
        />
      </Row>
    ),
    magnific_api_key: () => (
      <Row settingKey="magnific_api_key">
        <SecretInput
          value={(values.magnific_api_key as string) || ""}
          saved={(baseline.magnific_api_key as string) || ""}
          onChange={(v) => set("magnific_api_key", v)}
          disabled={!canEdit}
          extra={<TestKeyButton provider="MAGNIFIC" disabled={!canEdit} />}
        />
      </Row>
    ),
    magnific_webhook_secret: () => (
      <Row settingKey="magnific_webhook_secret">
        <SecretInput
          value={(values.magnific_webhook_secret as string) || ""}
          saved={(baseline.magnific_webhook_secret as string) || ""}
          onChange={(v) => set("magnific_webhook_secret", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "security.safe_browsing_api_key": () => (
      <Row settingKey="security.safe_browsing_api_key">
        <SecretInput
          value={(values["security.safe_browsing_api_key"] as string) || ""}
          saved={(baseline["security.safe_browsing_api_key"] as string) || ""}
          onChange={(v) => set("security.safe_browsing_api_key", v)}
          disabled={!canEdit}
          placeholder="AIza…"
        />
      </Row>
    ),
    "security.virustotal_api_key": () => (
      <Row settingKey="security.virustotal_api_key">
        <SecretInput
          value={(values["security.virustotal_api_key"] as string) || ""}
          saved={(baseline["security.virustotal_api_key"] as string) || ""}
          onChange={(v) => set("security.virustotal_api_key", v)}
          disabled={!canEdit}
          placeholder="Not set — no malware lookup"
        />
      </Row>
    ),
    "bkash.appKey": () => (
      <Row settingKey="bkash.appKey">
        <SecretInput
          value={(values["bkash.appKey"] as string) || ""}
          saved={(baseline["bkash.appKey"] as string) || ""}
          onChange={(v) => set("bkash.appKey", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "bkash.appSecret": () => (
      <Row settingKey="bkash.appSecret">
        <SecretInput
          value={(values["bkash.appSecret"] as string) || ""}
          saved={(baseline["bkash.appSecret"] as string) || ""}
          onChange={(v) => set("bkash.appSecret", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "bkash.username": () => (
      <Row settingKey="bkash.username">
        <input
          value={(values["bkash.username"] as string) || ""}
          onChange={(e) => set("bkash.username", e.target.value)}
          disabled={!canEdit}
          className={inp}
          autoComplete="off"
        />
      </Row>
    ),
    "bkash.password": () => (
      <Row settingKey="bkash.password">
        <SecretInput
          value={(values["bkash.password"] as string) || ""}
          saved={(baseline["bkash.password"] as string) || ""}
          onChange={(v) => set("bkash.password", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "sslcommerz.storeId": () => (
      <Row settingKey="sslcommerz.storeId">
        <input
          value={(values["sslcommerz.storeId"] as string) || ""}
          onChange={(e) => set("sslcommerz.storeId", e.target.value)}
          disabled={!canEdit}
          className={inp}
          autoComplete="off"
        />
      </Row>
    ),
    "sslcommerz.storePasswd": () => (
      <Row settingKey="sslcommerz.storePasswd">
        <SecretInput
          value={(values["sslcommerz.storePasswd"] as string) || ""}
          saved={(baseline["sslcommerz.storePasswd"] as string) || ""}
          onChange={(v) => set("sslcommerz.storePasswd", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "integrations.telegram_bot_token": () => (
      <Row settingKey="integrations.telegram_bot_token">
        <SecretInput
          value={(values["integrations.telegram_bot_token"] as string) || ""}
          saved={(baseline["integrations.telegram_bot_token"] as string) || ""}
          onChange={(v) => set("integrations.telegram_bot_token", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "integrations.telegram_bot_username": () => (
      <Row settingKey="integrations.telegram_bot_username">
        <input
          value={(values["integrations.telegram_bot_username"] as string) || ""}
          onChange={(e) => set("integrations.telegram_bot_username", e.target.value)}
          disabled={!canEdit}
          className={inp}
          placeholder="@your_bot"
        />
      </Row>
    ),
    "integrations.discord_client_id": () => (
      <Row settingKey="integrations.discord_client_id">
        <input
          value={(values["integrations.discord_client_id"] as string) || ""}
          onChange={(e) => set("integrations.discord_client_id", e.target.value)}
          disabled={!canEdit}
          className={inp}
          autoComplete="off"
        />
      </Row>
    ),
    "integrations.discord_client_secret": () => (
      <Row settingKey="integrations.discord_client_secret">
        <SecretInput
          value={(values["integrations.discord_client_secret"] as string) || ""}
          saved={(baseline["integrations.discord_client_secret"] as string) || ""}
          onChange={(v) => set("integrations.discord_client_secret", v)}
          disabled={!canEdit}
        />
      </Row>
    ),
    "integrations.discord_bot_token": () => (
      <Row settingKey="integrations.discord_bot_token">
        <SecretInput
          value={(values["integrations.discord_bot_token"] as string) || ""}
          saved={(baseline["integrations.discord_bot_token"] as string) || ""}
          onChange={(v) => set("integrations.discord_bot_token", v)}
          disabled={!canEdit}
        />
      </Row>
    ),

    /* ── Appearance & site ── */
    "ui.theme_default": () => (
      <Row settingKey="ui.theme_default">
        <select
          value={(values["ui.theme_default"] as string) || "dark"}
          onChange={(e) => set("ui.theme_default", e.target.value)}
          disabled={!canEdit}
          className={numInp}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </Row>
    ),
    "ui.theme_user_choice": () => (
      <SwitchRow settingKey="ui.theme_user_choice"
        checked={values["ui.theme_user_choice"] !== false}
        onChange={(v) => set("ui.theme_user_choice", v)}
        disabled={!canEdit}
        tone="emerald"
      />
    ),
    "ui.accent_user_choice": () => (
      <SwitchRow settingKey="ui.accent_user_choice"
        checked={values["ui.accent_user_choice"] !== false}
        onChange={(v) => set("ui.accent_user_choice", v)}
        disabled={!canEdit}
        tone="emerald"
      />
    ),
    "ui.cookies_popup_enabled": () => (
      <SwitchRow settingKey="ui.cookies_popup_enabled"
        checked={values["ui.cookies_popup_enabled"] !== false}
        onChange={(v) => set("ui.cookies_popup_enabled", v)}
        disabled={!canEdit}
      />
    ),
    "ui.notification_popup_enabled": () => (
      <SwitchRow settingKey="ui.notification_popup_enabled"
        checked={values["ui.notification_popup_enabled"] !== false}
        onChange={(v) => set("ui.notification_popup_enabled", v)}
        disabled={!canEdit}
      />
    ),
    "ui.pwa_install_prompt_enabled": () => (
      <SwitchRow settingKey="ui.pwa_install_prompt_enabled"
        checked={values["ui.pwa_install_prompt_enabled"] !== false}
        onChange={(v) => set("ui.pwa_install_prompt_enabled", v)}
        disabled={!canEdit}
        tone="purple"
      />
    ),
    analytics_pageviews_enabled: () => (
      <SwitchRow settingKey="analytics_pageviews_enabled"
        checked={values.analytics_pageviews_enabled !== false}
        onChange={(v) => set("analytics_pageviews_enabled", v)}
        disabled={!canEdit}
      />
    ),

    /* ── Limits ── */
    max_active_listings: () => (
      <Row settingKey="max_active_listings">
        <input
          type="number"
          min={0}
          value={Number(values.max_active_listings ?? 0)}
          onChange={(e) =>
            set("max_active_listings", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "ai.daily_limit_per_user": () => (
      <Row settingKey="ai.daily_limit_per_user">
        <input
          type="number"
          min={-1}
          value={Number(values["ai.daily_limit_per_user"] ?? 50)}
          onChange={(e) =>
            set("ai.daily_limit_per_user", parseInt(e.target.value))
          }
          disabled={!canEdit}
          className={numInp}
        />
      </Row>
    ),
    "tasks.sequential_unlock": () => (
      <SwitchRow settingKey="tasks.sequential_unlock"
        checked={values["tasks.sequential_unlock"] === true}
        onChange={(v) => set("tasks.sequential_unlock", v)}
        disabled={!canEdit}
      />
    ),
    "targeting.country_ip_only": () => (
      <SwitchRow settingKey="targeting.country_ip_only"
        checked={values["targeting.country_ip_only"] === true}
        onChange={(v) => set("targeting.country_ip_only", v)}
        disabled={!canEdit}
        tone="amber"
      />
    ),
    // Four inputs, one key: `retention_days` is a single JSON row.
    retention_days: () => {
      const r = {
        ...(DEFAULTS.retention_days as Record<string, number>),
        ...((values.retention_days as Record<string, number>) ?? {}),
      };
      const setR = (k: string, v: number) => set("retention_days", { ...r, [k]: v });
      const fields: Array<{ k: string; label: string }> = [
        { k: "views", label: "View/impression logs" },
        { k: "logs", label: "Ad & social action logs" },
        { k: "audit", label: "Audit log" },
        { k: "notifications", label: "Read notifications" },
      ];
      return (
        <Row settingKey="retention_days">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.k} className="block">
                <span className="mb-1 block text-xs text-slate-400">
                  {f.label}{" "}
                  <span className="text-slate-600">
                    · default {(DEFAULTS.retention_days as Record<string, number>)[f.k]} days
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  value={Number(r[f.k] ?? 0)}
                  onChange={(e) => setR(f.k, parseInt(e.target.value) || 1)}
                  disabled={!canEdit}
                  className={inp}
                />
              </label>
            ))}
          </div>
        </Row>
      );
    },
  };

  const smtpDirty = ["smtp_host", "smtp_port", "smtp_username", "smtp_password"].some(
    (k) => changedKeys.includes(k)
  );

  const widgets: Record<SettingsWidget, () => ReactNode> = {
    "email-test": () => (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={sendTestEmail}
          disabled={testingEmail || !canEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-600/20 px-4 py-2 text-sm text-blue-300 hover:bg-blue-600/30 disabled:opacity-50"
        >
          {testingEmail ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send test email
        </button>
        <span className={cn("text-xs", smtpDirty ? "text-amber-300" : "text-slate-500")}>
          {smtpDirty
            ? "You have unsaved SMTP changes — the test uses the SAVED settings, so save first."
            : "Sends to the test recipient (Sender section), using the saved settings."}
        </span>
      </div>
    ),
    "email-deliverability": () => <EmailDeliverabilityPanel />,
    "link-safety-test": () => <LinkSafetyTest />,
  };

  const renderSection = (s: SettingsSection) => (
    <section
      key={s.id}
      id={sectionDomId(s.id)}
      className="scroll-mt-28 rounded-xl border border-slate-800 bg-slate-950/30 p-3 transition-shadow sm:p-4"
    >
      <h3 className="text-sm font-semibold text-white">{s.title}</h3>
      {s.blurb && (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.blurb}</p>
      )}
      <div className="mt-3 space-y-3">
        {s.keys.map((k) => (
          <Fragment key={k}>{controls[k]?.()}</Fragment>
        ))}
        {s.widgets?.map((w) => (
          <Fragment key={w}>{widgets[w]()}</Fragment>
        ))}
        {s.links?.map((l) => (
          <LinkCard key={`${l.href}:${l.label}`} card={l} onInPage={goTo} />
        ))}
        {s.notes && <NotWired title={s.notes.title} items={s.notes.items} />}
      </div>
    </section>
  );

  return (
    <MetaCtx.Provider value={{ values, baseline }}>
      <div className="space-y-4">
        <SettingsSearch
          onPick={(hit) => hit.tab && goTo(hit.tab, hit.section, hit.key)}
        />

        <div className="rounded-xl border border-slate-800 bg-slate-900">
          {/* Tab strip */}
          <div
            role="tablist"
            aria-label="Settings categories"
            className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2 pt-2 sm:flex-wrap sm:overflow-visible sm:px-3 sm:pt-3"
          >
            {SETTINGS_TABS.map((t) => {
              const Icon = TAB_ICONS[t.id];
              const n = changedByTab.get(t.id) ?? 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => goTo(t.id)}
                  className={cn(
                    "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "border-blue-500 bg-slate-800 text-white"
                      : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {n > 0 && (
                    <span
                      className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300"
                      title={`${n} unsaved`}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-3 sm:p-6">
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              {activeTab.blurb}
            </p>

            {/* Section jump — a select on phones, a sticky list on desktop */}
            {activeTab.sections.length > 1 && (
              <label className="mb-4 block lg:hidden">
                <span className="sr-only">Jump to section</span>
                <select
                  value=""
                  onChange={(e) => e.target.value && goTo(tab, e.target.value)}
                  className={inp}
                >
                  <option value="">Jump to a section…</option>
                  {activeTab.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
              <nav
                aria-label="Sections"
                className="hidden lg:block"
              >
                <ul className="sticky top-24 space-y-0.5 border-l border-slate-800">
                  {activeTab.sections.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => goTo(tab, s.id)}
                        className={cn(
                          "-ml-px block w-full border-l-2 px-3 py-1.5 text-left text-xs transition-colors",
                          sectionParam === s.id
                            ? "border-blue-500 text-white"
                            : "border-transparent text-slate-400 hover:border-slate-600 hover:text-white"
                        )}
                      >
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="min-w-0 space-y-4">
                {activeTab.sections.map(renderSection)}
              </div>
            </div>
          </div>

          {/* Sticky save bar */}
          <div
            className={cn(
              "sticky bottom-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-xl border-t px-3 py-3 backdrop-blur sm:px-6",
              dirty
                ? "border-amber-500/30 bg-slate-900/95"
                : "border-slate-800 bg-slate-900/90"
            )}
          >
            <div className="min-w-0 flex-1 text-xs">
              {!canEdit ? (
                <span className="text-amber-400">
                  View-only — your role cannot edit settings.
                </span>
              ) : dirty ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-amber-300">
                    {changedKeys.length} unsaved change
                    {changedKeys.length === 1 ? "" : "s"}
                  </span>
                  {SETTINGS_TABS.filter((t) => changedByTab.get(t.id)).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => goTo(t.id)}
                      className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/10"
                    >
                      {t.label} {changedByTab.get(t.id)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All changes saved
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? (
                <button
                  type="button"
                  onClick={discardAll}
                  disabled={!canEdit || busy}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"
                >
                  <Undo2 className="h-4 w-4" />
                  Discard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetTab}
                  disabled={!canEdit || busy}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-slate-500 hover:text-white disabled:opacity-50"
                  title={`Reset every ${activeTab.label} setting to its default`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset tab to defaults
                </button>
              )}
              <button
                type="button"
                onClick={saveAll}
                disabled={!canEdit || busy || !dirty}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {dirty ? `Save ${changedKeys.length}` : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </MetaCtx.Provider>
  );
}

/* eslint-disable no-restricted-syntax -- a per-point RATE shown at 4dp, not a
   currency amount; usd() would round it to $0.00. */
function pointRateHint(ppu: number): string {
  return `${ppu.toLocaleString()} pts = $1 · 1 pt = $${(1 / Math.max(1, ppu)).toFixed(4)}`;
}
/* eslint-enable no-restricted-syntax */

/** "On", "500 per day", "empty"… — the default, shown under each control. */
function formatValue(v: unknown, unit?: string): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (v === "" || v === null || v === undefined) return "empty";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "number") return `${v.toLocaleString()}${unit ? ` ${unit}` : ""}`;
  if (typeof v === "object")
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k} ${String(x)}`)
      .join(" · ");
  return String(v);
}

/** Label, unit, badges, description and "what happens at the edges". */
function Meta({ settingKey, hint }: { settingKey: string; hint?: string }) {
  const { values, baseline } = useContext(MetaCtx);
  const e = settingEntry(settingKey);
  const v = values[settingKey];
  const hasDefault = settingKey in DEFAULTS;
  const unsaved = !same(v, baseline[settingKey]);
  const changed = hasDefault && !e?.secret && !same(v, DEFAULTS[settingKey]);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-white">
          {e?.label ?? settingKey}
        </span>
        {e?.unit && <span className="text-[11px] text-slate-500">({e.unit})</span>}
        {e?.status === "not-active" && <NotActiveBadge />}
        {unsaved ? (
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Unsaved
          </span>
        ) : (
          changed && (
            <span
              className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-blue-300"
              title="Different from the default"
            >
              Changed
            </span>
          )
        )}
        {e?.secret && !unsaved && (
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
              v
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700 text-slate-500"
            )}
          >
            {v ? "Set" : "Not set"}
          </span>
        )}
        {e?.danger && (
          <span
            className="rounded border border-red-500/30 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-red-300"
            title={e.danger}
          >
            Affects everyone
          </span>
        )}
      </div>
      {e?.description && (
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{e.description}</p>
      )}
      {e?.effect && (
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{e.effect}</p>
      )}
      {hint && <p className="mt-0.5 text-xs text-blue-300/80">{hint}</p>}
      {hasDefault && !e?.secret && (
        <p className="mt-1 text-[11px] text-slate-600">
          Default: {formatValue(DEFAULTS[settingKey], e?.unit)}
        </p>
      )}
    </div>
  );
}

/** One input-style control: the meta above, the input below. */
function Row({
  settingKey,
  hint,
  children,
}: {
  settingKey: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={settingDomId(settingKey)}
      data-setting-key={settingKey}
      className="scroll-mt-28 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3 transition-shadow"
    >
      <Meta settingKey={settingKey} hint={hint} />
      <div className="mt-2">{children}</div>
    </div>
  );
}

const SWITCH_TONE = {
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  emerald: "bg-emerald-500",
} as const;

/** An on/off control: the meta on the left, the switch on the right. */
function SwitchRow({
  settingKey,
  checked,
  onChange,
  disabled,
  tone = "blue",
}: {
  settingKey: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tone?: keyof typeof SWITCH_TONE;
}) {
  return (
    <div
      id={settingDomId(settingKey)}
      data-setting-key={settingKey}
      className="flex scroll-mt-28 items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3 transition-shadow"
    >
      <Meta settingKey={settingKey} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={settingEntry(settingKey)?.label ?? settingKey}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          checked ? SWITCH_TONE[tone] : "bg-slate-700"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

/**
 * A key or password. A stored value is shown masked with its last four
 * characters, so an admin can tell WHICH key is set without exposing it.
 *
 * "Replace" opens an empty box but changes nothing until something is typed —
 * pressing Replace and then Save must never wipe a working key. Removing a key
 * is its own explicit button.
 */
function SecretInput({
  value,
  saved,
  onChange,
  disabled,
  placeholder,
  extra,
}: {
  value: string;
  saved: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  extra?: ReactNode;
}) {
  const [reveal, setReveal] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const cleared = !!saved && value === "";
  const editing = !saved || replacing || (value !== saved && !cleared);

  const btn =
    "inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50";
  const eye = (
    <button
      type="button"
      onClick={() => setReveal((r) => !r)}
      className={btn}
      aria-label={reveal ? "Hide" : "Show"}
    >
      {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {reveal ? "Hide" : "Show"}
    </button>
  );

  if (cleared) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs text-amber-300">
          Will be removed when you save.
        </span>
        <button type="button" onClick={() => onChange(saved)} className={btn}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {editing ? (
        <>
          <input
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            // While replacing, the box starts empty; an empty box keeps the
            // stored value rather than clearing it.
            value={saved && value === saved ? "" : value}
            onChange={(e) => onChange(e.target.value || saved)}
            disabled={disabled}
            placeholder={placeholder ?? (saved ? "Paste the new value" : "Not set")}
            className={cn(inp, "min-w-0 flex-1 basis-48")}
          />
          {eye}
          {saved && (
            <button
              type="button"
              onClick={() => {
                setReplacing(false);
                setReveal(false);
                onChange(saved);
              }}
              className={btn}
            >
              Cancel
            </button>
          )}
        </>
      ) : (
        <>
          <code className="min-w-0 flex-1 basis-48 truncate rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
            {reveal ? saved : `••••••••${saved.slice(-4)}`}
          </code>
          {eye}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setReplacing(true);
              setReveal(false);
            }}
            className={btn}
          >
            Replace
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className={btn}
          >
            Remove
          </button>
        </>
      )}
      {extra}
    </div>
  );
}

/**
 * A pointer to settings that are edited on another page (or another tab of
 * this one). Several boxes on this form once wrote rows nothing read; the real
 * value always lived somewhere else. So the setting is not duplicated here —
 * the card says what it is, lists what is there, and goes to it.
 */
function LinkCard({
  card,
  onInPage,
}: {
  card: SettingsLinkCard;
  onInPage: (tab: SettingsTabId, section?: string) => void;
}) {
  const inPage = card.href.startsWith("/admin/settings?");
  const go = (e: React.MouseEvent) => {
    if (!inPage) return;
    e.preventDefault();
    const p = new URL(card.href, "http://x").searchParams;
    onInPage((p.get("tab") ?? "general") as SettingsTabId, p.get("section") ?? undefined);
  };
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">{card.label}</p>
        <Link
          href={card.href}
          onClick={go}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
        >
          {card.linkLabel}
          {inPage ? <ArrowRight className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
        </Link>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{card.why}</p>
      {card.keys && card.keys.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {card.keys.map((k) => (
            <li
              key={k}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-400"
            >
              {keyLabel(k)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Things an admin may look for that are not settings — compile-time values, or
 * controls the platform cannot yet honour. The honest alternative to a switch
 * that silently does nothing is to say plainly that it is not built, and why.
 */
function NotWired({
  title,
  items,
}: {
  title: string;
  items: readonly { label: string; why: string }[];
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/20 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <ul className="mt-2 space-y-2">
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
        className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50"
      >
        {state === "busy" ? "Testing…" : "Test saved key"}
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

// `Field` and `inp` live in ./keyed-settings.tsx, shared with the settings
// panels on the feature pages (withdrawals, KYC, fraud, feed). The layout this
// form renders comes from SETTINGS_TABS in admin-settings-catalog.ts.
