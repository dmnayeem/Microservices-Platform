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
 * `settingKey`), the save routine derives which row category a key is filed
 * under FROM this file, and the search box indexes this file. A setting cannot
 * be renamed in one place and not the other, because there is only one place.
 *
 * TWO DIFFERENT GROUPINGS — DO NOT MERGE THEM
 * -------------------------------------------
 * `group` is the STORAGE category: the `SystemSetting.category` a key is saved
 * under, which readers such as `getUiToggles()` query by. Changing a key's
 * group changes where its row lives, so it is fixed.
 *
 * `SETTINGS_TABS` is the SCREEN layout: which tab and which section of
 * /admin/settings a control appears in, ordered by what an admin is trying to
 * do ("set up email", "change what money is worth"). It can be rearranged
 * freely — it never touches a stored row.
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

/** A storage category. See "TWO DIFFERENT GROUPINGS" above. */
export interface SettingGroup {
  id: SettingGroupId;
  /** Name of the category (shown in audit rows, not as a tab any more). */
  label: string;
  /** One line: what this group of settings affects. */
  blurb: string;
  /** Explicit order. Lower is earlier. */
  order: number;
}

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
      "Points-to-cash, VAT, the marketplace cut, and what buyers may fund. Withdrawal limits and fees are on the Withdrawals page.",
    order: 2,
  },
  {
    id: "limits",
    label: "Limits",
    blurb:
      "Per-user caps, sequential task unlock, country matching, and log retention. Anti-fraud settings are on the Fraud Monitor page.",
    order: 3,
  },
  {
    id: "security",
    label: "Security",
    blurb: "Password rules, link safety, uploads and outbound fetches. The automatic KYC thresholds are on the KYC page.",
    order: 4,
  },
  {
    id: "ui_toggles",
    label: "Site toggles",
    blurb:
      "Site-wide switches — theme, popups, install prompts, and what a user must do before they can earn or withdraw.",
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
  /** Storage category (the row's `category`). Not the tab — see above. */
  group: SettingGroupId;
  /** The name shown on the control. Plain language, sentence case. */
  label: string;
  /** One line, plain language: what changing this actually does. */
  description: string;
  /**
   * The short "what happens at the edges" line shown under the description:
   * "Off = …", "0 = no limit". Only where the description does not say it.
   */
  effect?: string;
  /** Unit shown beside the label: "%", "$", "points", "days", "per day"… */
  unit?: string;
  /**
   * A setting whose change hits every user at once. Saving a change to it
   * asks for confirmation first, with this sentence as the warning.
   */
  danger?: string;
  /** A credential: shown masked, with Show and Replace. */
  secret?: boolean;
  /**
   * `not-active` = the row is saved but no code path honours it yet. Rendered
   * with a badge so nobody mistakes it for a working switch.
   */
  status?: SettingStatus;
  /**
   * Set when the control lives on its feature's own admin page instead of the
   * System Settings form. The entry stays here, because this is still where
   * the key's name, description and row category (`group`) are defined, but
   * the System Settings form neither renders nor saves it. One editor per key.
   */
  home?: { href: string; where: string };
  /**
   * "switch" = an on/off boolean. Optional: the Control Center's Feature
   * switches list also recognises booleans by their stored value and by
   * name ("…_enabled", "allow_…", "require_…"). Set it when a boolean key
   * does not look like one, or "value" when a key looks like a switch but is not.
   */
  kind?: "switch" | "value";
}

/** Where each feature's settings moved to (Phase 3b). */
export const WITHDRAWALS_HOME = {
  href: "/admin/withdrawals?tab=settings",
  where: "Withdrawals → Settings",
};
export const KYC_HOME = { href: "/admin/users/kyc?tab=settings", where: "KYC → Settings" };
export const FRAUD_HOME = { href: "/admin/fraud?tab=settings", where: "Fraud Monitor → Settings" };
export const FEED_HOME = { href: "/admin/settings/feed?tab=general", where: "Feed settings → General" };

/**
 * Every setting. Array order is irrelevant to the screen — `SETTINGS_TABS`
 * below decides where and in what order a control appears.
 */
export const SETTINGS_CATALOG: readonly SettingEntry[] = [
  // ── General ──
  { key: "platform_name", group: "general", label: "Platform name", description: "The name used as the sender of outgoing email and as the account name in authenticator (2FA) apps." },
  { key: "maintenance_mode", group: "general", label: "Maintenance mode", description: "Closes the whole app for everyone except staff, who keep full access so they can see the fix land. The marketing and login pages stay up.", effect: "On = users see the maintenance screen instead of the app. Off = normal.", danger: "Turning maintenance mode on closes the app for every user who is not staff, immediately." },
  { key: "maintenance_message", group: "general", label: "Maintenance message", description: "The text users see on the closed-app screen while maintenance mode is on.", effect: "Empty = a generic \"back shortly\" message." },

  // ── Money ──
  { key: "currency", group: "financial", label: "Display currency", description: "Saved, but nothing reads it yet: every amount is still shown as USD ($) and balances are held in USD. Not the same thing as the deposit-page currency rates (Payment methods) or the company books currency (Company finance).", status: "not-active" },
  { key: "min_withdrawal", group: "financial", label: "Min Withdrawal ($)", description: "The smallest cash withdrawal a user may request", home: WITHDRAWALS_HOME },
  { key: "max_withdrawal", group: "financial", label: "Max Withdrawal ($)", description: "The largest cash withdrawal a user may request in one go", home: WITHDRAWALS_HOME },
  { key: "withdrawal_fee_percent", group: "financial", label: "Withdrawal Fee (%)", description: "Deducted from every approved withdrawal", home: WITHDRAWALS_HOME },
  { key: "marketplace.fee_percent", group: "financial", label: "Marketplace fee", unit: "%", description: "The platform's cut of every marketplace sale — taken out of the seller's payout, not added to the buyer's price. Per-listing and per-asset-type overrides on the Marketplace commission screen still win over this.", effect: "0 = sellers keep the whole price." },
  { key: "allow_withdrawals", group: "financial", label: "Allow withdrawals", description: "Master switch. Turning this off stops every new withdrawal request platform-wide.", danger: "Changing the withdrawal master switch affects every user at once — off stops every new withdrawal request platform-wide.", home: WITHDRAWALS_HOME },
  { key: "withdrawal_requires_subscription", group: "financial", label: "Require a subscription to withdraw", description: "Users on the free/default package must buy a package before they can withdraw", home: WITHDRAWALS_HOME },
  { key: "withdrawal_payout_time_message", group: "financial", label: "Payout time message", description: "Shown to the user after they request a withdrawal", home: WITHDRAWALS_HOME },
  { key: "points_per_usd", group: "financial", label: "Points per $1", unit: "points", description: "The conversion rate when a user turns earned points into cash — how many points buy one dollar. Every earning and withdrawal is valued with it.", effect: "Higher = each point is worth less cash.", danger: "This revalues every points balance on the platform against cash, immediately. One wrong digit changes what every user's points are worth." },
  { key: "points_convert_threshold", group: "financial", label: "Points needed before cash conversion unlocks", unit: "points", description: "A user needs at least this many points before the wallet shows the points-to-cash button.", effect: "Below this, the convert button is hidden." },
  { key: "bkash.usdToBdtRate", group: "financial", label: "bKash rate", unit: "BDT per $1", description: "bKash settles in taka; a USD deposit made through bKash is charged at this rate." },
  { key: "vat_enabled", group: "financial", label: "Charge VAT on deposits", description: "Adds VAT on top of the deposit amount, shown as its own line on the deposit page.", effect: "Off = no VAT is added to deposits." },
  { key: "plans.auto_renew_enabled", group: "financial", label: "Allow plan auto-renew", description: "Lets members turn on auto-renew for their paid plan; at expiry the plan is renewed from their cash balance (never points) at the plan's current price for the same term length.", effect: "Off = no plan is renewed automatically (and the toggle is hidden) — every plan simply ends at its expiry date." },
  { key: "vat_pct", group: "financial", label: "VAT rate", unit: "%", description: "Applied to the deposit amount plus the payment-method charge, while VAT is switched on." },
  { key: "buyer.enabled", group: "financial", label: "Allow buyers to fund tasks", description: "Lets accounts with the buyer permission create and fund their own tasks.", effect: "Off closes the create-task API for everyone, even accounts that already hold the permission." },
  { key: "buyer.fee_percent", group: "financial", label: "Platform fee on buyer tasks", unit: "%", description: "The platform's cut when a buyer funds a task — charged on top of the points they buy.", effect: "0 = buyers pay only the rewards and the platform earns nothing on task funding." },
  { key: "buyer.min_points_per_task", group: "financial", label: "Min points per completion", unit: "points", description: "The least a buyer may offer one user for finishing their task" },
  { key: "buyer.max_points_per_task", group: "financial", label: "Max points per completion", unit: "points", description: "The most a buyer may offer one user for finishing their task" },
  { key: "buyer.max_active_tasks", group: "financial", label: "Max live tasks per buyer", description: "How many tasks one buyer may have live, awaiting review or paused at the same time.", effect: "0 = no limit." },
  { key: "buyer.max_completions", group: "financial", label: "Max completions per task", description: "Caps how large one buyer-funded task can get (how many users may complete it)." },
  { key: "buyer.min_purchase_points", group: "financial", label: "Min task-credit purchase", unit: "points", description: "The smallest amount of task credit a buyer may buy in one purchase." },
  { key: "buyer.max_purchase_points", group: "financial", label: "Max task-credit purchase", unit: "points", description: "The largest amount of task credit a buyer may buy in one purchase." },
  { key: "buyer.allowed_task_types", group: "financial", label: "Task types buyers may create", description: "Which kinds of task a buyer may create and fund.", effect: "Unticking all of them closes buyer task creation as surely as the switch above." },
  { key: "buyer.allowed_platforms", group: "financial", label: "Social platforms buyers may target", description: "Which of the social platforms a buyer may aim a social task at.", effect: "Ticking none means all of them, now and in future." },
  { key: "buyer.require_kyc", group: "financial", label: "Require KYC before funding", description: "Checked when the buyer spends, not when they are paid — an unverified account is stopped before the money moves.", effect: "Off = any buyer may fund tasks without verifying." },
  { key: "buyer.auto_approve_tasks", group: "financial", label: "Publish buyer tasks without review", description: "Off (recommended) sends every buyer task to the admin review queue first. On means a funded task goes live immediately." },

  // ── Limits & anti-fraud ──
  { key: "max_withdrawals_per_day", group: "limits", label: "Max Withdrawals Per Day", description: "Rolling 24h, per user · 0 = no limit", home: WITHDRAWALS_HOME },
  { key: "max_active_listings", group: "limits", label: "Max live marketplace listings per seller", description: "How many listings one seller may have live or awaiting review at the same time.", effect: "0 = no limit." },
  { key: "ai.daily_limit_per_user", group: "limits", label: "AI generations per user", unit: "per day", description: "How many AI generations one user may run per day before the button stops working.", effect: "0 = no limit." },
  { key: "social.ai_regenerate_limit", group: "limits", label: "AI caption re-rolls per social task", description: "How many times a user may ask the AI for a different caption on one social task before they have to write their own", home: FEED_HOME },
  { key: "tasks.sequential_unlock", group: "limits", label: "Sequential task unlock", description: "Lock every task behind the previous one — users must finish tasks one-by-one in the admin-set Sequence Order. Resets daily; admins are never locked.", effect: "Off = users may open tasks in any order." },
  { key: "antifraud.auto_approve_min_trust", group: "limits", label: "Auto-approve min trust (0 = off)", description: "A submission from a user at or above this trust score is approved without an admin looking at it · 0 = never auto-approve", home: FRAUD_HOME },
  { key: "antifraud.spot_check_percent", group: "limits", label: "Spot-check % of auto-approvals", description: "This share of auto-approved submissions is still sent to the review queue, so auto-approval never goes entirely unwatched", home: FRAUD_HOME },
  { key: "antifraud.block_duplicate_proof", group: "limits", label: "Block duplicate proof", description: "Reject a task submission whose proof (post/profile URL, username, or re-uploaded screenshot) already matches another user's. Off = flag for review only. Public links can legitimately repeat, so leave off unless abuse is high.", home: FRAUD_HOME },
  { key: "antifraud.max_accounts_per_device", group: "limits", label: "Max accounts per device (0 = off)", description: "How many accounts one browser/device may hold. The reliable multi-account signal — a device id kept in a cookie and local storage, backed by a browser fingerprint. Recommended 2–3.", home: FRAUD_HOME },
  { key: "antifraud.device_limit_action", group: "limits", label: "When the device limit is hit", description: "Block refuses the new sign-up and task work from that device; Flag only allows it and reports it to the Fraud Monitor. Either way the account gets fraud risk.", home: FRAUD_HOME },
  { key: "targeting.country_ip_only", group: "limits", label: "Match country targeting by IP only", description: "Off: a country rule (tasks, banners, ads, notifications, offers) uses the country in the profile, or the IP country when there is none. On: only the IP country counts, so a user cannot reach another country's tasks by typing it into their profile. VPN users are matched to the VPN's country." },
  { key: "antifraud.max_users_per_ip", group: "limits", label: "Max accounts per IP (0 = off)", description: "How many accounts may use one IP address. A whole home or office WiFi shares one IP, and mobile data changes it — treat this as a hint. Recommended 10–20 with Flag only.", home: FRAUD_HOME },
  { key: "antifraud.ip_limit_action", group: "limits", label: "When the IP limit is hit", description: "Flag only (recommended) allows the sign-up/task and reports it for review, with no fraud risk. Block refuses — which locks out everyone after the limit on a shared WiFi.", home: FRAUD_HOME },
  { key: "antifraud.adblock_reminder_minutes", group: "limits", label: "Ad-blocker reminder every N minutes (0 = off)", description: "How often a user running an ad-blocker is reminded to turn it off · 0 = never remind", home: FRAUD_HOME },
  { key: "antifraud.risk_enabled", group: "limits", label: "Fraud risk scoring", description: "Each caught cheating attempt on a task (another user's proof, someone else's article key, a reviewer's \"this was cheating\") adds to the user's fraud risk %. Shown per user on the Fraud Monitor.", home: FRAUD_HOME },
  { key: "antifraud.auto_suspend_enabled", group: "limits", label: "Auto-suspend at the bar", description: "Suspend a user automatically when their fraud risk reaches the bar below. They are emailed a link to appeal; staff accounts are never auto-suspended.", home: FRAUD_HOME },
  { key: "antifraud.auto_suspend_at", group: "limits", label: "Auto-suspend at (%)", description: "The fraud risk % at which an account is suspended. Users are warned at 50% and 80%.", home: FRAUD_HOME },
  { key: "antifraud.risk_points", group: "limits", label: "Risk points per offence", description: "How many % each kind of cheating adds. 0 records it without adding risk.", home: FRAUD_HOME },
  { key: "antifraud.vpn_block_enabled", group: "limits", label: "Block VPN / proxy (best-effort)", description: "Block task work from IPs that match the datacenter/VPN prefix list below. Heuristic only — catches roughly 50–70%, not 100%. For full accuracy, integrate a detection provider later.", home: FRAUD_HOME },
  { key: "antifraud.vpn_ranges", group: "limits", label: "VPN/datacenter IP prefixes (space or comma separated, e.g. 45.83. 2607:5300:)", description: "The IP prefixes the VPN block above matches against. An empty list means the switch has nothing to block.", home: FRAUD_HOME },
  { key: "antifraud.adblock_gate_enabled", group: "limits", label: "Ad-blocker gate on tasks", description: "Block opening a task while an ad-blocker is detected (a re-check overlay is shown). Turn off to allow tasks with an ad-blocker on.", home: FRAUD_HOME },
  { key: "retention_days", group: "limits", label: "Log retention", unit: "days", description: "How long page views, system logs, audit records and notifications are kept before the nightly prune deletes them", effect: "Higher = kept longer. Unread notifications are never deleted." },

  // ── Security & KYC ──
  { key: "password_min_length", group: "security", label: "Minimum password length", unit: "characters", description: "Applies to sign-up, password reset, password change and admin-created accounts. Allowed range 6–64." },
  { key: "require_strong_passwords", group: "security", label: "Require strong passwords", description: "New passwords must contain at least one uppercase letter, one lowercase letter and one number.", effect: "Off = only the minimum length is checked." },
  { key: "security.upload_archive_policy", group: "security", label: "Suspicious uploads (archives, macros, scan hits)", description: "What happens when an uploaded ZIP holds programs (.exe, .bat, .apk…), escapes its folder, is a zip bomb or password-protected, an Office file has macros, a PDF can launch a program, or the malware scan hits. Review (recommended): accept, flag it on the marketplace listing for the reviewer and in the Abuse Center. Block: refuse the upload. Allow: do nothing. Disguised programs, scripts and web pages are always refused, whatever this says." },
  { key: "security.virustotal_api_key", group: "security", label: "VirusTotal API key (optional malware lookup)", secret: true, description: "When set, uploaded documents and archives are looked up on VirusTotal by their SHA-256 fingerprint — the file itself is never sent. A hit raises a HIGH case in the Abuse Center (and deletes the file when the upload policy is Block). The VIRUSTOTAL_API_KEY environment variable takes priority. Free keys allow about 4 lookups a minute.", effect: "Empty = no malware lookup." },
  { key: "security.outbound_domain_per_min", group: "security", label: "Outbound fetches per website", unit: "per minute", description: "How often the server may fetch pages from one website (link previews, proof checks, thumbnails) across the whole platform. The hourly cap is 20× this. Over the limit the fetch is skipped — a proof then goes to manual review, never an auto-rejection." },
  { key: "security.outbound_user_per_hour", group: "security", label: "Outbound fetches per user", unit: "per hour", description: "How many different links one account can make the server fetch in an hour. Over the limit the fetch is skipped and the Abuse Center is told once." },
  { key: "kyc.autoEnabled", group: "security", label: "Instant (auto) KYC verification", description: "Let users verify instantly via AI OCR + selfie face-match. Uncertain cases still go to manual review.", home: KYC_HOME },
  { key: "kyc.faceMinSimilarity", group: "security", label: "Auto KYC — min face-match %", description: "How closely the selfie must match the ID photo to verify automatically. Below this it goes to manual review, never an auto-rejection.", home: KYC_HOME },
  { key: "kyc.ocrMinConfidence", group: "security", label: "Auto KYC — min OCR confidence (0–1)", description: "How sure the document read must be to verify automatically. Below this it goes to manual review, never an auto-rejection.", home: KYC_HOME },
  { key: "security.link_policy", group: "security", label: "Unsafe link policy", description: "What happens when someone saves a link Google Safe Browsing lists as phishing or malware, or a look-alike of a well-known site. Flag (recommended): the post goes through and the link is sent to the Abuse Center for review. Block: the post is refused with a message. Off: only the blocked-domain list below is checked." },
  { key: "security.blocked_domains", group: "security", label: "Blocked domains", description: "One domain per line. Any link to these domains or their subdomains is refused everywhere users post (feed, comments, profiles, listings, tasks, ads, chat), whatever the policy above. Staff screens are only flagged.", effect: "Empty = no domain is blocked outright." },
  { key: "security.safe_browsing_api_key", group: "security", label: "Google Safe Browsing API key", secret: true, description: "Free key from Google Cloud (Safe Browsing API), used by the unsafe-link policy. If Google is unreachable, links are allowed — nobody is blocked because Google is down. The env var GOOGLE_SAFE_BROWSING_KEY wins when set.", effect: "Empty = only the blocked-domain list and the built-in checks run." },
  { key: "kyc.ocrRejectBelow", group: "security", label: "Auto KYC — reject-outright OCR confidence (0–1)", description: "Below this the read is treated as unusable. It still routes to manual review, never an auto-rejection.", home: KYC_HOME },

  // ── Site toggles ──
  { key: "analytics_pageviews_enabled", group: "ui_toggles", label: "Page-view analytics", description: "Record page visits and foreground time for /admin/analytics. First-party only — nothing is sent to a third party.", effect: "Off = no new page views are recorded; the Traffic reports stop growing." },
  { key: "ui.cookies_popup_enabled", group: "ui_toggles", label: "Cookie consent popup", description: "Show the cookie consent banner to visitors.", effect: "Off = the banner is never shown." },
  { key: "ui.notification_popup_enabled", group: "ui_toggles", label: "Notification permission popup", description: "Show the “Enable notifications” prompt that asks users to allow push notifications.", effect: "Off = users are never asked; they can still enable push from Settings." },
  { key: "ui.pwa_install_prompt_enabled", group: "ui_toggles", label: "App install prompt", description: "Prompt users who haven't installed the app (Android & iOS); hidden once installed.", effect: "Off = no install prompt is shown." },
  { key: "ui.require_profile_completion", group: "ui_toggles", label: "Require a complete profile", description: "Lock the features ticked below until a user's profile meets the chosen standard. Enforced on every route that lets a user earn, not just on the pages.", effect: "Off = nothing is locked behind the profile." },
  { key: "profile_gate.mode", group: "ui_toggles", label: "Profile standard", description: "7 essentials (photo, name, birth date, gender, phone, country) or the full 100% profile ring." },
  { key: "profile_gate.min_percent", group: "ui_toggles", label: "Profile percentage required", unit: "%", description: "With the profile-ring standard: how complete the profile must be (10–100%) before features unlock." },
  { key: "profile_gate.features", group: "ui_toggles", label: "Locked until complete", description: "Which features stay locked until the profile meets the standard." },
  { key: "ui.require_kyc_for_withdrawal", group: "ui_toggles", label: "Require KYC for withdrawals", description: "Users must be KYC-verified to withdraw. When off, only withdrawals over $100 require KYC.", home: WITHDRAWALS_HOME },
  { key: "ui.require_email_verification", group: "ui_toggles", label: "Require email verification to log in", description: "Users must verify their email before they can sign in.", effect: "Off = unverified accounts can log in (Google accounts are always verified)." },
  { key: "ui.groups_enabled", group: "ui_toggles", label: "Groups", description: "Show the Groups tab on the social feed. When off the tab is hidden AND the group pages and API are blocked, so the feature is genuinely off. Existing groups and their members are kept and come back when you turn this on.", home: FEED_HOME },
  { key: "ui.theme_default", group: "ui_toggles", label: "Default theme", description: "The theme everyone gets: Dark or Light. Users who have never chosen — and every user, when the switch below is off — see this one." },
  { key: "ui.theme_user_choice", group: "ui_toggles", label: "Let users choose their theme", description: "On: the light/dark switch appears in the header and in Settings. Off: the switch is hidden everywhere and everyone sees the default theme above, including users who had already picked the other one." },
  { key: "ui.accent_user_choice", group: "ui_toggles", label: "Let users choose their accent colour", description: "On: users can pick their own accent colour in Profile and Settings. Off: the colour swatches are hidden and every user sees the platform colour, even those who had picked another one." },

  // ── Notifications ──
  { key: "push_notifications_enabled", group: "notifications", label: "Push notifications", description: "Web push (VAPID) to phones and browsers that allowed it.", effect: "Off mutes push for everyone, whatever each user has chosen. In-app notifications still arrive." },
  { key: "celebrate.achievement_min_points", group: "notifications", label: "Big achievement popup from", unit: "points", description: "An achievement worth at least this many points also shows a celebration popup, not only a bell notification.", effect: "0 = every achievement with a reward gets the popup." },
  { key: "notify_new_task", group: "notifications", label: "New task available", description: "Notify users when a task they are eligible for is published.", effect: "Off = no email or push; the in-app record is still kept." },
  { key: "notify_withdrawal", group: "notifications", label: "Withdrawal status updates", description: "Notify a user when their withdrawal is approved, paid or rejected.", effect: "Off = no email or push; the in-app record is still kept." },
  { key: "notify_level_up", group: "notifications", label: "Level up", description: "Notify a user when they earn enough XP to reach the next level.", effect: "Off = no email or push; the in-app record is still kept." },

  // ── Email ──
  { key: "smtp_host", group: "email", label: "SMTP server", description: "The mail server every outgoing email is sent through, e.g. smtp.gmail.com." },
  { key: "smtp_port", group: "email", label: "SMTP port", description: "587 for STARTTLS (most providers), 465 for implicit TLS." },
  { key: "smtp_username", group: "email", label: "SMTP username", description: "The account the mail server is logged into — usually the mailbox address." },
  { key: "smtp_password", group: "email", label: "SMTP password", secret: true, description: "Stored encrypted. For Gmail this is an app password, not the account password." },
  { key: "email_from_address", group: "email", label: "From address", description: "The address recipients see — and reply to, unless a Reply-To is set." },
  { key: "email_from_name", group: "email", label: "From name", description: "The sender name shown beside the address.", effect: "Empty = the platform name." },
  { key: "email_test_recipient", group: "email", label: "Send test emails to", description: "Where the SMTP test and the broadcast \"Send test to me\" go.", effect: "Empty = your own admin account email." },
  { key: "email_reply_to", group: "email", label: "Reply-To address", description: "Where replies go. Use a mailbox somebody reads — a From address that bounces replies hurts inbox placement.", effect: "Empty = the From address." },
  { key: "email_notifications_enabled", group: "email", label: "Send email", description: "Master switch for all outgoing email.", effect: "Off stops verification, password-reset and alert mail platform-wide." },
  { key: "email_daily_cap", group: "email", label: "Broadcast emails", unit: "per day", description: "How many broadcast emails may leave the platform in one calendar day. Gmail SMTP allows 500, SendGrid's free tier 100, Amazon SES 200 in sandbox and 50,000 in production — set this to your provider's figure. Exceeding it gets the sending domain throttled, which takes password resets with it.", effect: "0 = no limit." },
  { key: "email_per_minute", group: "email", label: "Broadcast emails", unit: "per minute", description: "Throughput cap, so a large send is paced instead of arriving as a burst a provider reads as spam. 60 is safe almost everywhere.", effect: "0 = no limit." },

  // ── Integrations ──
  { key: "gemini_api_key", group: "integrations", label: "Gemini API key", secret: true, description: "Powers every AI feature — caption generation, KYC document reading. Stored encrypted. The GEMINI_API_KEY env var wins when set.", effect: "Empty = AI features are unavailable." },
  { key: "openai_api_key", group: "integrations", label: "OpenAI API key", secret: true, description: "ChatGPT image generation in the Stock Studio. Billed by OpenAI, separately from the others." },
  { key: "magnific_api_key", group: "integrations", label: "Magnific API key", secret: true, description: "Magnific (ex-Freepik): the stock library, its image models, and video generation. The env var MAGNIFIC_API_KEY wins when it is set." },
  { key: "magnific_webhook_secret", group: "integrations", label: "Magnific webhook secret", secret: true, description: "Only needed if you switch Magnific to push results. The scheduler polls instead, so this can stay empty." },
  { key: "bkash.appKey", group: "integrations", label: "bKash app key", secret: true, description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "bkash.appSecret", group: "integrations", label: "bKash app secret", secret: true, description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "bkash.username", group: "integrations", label: "bKash username", description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "bkash.password", group: "integrations", label: "bKash password", secret: true, description: "bKash merchant credential for taka deposits. Stored encrypted." },
  { key: "sslcommerz.storeId", group: "integrations", label: "SSLCommerz store ID", description: "SSLCommerz credential for card and mobile-banking deposits. Stored encrypted." },
  { key: "sslcommerz.storePasswd", group: "integrations", label: "SSLCommerz store password", secret: true, description: "SSLCommerz credential for card and mobile-banking deposits. Stored encrypted." },
  { key: "integrations.telegram_bot_token", group: "integrations", label: "Telegram bot token", secret: true, description: "Lets the platform confirm a user really joined a Telegram channel.", effect: "Empty = Telegram join tasks fall back to manual proof." },
  { key: "integrations.telegram_bot_username", group: "integrations", label: "Telegram bot username (@handle)", description: "The bot's public handle, shown to users who have to start a chat with it" },
  { key: "integrations.discord_client_id", group: "integrations", label: "Discord client ID", description: "Discord OAuth app credential, used to link a user's Discord account" },
  { key: "integrations.discord_client_secret", group: "integrations", label: "Discord client secret", secret: true, description: "Discord OAuth app credential, used to link a user's Discord account. Stored encrypted." },
  { key: "integrations.discord_bot_token", group: "integrations", label: "Discord bot token", secret: true, description: "Lets the platform confirm a user really joined a Discord server.", effect: "Empty = Discord join tasks fall back to manual proof." },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
   THE SCREEN LAYOUT — tabs → sections → controls
   ═══════════════════════════════════════════════════════════════════════════
   Grouped by what an admin is trying to do. Every key the System Settings form
   edits appears in exactly one section; every key that moved to a feature page
   appears as a link card in the section an admin would look for it in.
   `verify-settings-truth.ts` holds both of those true. */

export type SettingsTabId =
  | "general"
  | "money"
  | "users"
  | "email"
  | "notifications"
  | "security"
  | "integrations"
  | "appearance"
  | "limits";

/** A pointer to settings edited on another screen. */
export interface SettingsLinkCard {
  label: string;
  href: string;
  /** The button text: where it goes. */
  linkLabel: string;
  why: string;
  /** Keys edited there — listed as chips so the card says what it holds. */
  keys?: readonly string[];
}

/** Non-setting blocks a section can show (buttons, panels). */
export type SettingsWidget =
  | "email-test"
  | "email-deliverability"
  | "link-safety-test";

export interface SettingsSection {
  /** Unique across all tabs — it is the `?section=` value. */
  id: string;
  title: string;
  blurb?: string;
  /** Controls, in display order. */
  keys: readonly string[];
  widgets?: readonly SettingsWidget[];
  links?: readonly SettingsLinkCard[];
  /** Things an admin may look for here that are not settings (yet). */
  notes?: { title: string; items: readonly { label: string; why: string }[] };
}

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  blurb: string;
  sections: readonly SettingsSection[];
}

const homedAt = (h: { href: string }) =>
  SETTINGS_CATALOG.filter((e) => e.home?.href === h.href).map((e) => e.key);

const WITHDRAWAL_CARD: SettingsLinkCard = {
  label: "Withdrawal settings",
  href: WITHDRAWALS_HOME.href,
  linkLabel: "Withdrawals page",
  why: "Min / max withdrawal, the fee, withdrawals per day, the master switch, the subscription and KYC requirements and the payout-time message are edited on the Withdrawals page, beside the queue they govern.",
  keys: homedAt(WITHDRAWALS_HOME),
};
const FRAUD_CARD: SettingsLinkCard = {
  label: "Anti-fraud & fraud risk",
  href: FRAUD_HOME.href,
  linkLabel: "Fraud Monitor page",
  why: "Auto-approval trust, spot checks, duplicate proof, accounts per device / IP, the VPN block, the task ad-blocker gate, risk points and auto-suspension.",
  keys: homedAt(FRAUD_HOME),
};
const KYC_CARD: SettingsLinkCard = {
  label: "Automatic KYC thresholds",
  href: KYC_HOME.href,
  linkLabel: "KYC page",
  why: "Instant (auto) KYC on/off and its face-match and OCR confidence bars live next to the KYC queue they decide.",
  keys: homedAt(KYC_HOME),
};
const PAYMENT_METHODS_CARD: SettingsLinkCard = {
  label: "Payment methods",
  href: "/admin/payment-methods",
  linkLabel: "Payment Methods page",
  why: "Which deposit methods users are offered (bKash, SSLCommerz, manual), payout method cards and the local currency rates on the deposit page.",
};

export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    id: "general",
    label: "General",
    blurb: "The platform's name and the switch that closes the whole app.",
    sections: [
      {
        id: "identity",
        title: "Site identity",
        keys: ["platform_name"],
        notes: {
          title: "Set in code, not here",
          items: [
            {
              label: "Platform URL, logo, favicon, support email",
              why: "The page title, social cards, logo, favicon and the support address are compile-time values (app/layout.tsx, config/company.ts). Changing them is a rebrand — canonical URLs, the PWA manifest and the legal pages all have to move together — not a settings row.",
            },
            {
              label: "Timezone & language",
              why: "Dates render in each visitor's own locale and the app ships in English only. Neither has anything to change yet.",
            },
          ],
        },
      },
      {
        id: "maintenance",
        title: "Maintenance",
        blurb: "Close the app while you fix something. Staff keep full access.",
        keys: ["maintenance_mode", "maintenance_message"],
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    blurb: "What points are worth, deposit VAT, the marketplace cut and buyer-funded tasks. Withdrawals, ads and referral pay live on their own pages — linked below.",
    sections: [
      {
        id: "points",
        title: "Points & cash",
        blurb: "How earned points turn into money.",
        keys: ["points_per_usd", "points_convert_threshold", "currency"],
      },
      {
        id: "deposits",
        title: "Deposits & VAT",
        keys: ["vat_enabled", "vat_pct", "bkash.usdToBdtRate"],
        links: [PAYMENT_METHODS_CARD],
      },
      {
        id: "plans",
        title: "Plans",
        blurb: "Paid plan renewals.",
        keys: ["plans.auto_renew_enabled"],
      },
      {
        id: "marketplace-fee",
        title: "Marketplace",
        keys: ["marketplace.fee_percent"],
        links: [
          {
            label: "Commission overrides, boosts & dispute fee",
            href: "/admin/marketplace/settings",
            linkLabel: "Marketplace settings",
            why: "Per-asset-type and per-listing commission that beat the fee above, promotion pricing and the dispute mediation fee.",
            keys: ["marketplace.fee_percent"],
          },
        ],
      },
      {
        id: "buyer",
        title: "Buyer-funded tasks",
        blurb: "A buyer funds a task from bought task credit: nothing is taken up front, and each approved completion charges the buyer for itself, plus the platform fee. A task stops being shown the moment the buyer can no longer cover one more completion. Who may create tasks at all is a per-user grant (Users → features), not a switch here.",
        keys: [
          "buyer.enabled",
          "buyer.fee_percent",
          "buyer.min_points_per_task",
          "buyer.max_points_per_task",
          "buyer.max_active_tasks",
          "buyer.max_completions",
          "buyer.min_purchase_points",
          "buyer.max_purchase_points",
          "buyer.allowed_task_types",
          "buyer.allowed_platforms",
          "buyer.require_kyc",
          "buyer.auto_approve_tasks",
        ],
      },
      {
        id: "money-elsewhere",
        title: "Money settings on other pages",
        blurb: "Edited where the thing they configure lives. Same settings, same values.",
        keys: [],
        links: [
          WITHDRAWAL_CARD,
          {
            label: "Referral commission %",
            href: "/admin/referrals?tab=commission",
            linkLabel: "Referrals page",
            why: "Commission is per level and there can be up to 10 of them, so it lives in its own table — a few boxes here could never describe it.",
            keys: ["referral.commission_sources"],
          },
          {
            label: "Task reward multiplier",
            href: "/admin/packages",
            linkLabel: "Packages page",
            why: "The multiplier is a property of the user's package, not one global number — that is what task approval actually reads.",
          },
          {
            label: "Default cost per click (ads)",
            href: "/admin/ads?tab=placements",
            linkLabel: "Ad Manager → Ad Spaces",
            why: "The global click price is edited beside the per-space prices that override it.",
            keys: ["ads.cpcUsd"],
          },
          {
            label: "Invoice details",
            href: "/admin/monetization",
            linkLabel: "Monetization page",
            why: "Your business name, address and VAT/BIN number printed on advertiser invoices and receipts.",
          },
        ],
      },
    ],
  },
  {
    id: "users",
    label: "Users & sign-up",
    blurb: "What it takes to sign in, and what a user must complete before they can earn.",
    sections: [
      {
        id: "signin",
        title: "Sign-in & passwords",
        keys: ["ui.require_email_verification", "password_min_length", "require_strong_passwords"],
      },
      {
        id: "profile-gate",
        title: "Profile completion gate",
        blurb: "Lock earning features until a user's profile is complete enough.",
        keys: [
          "ui.require_profile_completion",
          "profile_gate.mode",
          "profile_gate.min_percent",
          "profile_gate.features",
        ],
      },
      {
        id: "users-elsewhere",
        title: "Verification & referrals",
        keys: [],
        links: [
          KYC_CARD,
          {
            label: "Require KYC for withdrawals",
            href: WITHDRAWALS_HOME.href,
            linkLabel: "Withdrawals page",
            why: "One switch, kept with the other withdrawal rules.",
            keys: ["ui.require_kyc_for_withdrawal"],
          },
          {
            label: "Referral limits & bonuses",
            href: "/admin/referrals?tab=limits",
            linkLabel: "Referrals page",
            why: "Max referrals per user, the new-referral notification, and the signup / milestone bonuses paid to referrers.",
            keys: ["max_referrals_per_user", "notify_referral", "referral_bonus_config"],
          },
        ],
      },
    ],
  },
  {
    id: "email",
    label: "Email",
    blurb: "The mail server, who mail is from, and how much may be sent.",
    sections: [
      {
        id: "smtp",
        title: "Mail server (SMTP)",
        blurb: "Save first, then send a test — the test uses what is saved.",
        keys: ["smtp_host", "smtp_port", "smtp_username", "smtp_password"],
        widgets: ["email-test"],
      },
      {
        id: "sender",
        title: "Sender",
        keys: ["email_from_address", "email_from_name", "email_reply_to", "email_test_recipient"],
      },
      {
        id: "sending",
        title: "Sending & limits",
        keys: ["email_notifications_enabled", "email_daily_cap", "email_per_minute"],
        links: [
          {
            label: "Broadcasts",
            href: "/admin/notifications/broadcasts",
            linkLabel: "Broadcasts page",
            why: "Compose and schedule notification + email broadcasts. They obey the daily and per-minute caps above.",
          },
        ],
      },
      {
        id: "deliverability",
        title: "Deliverability",
        blurb: "Whether your sending domain's SPF, DKIM and DMARC records are in place.",
        keys: [],
        widgets: ["email-deliverability"],
      },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    blurb: "Push, which events notify users automatically, and celebration popups.",
    sections: [
      {
        id: "push",
        title: "Push",
        keys: ["push_notifications_enabled"],
      },
      {
        id: "auto-notify",
        title: "Automatic notifications",
        blurb: "Off means the email and push are not sent. The in-app notification is still recorded either way — muting a channel should not erase the record of what happened to a user.",
        keys: ["notify_new_task", "notify_withdrawal", "notify_level_up"],
        links: [
          {
            label: "New referral",
            href: "/admin/referrals?tab=limits",
            linkLabel: "Referrals page",
            why: "Kept with the other referral settings.",
            keys: ["notify_referral"],
          },
        ],
      },
      {
        id: "celebrations",
        title: "Celebrations",
        keys: ["celebrate.achievement_min_points"],
      },
      {
        id: "notifications-elsewhere",
        title: "Messages on other pages",
        keys: [],
        links: [
          {
            label: "Broadcasts",
            href: "/admin/notifications/broadcasts",
            linkLabel: "Broadcasts page",
            why: "One-off and scheduled messages to a chosen audience, by notification and email.",
          },
          {
            label: "Site popups & banners",
            href: "/admin/popups",
            linkLabel: "Popups page",
            why: "Announcement popups and banners, who sees them and how often.",
          },
        ],
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    blurb: "Unsafe links, suspicious uploads and how hard the server may be made to fetch other sites.",
    sections: [
      {
        id: "link-safety",
        title: "Link safety",
        blurb: "Checks every link users save — posts, comments, profiles, listings, tasks, ads and chat — for phishing and malware, so a bad link cannot get the site reported to its host. Links using javascript:, data: or file: are always refused. Anything flagged opens a case in the Abuse Center.",
        keys: ["security.link_policy", "security.blocked_domains"],
        widgets: ["link-safety-test"],
        links: [
          {
            label: "Google Safe Browsing key",
            href: "/admin/settings?tab=integrations&section=security-services",
            linkLabel: "Integrations → Security services",
            why: "The policy above uses it when set. API keys are kept together on the Integrations tab.",
            keys: ["security.safe_browsing_api_key"],
          },
        ],
      },
      {
        id: "uploads",
        title: "Uploads",
        keys: ["security.upload_archive_policy"],
        links: [
          {
            label: "VirusTotal key",
            href: "/admin/settings?tab=integrations&section=security-services",
            linkLabel: "Integrations → Security services",
            why: "Optional malware lookup for uploaded files, by fingerprint.",
            keys: ["security.virustotal_api_key"],
          },
        ],
      },
      {
        id: "outbound",
        title: "Outbound fetches",
        blurb: "Link previews, proof checks and thumbnails make the server fetch other websites. These caps stop the platform being used to hammer one site.",
        keys: ["security.outbound_domain_per_min", "security.outbound_user_per_hour"],
      },
      {
        id: "security-elsewhere",
        title: "Abuse, fraud & headers",
        keys: [],
        links: [
          {
            label: "Abuse Center settings",
            href: "/admin/abuse?tab=settings",
            linkLabel: "Abuse Center page",
            why: "How reported content and flagged links are handled, and the provider response.",
          },
          FRAUD_CARD,
        ],
        notes: {
          title: "Not a setting here",
          items: [
            {
              label: "Security headers (HSTS, CSP, frame guard)",
              why: "Sent by next.config.ts on every response and switched by environment variables (SECURITY_HEADERS, SECURITY_HSTS, SECURITY_FRAME_GUARD, CSP_REPORT, CSP_ENFORCE) read at start-up — see docs/SECURITY-RUNBOOK.md.",
            },
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
          ],
        },
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    blurb: "API keys and secrets for the services the platform talks to. Paste a key and Save — it takes effect immediately. A matching environment variable wins when it is set.",
    sections: [
      {
        id: "ai",
        title: "AI providers",
        blurb: "“Test” asks the provider whether the SAVED key is good using a read-only call, so it never spends generation credits.",
        keys: ["gemini_api_key", "openai_api_key", "magnific_api_key", "magnific_webhook_secret"],
      },
      {
        id: "security-services",
        title: "Security services",
        blurb: "Used by Security → Link safety and Security → Uploads.",
        keys: ["security.safe_browsing_api_key", "security.virustotal_api_key"],
      },
      {
        id: "payment-gateways",
        title: "Payment gateways",
        blurb: "Used by the bKash and SSLCommerz deposit flows. The matching environment variables win when they are set, so these are for deployments that cannot set env vars.",
        keys: [
          "bkash.appKey",
          "bkash.appSecret",
          "bkash.username",
          "bkash.password",
          "sslcommerz.storeId",
          "sslcommerz.storePasswd",
        ],
        links: [PAYMENT_METHODS_CARD],
      },
      {
        id: "bots",
        title: "Social verification bots",
        blurb: "Powers auto-verified Telegram/Discord JOIN tasks. Create a bot, add it to the target channel/server as admin, then paste the tokens here. The feature stays dormant until they are set.",
        keys: [
          "integrations.telegram_bot_token",
          "integrations.telegram_bot_username",
          "integrations.discord_client_id",
          "integrations.discord_client_secret",
          "integrations.discord_bot_token",
        ],
      },
      {
        id: "google",
        title: "Google ads",
        keys: [],
        links: [
          {
            label: "AdSense client & Ad Manager network code",
            href: "/admin/monetization",
            linkLabel: "Monetization page",
            why: "The Google ad publisher ids, the consent (CMP) and auto-ads switches, and ads.txt.",
            keys: ["ads.adsense_client"],
          },
        ],
        notes: {
          title: "Not built yet",
          items: [
            {
              label: "Google Analytics / Facebook Pixel",
              why: "No third-party tracking script is injected. Page and traffic analytics are first-party (/admin/analytics), and adding a tag also has to pass the cookie-consent gate — so it needs building, not just an ID.",
            },
          ],
        },
      },
    ],
  },
  {
    id: "appearance",
    label: "Appearance & site",
    blurb: "Theme, popups and prompts, analytics, and feature switches that apply to every user.",
    sections: [
      {
        id: "theme",
        title: "Theme",
        keys: ["ui.theme_default", "ui.theme_user_choice", "ui.accent_user_choice"],
      },
      {
        id: "prompts",
        title: "Popups & prompts",
        blurb: "Applies to every user within a minute (the values are cached server-side).",
        keys: ["ui.cookies_popup_enabled", "ui.notification_popup_enabled", "ui.pwa_install_prompt_enabled"],
      },
      {
        id: "analytics",
        title: "Analytics",
        keys: ["analytics_pageviews_enabled"],
      },
      {
        id: "appearance-elsewhere",
        title: "Site features on other pages",
        keys: [],
        links: [
          {
            label: "Groups, AI caption re-rolls, boosted posts",
            href: FEED_HOME.href,
            linkLabel: "Feed settings",
            why: "The Groups switch and the other social-feed settings.",
            keys: homedAt(FEED_HOME),
          },
          {
            label: "Navigation menus",
            href: "/admin/settings/navigation",
            linkLabel: "Navigation page",
            why: "Quick Earn tiles, the phone tab bar, header icons and the sidebar menu.",
            keys: ["nav.sidebar"],
          },
          {
            label: "Leaderboard on/off",
            href: "/admin/leaderboard",
            linkLabel: "Leaderboard page",
            why: "Off takes the board down for real — page, API and nav entry.",
            keys: ["lb_enabled"],
          },
        ],
      },
    ],
  },
  {
    id: "limits",
    label: "Limits & anti-fraud",
    blurb: "Per-user caps, task order and targeting, and how long logs are kept. Most anti-fraud switches are on the Fraud Monitor page.",
    sections: [
      {
        id: "caps",
        title: "Per-user caps",
        keys: ["max_active_listings", "ai.daily_limit_per_user"],
        links: [
          {
            label: "Max tasks per day",
            href: "/admin/packages",
            linkLabel: "Packages page",
            why: "The daily task limit is per package (Daily Task Limit), which is what the task list actually enforces.",
          },
          {
            label: "Max withdrawals per day",
            href: WITHDRAWALS_HOME.href,
            linkLabel: "Withdrawals page",
            why: "Kept with the other withdrawal limits.",
            keys: ["max_withdrawals_per_day"],
          },
          {
            label: "Max referrals per user",
            href: "/admin/referrals?tab=limits",
            linkLabel: "Referrals page",
            why: "Kept with every other referral setting.",
            keys: ["max_referrals_per_user"],
          },
          {
            label: "AI caption re-rolls per social task",
            href: FEED_HOME.href,
            linkLabel: "Feed settings",
            why: "Kept with the other social switches.",
            keys: ["social.ai_regenerate_limit"],
          },
        ],
      },
      {
        id: "task-access",
        title: "Task order & targeting",
        keys: ["tasks.sequential_unlock", "targeting.country_ip_only"],
      },
      {
        id: "retention",
        title: "Data retention",
        keys: ["retention_days"],
      },
      {
        id: "fraud",
        title: "Anti-fraud",
        keys: [],
        links: [FRAUD_CARD],
      },
    ],
  },
] as const;

/** Where a control sits on the System Settings screen. */
export interface SettingLocation {
  tab: SettingsTabId;
  section: string;
}

/** key → its tab and section. Derived from SETTINGS_TABS — never hand-kept. */
export const LOCATION_FOR_KEY: Record<string, SettingLocation> = Object.fromEntries(
  SETTINGS_TABS.flatMap((t) =>
    t.sections.flatMap((s) => s.keys.map((k) => [k, { tab: t.id, section: s.id }] as const))
  )
);

export const TAB_BY_ID = new Map(SETTINGS_TABS.map((t) => [t.id, t]));

/** "Money › Buyer-funded tasks" */
export function locationLabel(loc: SettingLocation): string {
  const t = TAB_BY_ID.get(loc.tab);
  const s = t?.sections.find((x) => x.id === loc.section);
  return [t?.label, s?.title].filter(Boolean).join(" › ");
}

/** The DOM id a section is given, so the section nav and search can scroll to it. */
export function sectionDomId(section: string): string {
  return `settings-section-${section}`;
}

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
    label: "Navigation menus",
    description:
      "What the user app's Quick Earn tiles, phone tab bar, header icons and sidebar menu link to — labels, icons and order",
    href: "/admin/settings/navigation",
    where: "Settings → Navigation",
    key: "nav.sidebar",
    status: "live",
  },
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
    href: "/admin/referrals?tab=commission",
    where: "Referrals → Commission levels",
  },
  {
    label: "Referral commission sources",
    description:
      "Which earnings pay My Team commission — each task type, CPA offers, offerwall completions. Defaults: every task type on, CPA and offerwall off",
    href: "/admin/referrals?tab=commission",
    where: "Referrals → Commission levels",
    key: "referral.commission_sources",
    status: "live",
  },
  {
    label: "CPA retry wait after a rejection",
    description: "Hours before a user whose CPA conversion was rejected may try the same offer again (0–720, default 24)",
    href: "/admin/cpa?tab=postback",
    where: "CPA Offers → Postback & rules",
    key: "cpa.retry_after_hours",
    status: "live",
  },
  {
    label: "Max Referrals Per User",
    description: "Beyond this, signups stop being attributed · 0 = no limit",
    href: "/admin/referrals?tab=limits",
    where: "Referrals → Limits",
    key: "max_referrals_per_user",
    status: "live",
  },
  {
    label: "New Referral notification",
    description: "Notify a user when someone signs up through their referral link",
    href: "/admin/referrals?tab=limits",
    where: "Referrals → Limits",
    key: "notify_referral",
    status: "live",
  },
  {
    label: "Referral bonuses & milestone ladder",
    description:
      "Signup, purchase, deposit and milestone bonuses paid to referrers — the referral_bonus_config setting",
    href: "/admin/referrals?tab=bonuses",
    where: "Referrals → Bonuses & milestones",
    key: "referral_bonus_config",
    status: "live",
  },
  {
    label: "Milestone rewards",
    description:
      "Points paid for each one-time milestone (tasks, streaks, earnings, referrals…), and which ones are switched on",
    href: "/admin/gamification?tab=milestones",
    where: "Levels & Achievements → Milestones",
    key: "milestones.rewards",
    status: "live",
  },
  {
    label: "Daily check-in & solo reward",
    description:
      "The 7-day check-in ladder, the day-7 mystery box, and the daily solo reward and what unlocks it",
    href: "/admin/gamification?tab=rewards",
    where: "Levels & Achievements → Daily & solo rewards",
    key: "daily_reward.config",
    status: "live",
  },
  {
    label: "Game earning limits",
    description:
      "The platform-wide caps every game's reward is clamped to: points per tick, tick length, daily and per-session caps, and the master switch",
    href: "/admin/games?tab=settings",
    where: "Games → Settings",
    key: "games.reward_enabled",
    status: "live",
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
    href: "/admin/settings/feed?tab=widgets",
    where: "Feed settings → Widgets",
  },
  {
    label: "Social earning rates & daily missions",
    description:
      "What a post, like, comment or share pays, and how the daily missions are configured",
    href: "/admin/settings/feed",
    where: "Feed settings → Social earning",
  },
  {
    label: "Groups, AI caption re-rolls, boosted-post cap",
    description:
      "The Groups switch, how many AI caption re-rolls a social task allows, and how often one boosted post may be shown to the same user",
    href: "/admin/settings/feed?tab=general",
    where: "Feed settings → General",
  },
  {
    label: "Boosted post — max times shown per user",
    description:
      "How many times the same boosted post may be shown to one user · 0 = unlimited",
    href: "/admin/settings/feed?tab=general",
    where: "Feed settings → General",
    key: "feed.boost_max_per_user",
    status: "live",
  },
  {
    label: "Withdrawal limits, fee & switches",
    description:
      "Min / max withdrawal, the withdrawal fee, withdrawals per day, the master switch, the subscription and KYC requirements, and the payout-time message",
    href: "/admin/withdrawals?tab=settings",
    where: "Withdrawals → Settings",
  },
  {
    label: "Payment methods (payout, deposit, currency rates)",
    description:
      "Payout method cards, deposit methods and the local currency rates shown on the deposit page. The per-method min / max / fee on the payout cards are not enforced — withdrawals use the global limits and the user's package.",
    href: "/admin/payment-methods",
    where: "Payment Methods",
  },
  {
    label: "Automatic KYC thresholds",
    description:
      "Instant (auto) KYC on/off, and the face-match and OCR confidence bars it uses before sending a case to manual review",
    href: "/admin/users/kyc?tab=settings",
    where: "KYC → Settings",
  },
  {
    label: "Anti-fraud & fraud risk",
    description:
      "Auto-approval trust, spot checks, duplicate proof, accounts per device / IP, VPN block, the task ad-blocker gate, risk points per offence and auto-suspension",
    href: "/admin/fraud?tab=settings",
    where: "Fraud Monitor → Settings",
  },
  {
    label: "Default cost per click ($)",
    description:
      "What an advertiser is billed per click on any ad space with no price of its own. Existing spend is never re-priced.",
    href: "/admin/ads?tab=placements",
    where: "Ad Manager → Ad Spaces",
    key: "ads.cpcUsd",
    status: "live",
  },
  {
    label: "Ad invalid-traffic rules (bot filtering)",
    description:
      "Which bot / invalid-traffic rules filter ad impressions and clicks, the per-viewer rate limits, the fastest believable click and how long raw measured events are kept. Filtered traffic is never counted or billed.",
    href: "/admin/ads?tab=analytics",
    where: "Ad Manager → Analytics → Measurement settings",
    key: "ads.ivt",
    status: "live",
  },
  {
    label: "Feed ad density",
    description:
      "How often a native ad, a promoted post and the under-post banner appear in the feed",
    href: "/admin/ads?tab=placements",
    where: "Ad Manager → Ad Spaces",
  },
  {
    label: "AdSense client & Ad Manager network code",
    description:
      "The publisher ids for Google ad networks, plus the consent (CMP) and auto-ads switches and ads.txt",
    href: "/admin/monetization",
    where: "Monetization",
    key: "ads.adsense_client",
    status: "live",
  },
  {
    label: "Browse & Earn",
    description:
      "The passive /watch-ads reward: on/off, points per interval, interval length and the daily cap",
    href: "/admin/monetization?tab=browse-earn",
    where: "Monetization → Browse & Earn",
    key: "ads.browse_earn_enabled",
    status: "live",
  },
  {
    label: "Course refund window, refund progress limit & tutor payout hold",
    description: "How many days after enrolling a student may ask for a refund (30 when never set), the course progress % above which a refund is refused (50 when never set; 100 = no limit), and how many days a tutor's share is held before payout (30 when never set; never shorter than the refund window)",
    href: "/admin/courses/settings",
    where: "Courses → Settings",
    key: "course_settings",
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

/**
 * Which storage category (row `category`) a key is saved under. Derived —
 * never hand-maintained. This is NOT the tab it is shown on: see
 * `LOCATION_FOR_KEY` for that.
 */
export const CATEGORY_FOR_KEY: Record<string, SettingGroupId> =
  Object.fromEntries(SETTINGS_CATALOG.map((e) => [e.key, e.group]));

const BY_KEY = new Map(SETTINGS_CATALOG.map((e) => [e.key, e]));

export function settingEntry(key: string): SettingEntry | undefined {
  return BY_KEY.get(key);
}

/** The catalog keys whose editor lives on the page at `href` (its `home`). */
export function keysHomedAt(href: string): string[] {
  return SETTINGS_CATALOG.filter((e) => e.home?.href === href).map((e) => e.key);
}

/**
 * True when the System Settings form is this key's editor. False for a key
 * that has a `home` on its feature's page — the form must neither render nor
 * save it, or there would be two editors and the one saved last would win.
 */
export function editedOnSettingsForm(key: string): boolean {
  const e = BY_KEY.get(key);
  return !!e && !e.home;
}

export const GROUP_BY_ID = new Map(SETTING_GROUPS.map((g) => [g.id, g]));

/** Storage groups in their order, each with the form-edited keys filed there. */
export function groupedSettings(): {
  group: SettingGroup;
  entries: SettingEntry[];
}[] {
  return [...SETTING_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      group,
      entries: SETTINGS_CATALOG.filter((e) => e.group === group.id && !e.home),
    }));
}

/**
 * A short human label for any key — a catalog setting or one indexed as
 * living on another screen. Used for the chips on a link card.
 */
export function keyLabel(key: string): string {
  return (
    BY_KEY.get(key)?.label ??
    SETTINGS_ELSEWHERE.find((e) => e.key === key)?.label ??
    key
  );
}

export interface SettingHit {
  label: string;
  description: string;
  key?: string;
  /** Where to go: a tab + section on this screen, or another admin page. */
  tab?: SettingsTabId;
  section?: string;
  href?: string;
  where: string;
  status?: SettingStatus;
}

/**
 * Search by name, description, key, or the tab/section it sits in.
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
    const blob = hay.join(" \u0000 ").toLowerCase();
    if (!terms.every((t) => blob.includes(t))) return 0;
    // A match in the name beats a match buried in the description.
    const name = weightLabel.toLowerCase();
    if (name.startsWith(q)) return 4;
    if (terms.every((t) => name.includes(t))) return 3;
    return 1;
  };

  const hits: (SettingHit & { _score: number })[] = [];

  for (const e of SETTINGS_CATALOG) {
    const loc = LOCATION_FOR_KEY[e.key];
    const where = e.home?.where ?? (loc ? locationLabel(loc) : GROUP_BY_ID.get(e.group)!.label);
    const s = score([e.label, e.description, e.effect ?? "", e.key, where], e.label);
    if (s)
      hits.push({
        label: e.label,
        description: e.description,
        key: e.key,
        // A key edited on its feature page is a link there, not a tab here.
        ...(e.home ? { href: e.home.href } : loc ? { tab: loc.tab, section: loc.section } : {}),
        where,
        status: e.status,
        _score: e.home ? s - 0.5 : s,
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
