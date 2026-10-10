import type { FirstTouch } from "@/lib/signup-source-shared";

/**
 * Turn a visitor's first outside touch (lib/signup-source-shared.ts) into the
 * source shown in the admin: Google, Facebook, WhatsApp… Runs on the server,
 * so the browser only ever reports raw facts and the naming lives in one place.
 *
 * Order: a utm_source (the owner's own tagged links) beats everything; then a
 * click id (Google Ads / Facebook); then the referrer's site; then an invite
 * link; otherwise "direct" (typed, bookmarked, or an app that sends nothing —
 * WhatsApp/Telegram/Messenger links usually land here, which is why tagging
 * them with utm_source is worth it).
 */

export interface SignupSource {
  source: string;
  medium: string;
  campaign: string | null;
  referrer: string | null;
  landing: string | null;
}

/** Display names for the stored source keys. */
export const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  bing: "Bing",
  yahoo: "Yahoo",
  duckduckgo: "DuckDuckGo",
  yandex: "Yandex",
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  pinterest: "Pinterest",
  imo: "imo",
  gmail: "Gmail",
  email: "Email",
  invite: "Invite link",
  other: "Other website",
  direct: "Direct / unknown app",
  unknown: "Joined before tracking",
};

export function sourceLabel(key: string | null | undefined): string {
  if (!key) return SOURCE_LABEL.unknown;
  return SOURCE_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

// utm_source spellings people actually use → one key.
const UTM_ALIASES: Record<string, string> = {
  fb: "facebook",
  "facebook.com": "facebook",
  meta: "facebook",
  ig: "instagram",
  insta: "instagram",
  yt: "youtube",
  wa: "whatsapp",
  "whats-app": "whatsapp",
  tg: "telegram",
  twitter: "x",
  tw: "x",
  "x.com": "x",
  tt: "tiktok",
  li: "linkedin",
  msgr: "messenger",
  newsletter: "email",
  mail: "email",
};

// Referrer host (or app id) → source + medium. First match wins.
const HOST_RULES: [RegExp, string, string][] = [
  [/^com\.google\.android\.gm$|(^|\.)mail\.google\.com$/, "gmail", "email"],
  [/(^|\.)bing\.com$/, "bing", "organic"],
  [/(^|\.)yahoo\.[a-z.]+$/, "yahoo", "organic"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo", "organic"],
  [/(^|\.)yandex\.[a-z.]+$/, "yandex", "organic"],
  [/(^|\.)messenger\.com$|^com\.facebook\.orca$/, "messenger", "social"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$|^com\.facebook\.(katana|lite)$/, "facebook", "social"],
  [/(^|\.)instagram\.com$|^com\.instagram\.android$/, "instagram", "social"],
  [/(^|\.)(whatsapp\.com|wa\.me)$|^com\.whatsapp(\.w4b)?$/, "whatsapp", "social"],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$|^org\.telegram\.messenger$/, "telegram", "social"],
  [/(^|\.)(youtube\.com|youtu\.be)$|^com\.google\.android\.youtube$/, "youtube", "social"],
  [/(^|\.)tiktok\.com$|^com\.(zhiliaoapp\.musically|ss\.android\.ugc\.trill)$/, "tiktok", "social"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$|^com\.twitter\.android$/, "x", "social"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$|^com\.linkedin\.android$/, "linkedin", "social"],
  [/(^|\.)reddit\.com$|^com\.reddit\.frontpage$/, "reddit", "social"],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, "pinterest", "social"],
  [/(^|\.)imo\.im$|^com\.imo\.android\.imoim$/, "imo", "social"],
  // Last: Android app ids (com.google.android.gm, …youtube) contain "google" too.
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, "google", "organic"],
];

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/[\u0000-\u001f]/g, "");
  return t ? t.slice(0, max) : null;
};

/** Host of a referrer, or the app id of an android-app:// referrer. */
function referrerKey(ref: string): string | null {
  try {
    const u = new URL(ref);
    if (u.protocol === "android-app:") return u.host.toLowerCase();
    return u.host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function classifyTouch(raw: Partial<FirstTouch> | null | undefined): SignupSource {
  const t = raw ?? {};
  const referrer = clean(t.referrer, 300);
  const refHost = referrer ? referrerKey(referrer) : null;
  const landing = clean(t.landing, 200);
  const campaign = clean(t.utmCampaign, 120);
  const utmSource = clean(t.utmSource, 80)?.toLowerCase().replace(/\s+/g, "-") ?? null;
  const utmMedium = clean(t.utmMedium, 80)?.toLowerCase() ?? null;

  if (utmSource) {
    const source = UTM_ALIASES[utmSource] ?? utmSource.replace(/[^a-z0-9._-]/g, "").slice(0, 40) ?? "other";
    return { source: source || "other", medium: utmMedium ?? "link", campaign, referrer: refHost, landing };
  }
  if (t.gclid) return { source: "google", medium: "paid", campaign, referrer: refHost, landing };
  if (refHost) {
    for (const [re, source, medium] of HOST_RULES) {
      if (re.test(refHost)) return { source, medium, campaign, referrer: refHost, landing };
    }
  }
  // fbclid rides on every link opened from Facebook, Instagram and Messenger,
  // including in-app browsers that send no referrer.
  if (t.fbclid) return { source: "facebook", medium: "social", campaign, referrer: refHost, landing };
  if (refHost) return { source: "other", medium: "referral", campaign, referrer: refHost, landing };
  if (t.refLink) return { source: "invite", medium: "referral", campaign, referrer: null, landing };
  return { source: "direct", medium: "none", campaign, referrer: null, landing };
}
