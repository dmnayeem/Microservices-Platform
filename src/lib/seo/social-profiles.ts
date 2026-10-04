/**
 * RevType's official social profiles.
 *
 * ONE list, used everywhere the brand names its profiles: the Organization
 * JSON-LD `sameAs` (what Google's Knowledge Panel ties the entity together
 * with), the site footer, and llms.txt. /admin/seo → "Social profiles"
 * (`seo.org_same_as`) overrides it; while that field is empty these are used.
 *
 * Client-safe: no server imports.
 */
export const OFFICIAL_SOCIAL_PROFILES = [
  "https://www.facebook.com/revtype",
  "https://www.instagram.com/revtype_official/",
  "https://x.com/revtypeofficial",
  "https://www.youtube.com/@revtype_official",
  "https://www.threads.com/@revtype_official",
] as const;

/** The X handle the profiles above use (twitter:site), without "@". */
export const OFFICIAL_X_HANDLE = "revtypeofficial";

const HOSTS: Array<{ key: string; label: string; hosts: string[] }> = [
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "threads", label: "Threads", hosts: ["threads.com", "threads.net"] },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { key: "pinterest", label: "Pinterest", hosts: ["pinterest.com"] },
  { key: "telegram", label: "Telegram", hosts: ["t.me", "telegram.me"] },
  { key: "discord", label: "Discord", hosts: ["discord.gg", "discord.com"] },
  { key: "reddit", label: "Reddit", hosts: ["reddit.com"] },
  { key: "medium", label: "Medium", hosts: ["medium.com"] },
  { key: "quora", label: "Quora", hosts: ["quora.com"] },
  { key: "whatsapp", label: "WhatsApp", hosts: ["whatsapp.com", "wa.me"] },
];

/** Which platform a profile URL is on, for its icon and its accessible name. */
export function socialProfileOf(url: string): { key: string; label: string } | null {
  let host = "";
  try {
    host = new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const hit = HOSTS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return hit ? { key: hit.key, label: hit.label } : null;
}
