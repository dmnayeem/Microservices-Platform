"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  DollarSign,
  Layers,
  Gift,
  Sparkles,
  Lock,
  Info,
  Wallet,
  Power,
  ListChecks,
} from "lucide-react";
import { toast } from "@/lib/toast";

type Mode = "create" | "edit";

export interface PackageFormPkg {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  accessLevel: number;
  isDefault: boolean;
  isActive: boolean;
  order: number;

  priceMonthly: number;
  priceYearly: number | null;
  validityDays: number | null;

  // Section-level toggles
  tasksEnabled: boolean;
  socialFeedEnabled: boolean;
  referralsEnabled: boolean;
  withdrawalsEnabled: boolean;
  marketplaceEnabled: boolean;
  boostEnabled: boolean;
  dailyMissionEnabled: boolean;
  lotteryEnabled: boolean;
  coursesEnabled: boolean;
  advertiserEnabled: boolean;
  gamesEnabled: boolean;
  adFree: boolean;

  // Creator / monetization capabilities
  createTasksEnabled: boolean;
  sellCoursesEnabled: boolean;
  sellMarketplaceEnabled: boolean;
  agencyModeEnabled: boolean;
  shareLinksEnabled: boolean;
  shareYoutubeEnabled: boolean;
  targetTasksEnabled: boolean;

  // Per-task-type toggles
  socialTasksEnabled: boolean;
  proxyTasksEnabled: boolean;
  articleTasksEnabled: boolean;
  videoTasksEnabled: boolean;
  quizTasksEnabled: boolean;
  surveyTasksEnabled: boolean;
  offerwallTasksEnabled: boolean;
  appInstallEnabled: boolean;

  dailyTaskLimit: number;
  dailyPostLimit?: number;
  minWithdrawal: number;
  withdrawalFeeDiscount: number;

  // Social earning (per-package)
  socialEarningEnabled?: boolean;
  socialEarningConfig?: Record<string, number> | null;

  xpMultiplier: number;
  taskRewardMultiplier: number;
  socialEarningMultiplier: number;
  dailyReferralPoints: number;
  referralCommissionLevels: number;

  features: string[];
  badgeColor: string | null;
}

// Per-action recipient point overrides shown in the Social Earning section.
const SOCIAL_POINT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "likePoints", label: "Per like received" },
  { key: "commentPoints", label: "Per comment received" },
  { key: "postPoints", label: "Per post (daily)" },
  { key: "sharePoints", label: "Per share received" },
  { key: "votePoints", label: "Per poll vote received" },
];

interface PackageFormProps {
  pkg: PackageFormPkg;
  mode?: Mode;
}

// Section-level toggles (left grid).
const SECTION_TOGGLES: Array<{ key: keyof PackageFormPkg; label: string; tooltip: string }> = [
  { key: "tasksEnabled", label: "Tasks", tooltip: "Master switch — turn this OFF to disable every task type for plan users." },
  { key: "socialFeedEnabled", label: "Social Feed", tooltip: "Posting / commenting / reactions on /social. Reading is always allowed." },
  { key: "referralsEnabled", label: "Referrals", tooltip: "Daily referral bonus claim + referral commissions." },
  { key: "withdrawalsEnabled", label: "Withdrawals", tooltip: "User can request a withdrawal. KYC + min-withdrawal still apply." },
  { key: "marketplaceEnabled", label: "Marketplace", tooltip: "Buying / selling listings on /marketplace." },
  { key: "boostEnabled", label: "Post Boost", tooltip: "Pay-to-pin own social post (100 pts)." },
  { key: "dailyMissionEnabled", label: "Daily Mission", tooltip: "Show today's daily mission card + claim rewards." },
  { key: "lotteryEnabled", label: "Lottery", tooltip: "Enter the daily lottery draw." },
  { key: "coursesEnabled", label: "Courses", tooltip: "Access the courses section." },
  { key: "advertiserEnabled", label: "Advertiser", tooltip: "Create/fund ad campaigns on /advertiser." },
  { key: "gamesEnabled", label: "HTML5 Games", tooltip: "Access the games catalog at /games." },
  { key: "adFree", label: "Ad-Free", tooltip: "Hide all ads for users on this plan (Browse & Earn still works)." },
];

// Creator / monetization capabilities (grantable per plan).
const CREATOR_TOGGLES: Array<{ key: keyof PackageFormPkg; label: string; tooltip: string }> = [
  { key: "createTasksEnabled", label: "Create Tasks", tooltip: "Lets users on this plan create/publish their own tasks." },
  { key: "sellCoursesEnabled", label: "Sell Courses / Tutor", tooltip: "Lets users create & sell courses (tutor tools)." },
  { key: "sellMarketplaceEnabled", label: "Sell on Marketplace", tooltip: "Lets users list & sell items on the marketplace." },
  { key: "agencyModeEnabled", label: "Agency / Moderator Mode", tooltip: "Unlocks the agency console / moderator capabilities." },
  { key: "shareLinksEnabled", label: "Share Links in Posts", tooltip: "Lets users post clickable links (with previews) in the social feed." },
  { key: "shareYoutubeEnabled", label: "Share YouTube / Video Links", tooltip: "Lets users post YouTube/Vimeo/video links that play inline in the feed." },
  { key: "targetTasksEnabled", label: "Target Tasks (audience)", tooltip: "Lets users target their own tasks by country/state/district/upazila, gender & age when creating them." },
];

// Per-task-type toggles (right grid). Each gates a TaskType in /api/tasks/*.
const TASK_TOGGLES: Array<{ key: keyof PackageFormPkg; label: string; tooltip: string }> = [
  { key: "socialTasksEnabled", label: "Social Tasks", tooltip: "TaskType.SOCIAL — like/follow/comment social tasks." },
  { key: "proxyTasksEnabled", label: "Proxy Tasks", tooltip: "TaskType.PROXY — IP-based geo tasks." },
  { key: "articleTasksEnabled", label: "Article Tasks", tooltip: "TaskType.ARTICLE — read-and-extract-key tasks." },
  { key: "videoTasksEnabled", label: "Video Tasks", tooltip: "TaskType.VIDEO — watch-and-engage tasks." },
  { key: "quizTasksEnabled", label: "Quiz Tasks", tooltip: "TaskType.QUIZ — multiple-choice quiz tasks." },
  { key: "surveyTasksEnabled", label: "Survey Tasks", tooltip: "TaskType.SURVEY — survey tasks." },
  { key: "offerwallTasksEnabled", label: "Offerwall Tasks", tooltip: "TaskType.OFFERWALL — third-party offerwall tasks." },
  { key: "appInstallEnabled", label: "App Install Tasks", tooltip: "TaskType.APPINSTALL — install-an-app tasks with proof." },
];

export function PackageForm({ pkg, mode = "edit" }: PackageFormProps) {
  const router = useRouter();
  const isCreate = mode === "create";

  const [data, setData] = useState<PackageFormPkg>(pkg);
  const [newFeature, setNewFeature] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setField = <K extends keyof PackageFormPkg>(
    key: K,
    value: PackageFormPkg[K]
  ) => setData((d) => ({ ...d, [key]: value }));

  const toggle = (key: keyof PackageFormPkg) =>
    setData((d) => ({ ...d, [key]: !d[key] as PackageFormPkg[typeof key] }));

  const addFeature = () => {
    const v = newFeature.trim();
    if (!v) return;
    setField("features", [...data.features, v]);
    setNewFeature("");
  };

  const removeFeature = (idx: number) =>
    setField(
      "features",
      data.features.filter((_, i) => i !== idx)
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const url = isCreate
        ? "/api/admin/packages"
        : `/api/admin/packages/${pkg.id}`;
      const method = isCreate ? "POST" : "PUT";

      // Strip the id field from the payload — server doesn't want it.
      const { id: _id, ...payload } = data;
      void _id;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save");
      }
      toast.success(isCreate ? "Plan created" : "Plan updated");
      router.push("/admin/packages");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Identity */}
      <Section title="Identity" description="Slug + display name + access level. Slug is permanent — pick carefully.">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Slug" htmlFor="slug" tooltip="Lowercase, dashes only. Permanent identifier — used in URLs and in code.">
            <input
              id="slug"
              required
              value={data.slug}
              onChange={(e) => setField("slug", e.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9-]*"
              maxLength={60}
              placeholder="pro-monthly"
              disabled={!isCreate && data.isDefault}
              className={inputCls}
            />
          </Field>
          <Field label="Display Name" htmlFor="name">
            <input id="name" required maxLength={80} value={data.name} onChange={(e) => setField("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description" htmlFor="desc" className="md:col-span-2">
            <textarea id="desc" rows={2} maxLength={500} value={data.description ?? ""} onChange={(e) => setField("description", e.target.value)} className={inputCls + " resize-none"} />
          </Field>

          <Field label="Access Level" htmlFor="accessLevel" tooltip="Higher = more premium. Tasks/quizzes/missions gate by minimum required level. The default plan should usually be 0.">
            <input id="accessLevel" type="number" min={0} max={1000} value={data.accessLevel} onChange={(e) => setField("accessLevel", parseInt(e.target.value) || 0)} className={inputCls} />
          </Field>
          <Field label="Display Order" htmlFor="order" tooltip="Lower numbers appear first on the public packages page.">
            <input id="order" type="number" min={0} value={data.order} onChange={(e) => setField("order", parseInt(e.target.value) || 0)} className={inputCls} />
          </Field>

          <div className="flex items-center gap-3">
            <input id="isActive" type="checkbox" checked={data.isActive} onChange={(e) => setField("isActive", e.target.checked)} disabled={data.isDefault} className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" />
            <label htmlFor="isActive" className={"text-sm inline-flex items-center gap-1.5 " + (data.isDefault ? "text-gray-500" : "text-gray-300")}>
              Active
              {data.isDefault && (
                <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]" title="The default plan cannot be deactivated">
                  <Lock className="w-3 h-3" />
                </span>
              )}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input id="isDefault" type="checkbox" checked={data.isDefault} onChange={(e) => setField("isDefault", e.target.checked)} className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-amber-500" />
            <label htmlFor="isDefault" className="text-sm text-gray-300 inline-flex items-center gap-1.5">
              Set as Default
              <Tooltip text="Every new user is auto-attached to the default plan. Setting this here will demote the current default automatically." />
            </label>
          </div>
        </div>
      </Section>

      {/* Pricing */}
      <Section title="Pricing" description="Monthly + yearly prices in USD. Validity controls how long a purchase lasts." icon={<DollarSign className="w-5 h-5 text-emerald-400" />}>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Monthly Price ($)" htmlFor="pmo">
            <input id="pmo" type="number" min={0} step="0.01" value={data.priceMonthly} onChange={(e) => setField("priceMonthly", parseFloat(e.target.value) || 0)} className={inputCls} />
          </Field>
          <Field label="Yearly Price ($)" htmlFor="pyr" tooltip="Optional. Leave 0 to disable annual billing.">
            <input id="pyr" type="number" min={0} step="0.01" value={data.priceYearly ?? 0} onChange={(e) => setField("priceYearly", parseFloat(e.target.value) || null)} className={inputCls} />
          </Field>
          <Field label="Validity (days)" htmlFor="vd" tooltip="0 / blank = no expiry (lifetime). Otherwise, sets `User.packageExpiresAt = now + N days` on purchase.">
            <input id="vd" type="number" min={0} value={data.validityDays ?? 0} onChange={(e) => setField("validityDays", parseInt(e.target.value) || null)} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Feature Toggles */}
      <Section title="Feature Toggles" description="Switch entire sections of the platform on/off for users on this plan." icon={<Power className="w-5 h-5 text-cyan-400" />}>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 mb-2 inline-flex items-center gap-1.5">
              <Layers className="w-3 h-3" /> Sections
            </h3>
            <div className="space-y-1.5">
              {SECTION_TOGGLES.map((t) => (
                <ToggleRow key={t.key as string} label={t.label} tooltip={t.tooltip} checked={data[t.key] as boolean} onChange={() => toggle(t.key)} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2 inline-flex items-center gap-1.5">
              <ListChecks className="w-3 h-3" /> Task Types
            </h3>
            <div className="space-y-1.5">
              {TASK_TOGGLES.map((t) => (
                <ToggleRow key={t.key as string} label={t.label} tooltip={t.tooltip} checked={data[t.key] as boolean} onChange={() => toggle(t.key)} disabled={!data.tasksEnabled} disabledHint="Enable Tasks (left) first" />
              ))}
            </div>
          </div>
        </div>

        {/* Creator capabilities — monetization/creator grants for this plan. */}
        <div className="mt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-fuchsia-300 mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Creator Capabilities
          </h3>
          <div className="grid md:grid-cols-2 gap-1.5">
            {CREATOR_TOGGLES.map((t) => (
              <ToggleRow key={t.key as string} label={t.label} tooltip={t.tooltip} checked={data[t.key] as boolean} onChange={() => toggle(t.key)} />
            ))}
          </div>
        </div>
      </Section>

      {/* Limits + Multipliers */}
      <Section title="Limits" description="Hard caps and minimum thresholds." icon={<Wallet className="w-5 h-5 text-amber-400" />}>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Daily Task Limit" htmlFor="dtl" tooltip="Total tasks per day across ALL types. -1 = unlimited. 0 = effectively blocks tasks for this plan.">
            <input id="dtl" type="number" min={-1} value={data.dailyTaskLimit} onChange={(e) => setField("dailyTaskLimit", parseInt(e.target.value) || 0)} className={inputCls} />
          </Field>
          <Field label="Daily Post Limit" htmlFor="dpl" tooltip="Max social-feed posts per day for this plan. -1 = unlimited.">
            <input id="dpl" type="number" min={-1} value={data.dailyPostLimit ?? -1} onChange={(e) => setField("dailyPostLimit", parseInt(e.target.value) || -1)} className={inputCls} />
          </Field>
          <Field label="Min Withdrawal ($)" htmlFor="mw">
            <input id="mw" type="number" min={0} step="0.01" value={data.minWithdrawal} onChange={(e) => setField("minWithdrawal", parseFloat(e.target.value) || 0)} className={inputCls} />
          </Field>
          <Field label="Withdrawal Fee Discount (%)" htmlFor="wfd" tooltip="Subtracted from the payment-method fee. e.g. method 1.5% − discount 0.5% = user pays 1%.">
            <input id="wfd" type="number" min={0} max={100} step="0.1" value={data.withdrawalFeeDiscount} onChange={(e) => setField("withdrawalFeeDiscount", parseFloat(e.target.value) || 0)} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Single combined section: every earning-related setting in one place. */}
      <Section
        title="Earnings & Referrals"
        description="Multipliers boost the user's own earnings; the referral pyramid controls how many upline levels they earn from."
        icon={<Gift className="w-5 h-5 text-pink-400" />}
      >
        {/* Multipliers — sub-group with its own header */}
        <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-3">
            Earning Multipliers
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Daily Check-in XP ×" htmlFor="xpm" tooltip="Multiplies the daily-reward streak XP only — does NOT affect task XP.">
              <input id="xpm" type="number" min={0.1} step="0.1" value={data.xpMultiplier} onChange={(e) => setField("xpMultiplier", parseFloat(e.target.value) || 1)} className={inputCls} />
            </Field>
            <Field label="Task Reward ×" htmlFor="trm" tooltip="Multiplies the points + xp the user earns from completing any task.">
              <input id="trm" type="number" min={0.1} step="0.1" value={data.taskRewardMultiplier} onChange={(e) => setField("taskRewardMultiplier", parseFloat(e.target.value) || 1)} className={inputCls} />
            </Field>
            <Field label="Social Earning ×" htmlFor="sem" tooltip="Multiplies the points + xp paid by the social-earning helper (likes received, comments received, etc.).">
              <input id="sem" type="number" min={0.1} step="0.1" value={data.socialEarningMultiplier} onChange={(e) => setField("socialEarningMultiplier", parseFloat(e.target.value) || 1)} className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Referral pyramid — the visual selector */}
        <ReferralPyramidSelector
          levels={data.referralCommissionLevels}
          onChange={(n) => setField("referralCommissionLevels", n)}
          dailyL1Points={data.dailyReferralPoints}
          onDailyL1Change={(v) => setField("dailyReferralPoints", v)}
        />
      </Section>

      {/* Social feed earning — per-package overrides. Base defaults + actor
          rewards + caps live in Settings → Social Earning. */}
      <Section
        title="Social Feed Earning"
        description="Points a user earns when their posts receive engagement. Leave a field blank to use the global default (Settings → Social Earning). The multiplier above still applies on top."
        icon={<Gift className="w-5 h-5 text-emerald-400" />}
      >
        <ToggleRow
          label="Enable social earning"
          checked={data.socialEarningEnabled ?? true}
          onChange={() =>
            setField("socialEarningEnabled", !(data.socialEarningEnabled ?? true))
          }
          tooltip="Hard on/off. When off, this plan earns no points from likes/comments/etc."
        />
        {(data.socialEarningEnabled ?? true) && (
          <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SOCIAL_POINT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`sep-${f.key}`}>
                <input
                  id={`sep-${f.key}`}
                  type="number"
                  min={0}
                  placeholder="default"
                  value={data.socialEarningConfig?.[f.key] ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setData((d) => {
                      const next = { ...(d.socialEarningConfig ?? {}) };
                      if (raw === "") delete next[f.key];
                      else next[f.key] = Math.max(0, parseInt(raw) || 0);
                      return { ...d, socialEarningConfig: next };
                    });
                  }}
                  className={inputCls}
                />
              </Field>
            ))}
          </div>
        )}
      </Section>

      {/* Features (marketing) */}
      <Section title="Features (marketing copy)" description="Free-form bullet list shown on the public packages page. No functional effect." icon={<Sparkles className="w-5 h-5 text-indigo-400" />}>
        <div className="flex gap-2">
          <input
            type="text"
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFeature();
              }
            }}
            placeholder="Add a feature line…"
            className={inputCls + " flex-1"}
          />
          <button type="button" onClick={addFeature} className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        {data.features.length > 0 && (
          <ul className="space-y-1.5 mt-3">
            {data.features.map((feature, idx) => (
              <li key={idx} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                <span className="text-sm text-gray-300">{feature}</span>
                <button type="button" onClick={() => removeFeature(idx)} className="p-1 text-gray-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <Field label="Badge Color (hex)" htmlFor="bc" tooltip="Optional accent color used by the user-side plan badge in the feed.">
            <input id="bc" type="text" pattern="#[0-9a-fA-F]{6}" placeholder="#6366f1" value={data.badgeColor ?? ""} onChange={(e) => setField("badgeColor", e.target.value || null)} className={inputCls + " max-w-xs"} />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={() => router.push("/admin/packages")} className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
          Cancel
        </button>
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg disabled:opacity-50">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isCreate ? "Create Plan" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500";

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  tooltip,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  tooltip?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-gray-400 mb-1.5 inline-flex items-center gap-1.5">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children}
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <Info className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400 cursor-help" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-64 p-2 rounded-lg bg-gray-950 border border-gray-700 text-[11px] text-gray-300 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
        {text}
      </span>
    </span>
  );
}

function ToggleRow({
  label,
  tooltip,
  checked,
  onChange,
  disabled,
  disabledHint,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <label
      className={
        "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border " +
        (disabled
          ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
          : checked
            ? "border-emerald-500/30 bg-emerald-500/5 cursor-pointer"
            : "border-gray-800 bg-gray-950 cursor-pointer hover:border-gray-700")
      }
      title={disabled ? disabledHint : tooltip}
    >
      <span className="text-sm text-gray-200 inline-flex items-center gap-1.5">
        {label}
        <Tooltip text={tooltip} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-emerald-500"
      />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReferralPyramidSelector — visual L1..L5+ pill selector + daily-L1 input.
// Click L_N to set `levels = N`. Click L0 ("None") to disable commissions.
// Levels are contiguous (you can't unlock L3 without L1+L2).
// ─────────────────────────────────────────────────────────────────────────────
const PYRAMID_PILLS: Array<{ n: number; label: string; rate: string }> = [
  { n: 0, label: "None", rate: "0%" },
  { n: 1, label: "L1", rate: "Direct referrals" },
  { n: 2, label: "L2", rate: "+ Their referrals" },
  { n: 3, label: "L3", rate: "+ One more level" },
  { n: 4, label: "L4", rate: "+ One more level" },
  { n: 5, label: "L5", rate: "+ One more level" },
];

function ReferralPyramidSelector({
  levels,
  onChange,
  dailyL1Points,
  onDailyL1Change,
}: {
  levels: number;
  onChange: (n: number) => void;
  dailyL1Points: number;
  onDailyL1Change: (v: number) => void;
}) {
  const explain =
    levels === 0
      ? "User has a referral code but earns no commission at any level."
      : levels === 1
        ? "Earns from direct referrals only (one level deep)."
        : `Earns from L1 down to L${levels} (${levels} levels deep). Anything above L${levels} pays nothing.`;

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-cyan-300 font-bold inline-flex items-center gap-1.5">
          Referral Commission Pyramid
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Pick the deepest level this plan earns from. Per-level rates are configured globally on{" "}
          <Link href="/admin/referrals" className="text-cyan-400 underline">/admin/referrals</Link>.
        </p>
      </div>

      {/* Visual level selector */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {PYRAMID_PILLS.map((p) => {
          const active = levels === p.n;
          const within = p.n > 0 && p.n <= levels;
          return (
            <button
              key={p.n}
              type="button"
              onClick={() => onChange(p.n)}
              className={
                "rounded-lg border p-3 text-center transition-all " +
                (active
                  ? "border-cyan-500 bg-cyan-500/15 ring-2 ring-cyan-500/40"
                  : within
                    ? "border-cyan-500/40 bg-cyan-500/5 text-cyan-300"
                    : "border-gray-700 bg-gray-900 hover:border-gray-600")
              }
            >
              <p
                className={
                  "text-base font-extrabold " +
                  (active || within ? "text-white" : "text-gray-400")
                }
              >
                {p.label}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                {p.rate}
              </p>
            </button>
          );
        })}
      </div>

      {/* Status sentence */}
      <div className="rounded-md bg-gray-950 border border-gray-800 px-3 py-2">
        <p className="text-xs text-gray-300">
          <span className="text-cyan-400 font-bold">→</span> {explain}
        </p>
      </div>

      {/* Daily L1 points (only meaningful when levels >= 1) */}
      <div>
        <label className="text-sm font-medium text-gray-400 mb-1.5 inline-flex items-center gap-1.5">
          Daily Bonus per L1 Referral
          <Tooltip text="Daily payout per L1 referral on /referrals/daily-claim. Falls back to platform default of 5 when 0. Ignored if Levels = None." />
        </label>
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="number"
            min={0}
            step="0.1"
            value={dailyL1Points}
            onChange={(e) => onDailyL1Change(parseFloat(e.target.value) || 0)}
            disabled={levels === 0}
            className={inputCls + " disabled:opacity-50"}
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">pts/day</span>
        </div>
        {levels === 0 && (
          <p className="text-[11px] text-amber-400 mt-1">
            ⚠ Levels = None — daily bonus is disabled regardless of this value.
          </p>
        )}
      </div>
    </div>
  );
}
