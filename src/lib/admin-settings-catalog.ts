/**
 * The catalog of every admin setting: its key, its name, and what it does.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Settings on this platform have failed twice in the same way. First, 44 of
 * 104 controls wrote a `SystemSetting` row that nothing read — Save said
 * "saved" and nothing changed. Second, the withdrawal-fee box wrote
 * `withdrawal_fee_pct` while every payout read `withdrawal_fee_percent`, so
 * users were charged 5% when the owner had set 2.5%. Both failures are the
 * same bug: the label an admin reads and the key the code reads drifted apart
 * because they lived in different places.
 *
 * So they live here, together, in one row per setting. The form renders the
 * label and description FROM this file (`system-settings-form.tsx` passes only
 * `settingKey`), the save routine derives which tab owns a key FROM this file,
 * and the search box indexes this file. A setting cannot be renamed in one
 * place and not the other, because there is only one place.
 *
 * ORDER
 * -----
 * `SETTING_GROUPS` is ordered deliberately, most-reached-for first, and each
 * group carries an explicit `order`. Within a group, array order here is the
 * display order — also deliberate, not "whoever added a control last".
 *
 * STATUS
 * ------
 * `status: "not-active"` marks a control that is saved but not yet honoured by
 * any code path. The UI renders those with a visible badge. The one thing that
 * is never acceptable is a control that looks live and is not.
 *
 * `scripts/verify-settings-truth.ts` enforces all of the above.
 */

export type SettingGroupId =
  | "general"
  | "financial"
  | "limits"
  | "security"
  | "ui_toggles"
  | "notifications"
  | "email"
  | "integrations";

export interface SettingGroup {
  id: SettingGroupId;
  /** Tab name. */
  label: string;
  /** One line: what this group of settings affects. */
  blurb: string;
  /** Explicit display order. Lower is earlier. */
  order: number;
}

/**
 * Deliberate order: the money and the day-to-day guardrails come first,
 * because those are what an owner opens this screen to change. Credentials
 * and plumbing sit at the end — they are set once and then left alone.
 */
export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    id: "general",
    label: "General",
    blurb: "The platform's name, and the switch that closes the whole app.",
    order: 1,
  },
  {
    id: "financial",
    label: "Money",
    blurb:
      "Withdrawals, points-to-cash, VAT, the marketplace cut, ad click price, and what buyers may fund.",
    order: 2,
  },
  {
    id: "limits",
    label: "Limits & anti-fraud",
    blurb:
      "Per-user caps, task-approval automation, duplicate/VPN/ad-blocker defences, and log retention.",
    order: 3,
  },
  {
    id: "security",
    label: "Security & KYC",
    blurb: "Password rules and the thresholds the automatic KYC check uses.",
    order: 4,
  },
  {
    id: "ui_toggles",
    label: "Site toggles",
    blurb:
      "Site-wide switches — popups, install prompts, and what a user must do before they can earn or withdraw.",
    order: 5,
  },
  {
    id: "notifications",
    label: "Notifications",
    blurb: "Push notifications, and which events are worth sending one for.",
    order: 6,
  },
  {
    id: "email",
    label: "Email",
    blurb: "The SMTP server outgoing mail is sent through, and who it is from.",
    order: 7,
  },
  {
    id: "integrations",
    label: "Integrations",
    blurb:
      "API keys and secrets for the third parties the platform talks to. Stored encrypted.",
    order: 8,
  },
] as const;

export type SettingStatus = "live" | "not-active";

export interface SettingEntry {
  /** The `SystemSetting.key` this control reads and writes. */
  key: string;
  group: SettingGroupId;
  /** The name shown on the control. */
  label: string;
  /** One line, plain language: what changing this actually does. */
  description: string;
  /**
   * `not-active` = the row is saved but no code path honours it yet. Rendered
   * with a badge so nobody mistakes it for a working switch.
   */
  status?: SettingStatus;
}

/** Array order is the display order within each group. */
export const SETTINGS_CATALOG: readonly SettingEntry[] = [
  // ── General ──
  { key: "platform_name", group: "general", label: "Platform Name", description: "Names outgoing email and the entry in authenticator apps" },
  { key: "maintenance_mode", group: "general", label: "Maintenance Mode", description: "Closes the whole app for everyone except staff, who keep full access so they can see the fix land. The marketing and login pages stay up." },
  { key: "maintenance_message", group: "general", label: "Maintenance message", description: "Shown on the closed-app screen" },

  // ── Money ──
  { key: "currency", group: "financial", label: "Currency", description: "The currency symbol and code shown throughout the app. It does not convert any stored amount — balances are held in USD." },
  { key: "min_withdrawal", group: "financial", label: "Min Withdrawal ($)", description: "The smallest cash withdrawal a user may request" },
  { key: "max_withdrawal", group: "financial", label: "Max Withdrawal ($)", description: "The largest cash withdrawal a user may request in one go" },
  { key: "withdrawal_fee_percent", group: "financial", label: "Withdrawal Fee (%)", description: "Deducted from every approved withdrawal" },
  { key: "marketplace.fee_percent", group: "financial", label: "Marketplace fee (%)", description: "The platform's cut of every marketplace sale — taken out of the seller's payout, not added to the buyer's price. Per-listing and per-asset-type overrides on the Marketplace commission screen still win over this." },
  { key: "allow_withdrawals", group: "financial", label: "Allow withdrawals", description: "Master switch. Turning this off stops every new withdrawal request platform-wide." },
  { key: "withdrawal_requires_subscription", group: "financial", label: "Require a subscription to withdraw", description: "Users on the free/default package must buy a package before they can withdraw" },
  { key: "withdrawal_payout_time_message", group: "financial", label: "Payout time message", description: "Shown to the user after they request a withdrawal" },
  { key: "points_per_usd", group: "financial", label: "Points per $1 (USD)", description: "The conversion rate when a user turns earned points into cash — how many points buy one dollar" },
  { key: "points_convert_threshold", group: "financial", label: "Points needed before cash conversion unlocks", description: "Below this, the wallet hides the points-to-cash button" },
  { key: "bkash.usdToBdtRate", group: "financial", label: "bKash rate (BDT per $1)", description: "bKash settles in taka; a USD deposit is charged at this rate" },
  { key: "vat_enabled", group: "financial", label: "Charge VAT on deposits", description: "Add VAT on top of the deposit amount (shown on the deposit page)" },
  { key: "vat_pct", group: "financial", label: "VAT (%)", description: "Applied to the deposit amount + method charge" },
  { key: "ads.cpcUsd", group: "financial", label: "Default cost per click ($)", description: "Charged to the advertiser’s campaign budget when a click is billed. Existing spend is never re-priced — every click snapshots the rate in force when it happened." },
  { key: "buyer.enabled", group: "financial", label: "Allow buyers to fund tasks", description: "Off closes the create-task API for everyone, even accounts that already hold the permission." },
  { key: "buyer.fee_percent", group: "financial", label: "Platform fee (%)", description: "The platform's cut when a buyer funds a task — charged on top of the points they buy" },
  { key: "buyer.min_points_per_task", group: "financial", label: "Min points per completion", description: "The least a buyer may offer one user for finishing their task" },
  { key: "buyer.max_points_per_task", group: "financial", label: "Max points per completion", description: "The most a buyer may offer one user for finishing their task" },
  { key: "buyer.max_active_tasks", group: "financial", label: "Max live tasks per buyer", description: "Live + awaiting review + paused · 0 = no limit" },
  { key: "buyer.max_completions", group: "financial", label: "Max completions per task", description: "Caps how large one buyer-funded task can get" },
  { key: "buyer.min_purchase_points", group: "financial", label: "Min task-credit purchase", description: "points, per purchase" },
  { key: "buyer.max_purchase_points", group: "financial", label: "Max task-credit purchase", description: "points, per purchase" },
  { key: "buyer.allowed_task_types", group: "financial", label: "Task types buyers may create", description: "Unticking both closes buyer task creation as surely as the switch above" },
  { key: "buyer.allowed_platforms", group: "financial", label: "Social platforms buyers may target", description: "Which of the social platforms a buyer may aim a social task at. Ticking none means all of them, now and in future." },
  { key: "buyer.require_kyc", group: "financial", label: "Require KYC before funding", description: "Checked when the buyer spends, not when they are paid — an unverified account is stopped before the money moves." },
  { key: "buyer.auto_approve_tasks", group: "financial", label: "Publish buyer tasks without review", description: "Off (recommended) sends every buyer task to the admin review queue first. On means a funded task goes live immediately." },
  { key: "buyer.refund_fee_on_reject", group: "financial", label: "Refund the fee when a task is rejected", description: "On (recommended): a buyer whose task you turn down gets the fee back too. Off keeps it as a review charge." },

  // ── Limits & anti-fraud ──
  { key: "max_withdrawals_per_day", group: "limits", label: "Max Withdrawals Per Day", description: "Rolling 24h, per user · 0 = no limit" },
  { key: "max_referrals_per_user", group: "limits", label: "Max Referrals Per User", description: "Beyond this, signups stop being attributed · 0 = no limit" },
  { key: "max_active_listings", group: "limits", label: "Max Active Marketplace Listings", description: "Live + awaiting review, per seller · 0 = no limit" },
  { key: "ai.daily_limit_per_user", group: "limits", label: "AI Generations / User / Day", description: "How many AI generations one user may run per day before the button stops working · 0 = no limit" },
  { key: "social.ai_regenerate_limit", group: "limits", label: "AI caption re-rolls per social task", description: "How many times a user may ask the AI for a different caption on one social task before they have to write their own" },
  { key: "tasks.sequential_unlock", group: "limits", label: "Sequential task unlock", description: "Lock every task behind the previous one — users must finish tasks one-by-one in the admin-set Sequence Order. Resets daily; admins are never locked." },
  { key: "antifraud.auto_approve_min_trust", group: "limits", label: "Auto-approve min trust (0 = off)", description: "A submission from a user at or above this trust score is approved without an admin looking at it · 0 = never auto-approve" },
  { key: "antifraud.spot_check_percent", group: "limits", label: "Spot-check % of auto-approvals", description: "This share of auto-approved submissions is still sent to the review queue, so auto-approval never goes entirely unwatched" },
  { key: "antifraud.block_duplicate_proof", group: "limits", label: "Block duplicate proof", description: "Reject a task submission whose proof (post/profile URL, username, or re-uploaded screenshot) already matches another user's. Off = flag for review only. Public links can legitimately repeat, so leave off unless abuse is high." },
  { key: "antifraud.max_users_per_ip", group: "limits", label: "Max accounts per IP (0 = off)", description: "How many accounts may sign up from one IP address before further signups are refused · 0 = no limit" },
  { key: "antifraud.adblock_reminder_minutes", group: "limits", label: "Ad-blocker reminder every N minutes (0 = off)", description: "How often a user running an ad-blocker is reminded to turn it off · 0 = never remind" },
  { key: "antifraud.vpn_block_enabled", group: "limits", label: "Block VPN / proxy (best-effort)", description: "Block task work from IPs that match the datacenter/VPN prefix list below. Heuristic only — catches roughly 50–70%, not 100%. For full accuracy, integrate a detection provider later." },
  { key: "antifraud.vpn_ranges", group: "limits", label: "VPN/datacenter IP prefixes (space or comma separated, e.g. 45.83. 2607:5300:)", description: "The IP prefixes the VPN block above matches against. An empty list means the switch has nothing to block." },
  { key: "antifraud.adblock_gate_enabled", group: "limits", label: "Ad-blocker gate on tasks", description: "Block opening a task while an ad-blocker is detected (a re-check overlay is shown). Turn off to allow tasks with an ad-blocker on." },
  { key: "retention_days", group: "limits", label: "Log retention (days)", description: "How long page views, system logs, audit records and notifications are kept before the nightly prune deletes them" },

  // ── Security & KYC ──
  { key: "password_min_length", group: "security", label: "Password Min Length", description: "6–64 · applies to sign-up, reset, change and admin-created accounts" },
  { key: "require_strong_passwords", group: "security", label: "Require Strong Passwords", description: "At least one uppercase letter, one lowercase letter and one number" },
  { key: "kyc.autoEnabled", group: "security", label: "Instant (auto) KYC verification", description: "Let users verify instantly via AI OCR + selfie face-match. Uncertain cases still go to manual review." },
  { key: "kyc.faceMinSimilarity", group: "security", label: "Auto KYC — min face-match %", description: "How closely the selfie must match the ID photo to verify automatically. Below this it goes to manual review, never an auto-rejection." },
  { key: "kyc.ocrMinConfidence", group: "security", label: "Auto KYC — min OCR confidence (0–1)", description: "How sure the document read must be to verify automatically. Below this it goes to manual review, never an auto-rejection." },
  { key: "kyc.ocrRejectBelow", group: "security", label: "Auto KYC — reject-outright OCR confidence (0–1)", description: "Below this the read is treated as unusable. It still routes to manual review, never an auto-rejection." },

  // ── Site toggles ──
  { key: "analytics_pageviews_enabled", group: "ui_toggles", label: "Page-view analytics", description: "Record page visits and foreground time for /admin/analytics. First-party only — nothing is sent to a third party." },
  { key: "ui.cookies_popup_enabled", group: "ui_toggles", label: "Cookie consent popup", description: "Show the cookie consent banner to visitors" },
  { key: "ui.notification_popup_enabled", group: "ui_toggles", label: "Notification permission popup", description: "Show the “Enable notifications” prompt" },
  { key: "ui.pwa_install_prompt_enabled", group: "ui_toggles", label: "PWA install prompt", description: "Prompt users who haven't installed the app (Android & iOS); hidden once installed" },
  { key: "ui.require_profile_completion", group: "ui_toggles", label: "Require a complete profile", description: "Lock the features ticked below until a user's profile meets the chosen standard. Enforced on every route that lets a user earn, not just on the pages." },
  { key: "profile_gate.mode", group: "ui_toggles", label: "Profile standard", description: "7 essentials (photo, name, birth date, gender, phone, country) or the full 100% profile ring." },
  { key: "profile_gate.features", group: "ui_toggles", label: "Locked until complete", description: "Which features stay locked until the profile meets the standard." },
  { key: "ui.require_kyc_for_withdrawal", group: "ui_toggles", label: "Require KYC for withdrawals", description: "Users must be KYC-verified to withdraw. When off, only withdrawals over $100 require KYC." },
  { key: "ui.require_email_verification", group: "ui_toggles", label: "Require email verification to log in", description: "Users must verify their email before they can sign in. When off, unverified accounts can log in (Google accounts are always verified)." },
  { key: "ui.groups_enabled", group: "ui_toggles", label: "Groups", description: "Show the Groups tab on the social feed. When off the tab is hidden AND the group pages and API are blocked, so the feature is genuinely off. Existing groups and their members are kept and come back when you turn this on." },
  { key: "ui.theme_default", group: "ui_toggles", label: "Default theme", description: "The theme everyone gets: Dark or Light. Users who have never chosen — and every user, when the switch below is off — see this one." },
  { key: "ui.theme_user_choice", group: "ui_toggles", label: "Let users choose their theme", description: "On: the light/dark switch appears in the header and in Settings. Off: the switch is hidden everywhere and everyone sees the default theme above, including users who had already picked the other one." },

  // ── Notifications ──
  { key: "push_notifications_enabled", group: "notifications", label: "Push Notifications", description: "Web push (VAPID). Off here mutes push for everyone, whatever each user has chosen." },
  { key: "notify_new_task", group: "notifications", label: "New Task Available", description: "Notify users when a task they are eligible for is published" },
  { key: "notify_withdrawal", group: "notifications", label: "Withdrawal Status Updates", description: "Notify a user when their withdrawal is approved, paid or rejected" },
  { key: "notify_referral", group: "notifications", label: "New Referral", description: "Notify a user when someone signs up through their referral link" },
  { key: "notify_level_up", group: "notifications", label: "Level Up", description: "Notify a user when they earn enough XP to reach the next level" },

  // ── Email ──
  { key: "smtp_host", group: "email", label: "SMTP Host", description: "The mail server every outgoing email is sent through" },
  { key: "smtp_port", group: "email", label: "SMTP Port", description: "587 for STARTTLS, 465 for implicit TLS" },
  { key: "smtp_username", group: "email", label: "SMTP Username", description: "The account the mail server is logged into" },
  { key: "smtp_password", group: "email", label: "SMTP Password", description: "Stored encrypted. For Gmail this is an app password, not the account password." },
  { key: "email_from_address", group: "email", label: "From Email", description: "The address recipients see — and reply to" },
  { key: "email_from_name", group: "email", label: "From Name", description: "The sender name shown beside the address" },
  { key: "email_notifications_enabled", group: "email", label: "Enable Email Notifications", description: "Master switch for all outgoing email. Off stops verification, reset and alert mail platform-wide." },
  { key: "email_daily_cap", group: "email", label: "Broadcast emails per day", description: "How many broadcast emails may leave the platform in one calendar day. Gmail SMTP allows 500, SendGrid's free tier 100, Amazon SES 200 in sandbox and 50,000 in production — set this to your provider's figure. Exceeding it does not bounce one message, it gets the sending domain throttled, which takes password resets with it. 0 = no limit." },
  { key: "email_per_minute", group: "email", label: "Broadcast emails per minute", description: "Throughput cap, so a large send is paced instead of arriving as a burst a provider reads as spam. 60 is safe almost everywhere. 0 = no limit." },

  // ── Integrations ──
  { key: "gemini_api_key", group: "integrations", label: "Gemini API Key", description: "Powers every AI feature — caption generation, KYC document reading. Stored encrypted." },
  { key: "openai_api_key", group: "integrations", label: "OpenAI API Key", description: "ChatGPT image generation in the Stock Studio. Billed by OpenAI, separately from the others." },
  { key: "magnific_api_key", group: "integrations", label: "Magnific API Key", description: "Magnific (ex-Freepik): the stock library, its image models, and video generation. The env var MAGNIFIC_API_KEY wins when it is set." },
  { key: "magnific_webhook_secret", group: "integrations", label: "Magnific Webhook Secret", description: "Only needed if you switch Magnific to push results. The scheduler polls instead, so this can stay empty." },
  { key: "bkash.appKey", group: "integrations", label: "bKash app key", description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "bkash.appSecret", group: "integrations", label: "bKash app secret", description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "bkash.username", group: "integrations", label: "bKash username", description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "bkash.password", group: "integrations", label: "bKash password", description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "sslcommerz.storeId", group: "integrations", label: "SSLCommerz store ID", description: "SSLCommerz credential for card and mobile-banking deposits. Stored encrypted." },
  { key: "sslcommerz.storePasswd", group: "integrations", label: "SSLCommerz store password", description: "SSLCommerz credential for card and mobile-banking deposits. Stored encrypted." },
  { key: "integrations.telegram_bot_token", group: "integrations", label: "Telegram bot token", description: "Lets the platform confirm a user really joined a Telegram channel. Without it, Telegram join tasks fall back to manual proof." },
  { key: "integrations.telegram_bot_username", group: "integrations", label: "Telegram bot username (@handle)", description: "The bot's public handle, shown to users who have to start a chat with it" },
  { key: "integrations.discord_client_id", group: "integrations", label: "Discord client ID", description: "Discord OAuth app credential, used to link a user's Discord account" },
  { key: "integrations.discord_client_secret", group: "integrations", label: "Discord client secret", description: "Discord OAuth app credential, used to link a user's Discord account. Stored encrypted." },
  { key: "integrations.discord_bot_token", group: "integrations", label: "Discord bot token", description: "Lets the platform confirm a user really joined a Discord server. Without it, Discord join tasks fall back to manual proof." },
] as const;

/**
 * Settings that are real, but live on another admin screen.
 *
 * They are indexed here so that searching "commission" or "referral %" on the
 * settings screen finds them instead of returning nothing — the failure that
 * made an admin conclude a setting did not exist and go looking for it in the
 * code.
 */
export interface ElsewhereEntry {
  label: string;
  description: string;
  href: string;
  /** The screen it lives on, for the search result line. */
  where: string;
  /** Key, where it has one — so searching by key still finds it. */
  key?: string;
  status?: SettingStatus;
}

export const SETTINGS_ELSEWHERE: readonly ElsewhereEntry[] = [
  {
    label: "Marketplace commission overrides",
    description:
      "Per-asset-type and per-listing commission rates that beat the default marketplace fee",
    href: "/admin/marketplace/settings",
    where: "Marketplace → Settings",
    key: "marketplace.fee_percent",
  },
  {
    label: "Promotion / boost pricing",
    description: "What a seller pays to promote a marketplace listing",
    href: "/admin/marketplace/settings",
    where: "Marketplace → Settings",
  },
  {
    label: "Dispute mediation fee",
    description: "The platform's charge for mediating a marketplace dispute",
    href: "/admin/marketplace/settings",
    where: "Marketplace → Settings",
  },
  {
    label: "Referral commission %",
    description:
      "What a referrer earns from their referrals, per level — held in the ReferralLevel table, not a settings row",
    href: "/admin/referrals/settings",
    where: "Referrals → Settings",
  },
  {
    label: "Task reward multiplier · Max tasks per day",
    description:
      "Both are per-package values, so they live on the package rather than as one platform-wide number",
    href: "/admin/packages",
    where: "Packages",
  },
  {
    label: "Feed widgets",
    description:
      "Which widgets appear beside the social feed, and in what order",
    href: "/admin/settings/feed-widgets",
    where: "Settings → Feed widgets",
  },
  {
    label: "Social earning rates & daily missions",
    description:
      "What a post, like, comment or share pays, and how the daily missions are configured",
    href: "/admin/settings/social-earning",
    where: "Settings → Social earning",
  },
  {
    label: "Course refund window & certificate settings",
    description: "How long a student has to ask for a refund, and what the certificate says",
    href: "/admin/courses/settings",
    where: "Courses → Settings",
  },
  {
    label: "Leaderboard metric",
    description:
      "Which number the leaderboards rank by. Task earnings is the default — it is the one a buyer cannot inflate by trading with a second account.",
    href: "/admin/leaderboard",
    where: "Leaderboard → Settings",
    key: "lb_metric",
  },
  {
    label: "Leaderboard on/off",
    description:
      "Off takes the board down for real — the page redirects, the API answers 403 and the nav entry disappears, so a bookmarked link is not a way back in",
    href: "/admin/leaderboard",
    where: "Leaderboard → Settings",
    key: "lb_enabled",
    status: "live",
  },
  {
    label: "Pay leaderboard prizes automatically",
    description:
      "An hourly job closes the finished day, week and month on UTC and pays the winners once. Windows that closed before this was switched on are never paid.",
    href: "/admin/leaderboard",
    where: "Leaderboard → Settings",
    key: "lb_auto_reset",
    status: "live",
  },
  {
    label: "Leaderboard gift prizes",
    description:
      "A physical or digital prize per rank. The winner is told what they won and it appears in Gifts Owed for you to mark fulfilled — there is no shipping or tracking.",
    href: "/admin/leaderboard",
    where: "Leaderboard → Settings",
    key: "lb_gift_items",
    status: "live",
  },
  {
    label: "Leaderboard XP prizes (daily / weekly / monthly)",
    description:
      "XP paid per rank alongside the points prize, in the same transaction. Leave a period empty and it awards no XP rather than a made-up amount.",
    href: "/admin/leaderboard",
    where: "Leaderboard → Settings",
    key: "lb_monthly_xp_distribution",
    status: "live",
  },
];

/** Which tab owns a key. Derived — never hand-maintained. */
export const CATEGORY_FOR_KEY: Record<string, SettingGroupId> =
  Object.fromEntries(SETTINGS_CATALOG.map((e) => [e.key, e.group]));

const BY_KEY = new Map(SETTINGS_CATALOG.map((e) => [e.key, e]));

export function settingEntry(key: string): SettingEntry | undefined {
  return BY_KEY.get(key);
}

export const GROUP_BY_ID = new Map(SETTING_GROUPS.map((g) => [g.id, g]));

/** Groups in their deliberate order, each with its controls in theirs. */
export function groupedSettings(): {
  group: SettingGroup;
  entries: SettingEntry[];
}[] {
  return [...SETTING_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      group,
      entries: SETTINGS_CATALOG.filter((e) => e.group === group.id),
    }));
}

export interface SettingHit {
  label: string;
  description: string;
  key?: string;
  /** Where to go: a tab on this screen, or another admin page. */
  group?: SettingGroupId;
  href?: string;
  where: string;
  status?: SettingStatus;
}

/**
 * Search by name, description or key.
 *
 * The point is that an admin who remembers only the word "withdrawal" finds
 * every withdrawal control without knowing which tab it is filed under — so
 * the key is searched too, and so are the settings that live on other screens.
 */
export function searchSettings(query: string): SettingHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const score = (hay: string[], weightLabel: string): number => {
    const blob = hay.join("   ").toLowerCase();
    if (!terms.every((t) => blob.includes(t))) return 0;
    // A match in the name beats a match buried in the description.
    const name = weightLabel.toLowerCase();
    if (name.startsWith(q)) return 4;
    if (terms.every((t) => name.includes(t))) return 3;
    return 1;
  };

  const hits: (SettingHit & { _score: number })[] = [];

  for (const e of SETTINGS_CATALOG) {
    const g = GROUP_BY_ID.get(e.group)!;
    const s = score([e.label, e.description, e.key, g.label], e.label);
    if (s)
      hits.push({
        label: e.label,
        description: e.description,
        key: e.key,
        group: e.group,
        where: g.label,
        status: e.status,
        _score: s,
      });
  }

  for (const e of SETTINGS_ELSEWHERE) {
    const s = score([e.label, e.description, e.key ?? "", e.where], e.label);
    if (s)
      hits.push({
        label: e.label,
        description: e.description,
        key: e.key,
        href: e.href,
        where: e.where,
        status: e.status,
        // Another screen is a slightly worse answer than a control right here.
        _score: s - 0.5,
      });
  }

  return hits
    .sort((a, b) => b._score - a._score || a.label.localeCompare(b.label))
    .map(({ _score, ...hit }) => hit);
}

/** The DOM id a control is given, so search can scroll to it. */
export function settingDomId(key: string): string {
  return `setting-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
