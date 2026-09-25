/**
 * Which network a VIDEO task's clip lives on.
 *
 * The video list was one flat grid: a self-hosted clip, a YouTube watch and a
 * Facebook watch looked identical until the player opened, and each one needs
 * something different from the user (a YouTube task may want the account signed
 * in; a direct clip never does). Grouping them is the whole fix — it is derived
 * from the URL rather than stored, so old tasks classify correctly with no
 * migration and no admin re-entry.
 */
export type VideoNetwork = "YOUTUBE" | "FACEBOOK" | "TIKTOK" | "INSTAGRAM" | "VIMEO" | "DIRECT";

export const VIDEO_NETWORK_LABEL: Record<VideoNetwork, string> = {
  YOUTUBE: "YouTube",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  VIMEO: "Vimeo",
  DIRECT: "Direct video",
};

/** Display order: the big networks first, our own files last. */
export const VIDEO_NETWORK_ORDER: VideoNetwork[] = [
  "YOUTUBE",
  "FACEBOOK",
  "TIKTOK",
  "INSTAGRAM",
  "VIMEO",
  "DIRECT",
];

const HOSTS: { network: VideoNetwork; match: RegExp }[] = [
  { network: "YOUTUBE", match: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i },
  { network: "FACEBOOK", match: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i },
  { network: "TIKTOK", match: /(^|\.)tiktok\.com$/i },
  { network: "INSTAGRAM", match: /(^|\.)instagram\.com$/i },
  { network: "VIMEO", match: /(^|\.)vimeo\.com$/i },
];

/**
 * Anything that is not a recognised network is DIRECT — a file we serve.
 *
 * Deliberately permissive: a URL that cannot be parsed, or one on a host nobody
 * has added yet, still lands in a real group and stays visible. Dropping it
 * would hide a task the admin created and paid for.
 */
export function videoNetworkOf(url: string | null | undefined): VideoNetwork {
  if (!url) return "DIRECT";
  try {
    const host = new URL(url, "https://placeholder.invalid").hostname;
    for (const h of HOSTS) if (h.match.test(host)) return h.network;
  } catch {
    /* falls through to DIRECT */
  }
  return "DIRECT";
}
