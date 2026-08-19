// Client-safe review vocabulary shared by the admin reject/request-changes form
// and the advertiser's "why was my ad not approved" panel. NO server imports.

export interface AdRejectionReason {
  code: string;
  /** Shown to the reviewer in the picker. */
  label: string;
  /** Shown to the advertiser — says what to fix, not just what is wrong. */
  advertiserText: string;
}

export const AD_REJECTION_REASONS: AdRejectionReason[] = [
  {
    code: "PROHIBITED_CONTENT",
    label: "Prohibited content",
    advertiserText:
      "The creative promotes content we don't allow (adult, gambling, drugs, weapons or similar). Replace the creative and destination with an allowed offer.",
  },
  {
    code: "MISLEADING_CLAIM",
    label: "Misleading or unverifiable claim",
    advertiserText:
      "The ad makes a claim we can't verify. Remove guarantees and exaggerated numbers, or add proof on the landing page.",
  },
  {
    code: "SCAM_OR_FRAUD",
    label: "Scam / financial fraud",
    advertiserText:
      "This looks like a scam or a fraudulent money offer. We don't allow these ads on the platform.",
  },
  {
    code: "LANDING_BROKEN",
    label: "Landing page broken or unreachable",
    advertiserText:
      "The destination URL didn't load. Check the link and submit again once it works.",
  },
  {
    code: "LANDING_MISMATCH",
    label: "Landing page doesn't match the ad",
    advertiserText:
      "The landing page doesn't deliver what the ad promises. Point the ad at a page that matches its message.",
  },
  {
    code: "DECEPTIVE_CTA",
    label: "Deceptive CTA / clickbait",
    advertiserText:
      "The button or headline tricks people into clicking. Use a CTA that describes what actually happens next.",
  },
  {
    code: "LOW_QUALITY_CREATIVE",
    label: "Low-quality or illegible creative",
    advertiserText:
      "The image or copy is blurry, cropped or hard to read. Upload a sharper creative at the right size.",
  },
  {
    code: "TRADEMARK",
    label: "Trademark / copyright misuse",
    advertiserText:
      "The creative uses a brand, logo or content you don't appear to own. Use your own assets or provide authorization.",
  },
  {
    code: "PROHIBITED_TARGETING",
    label: "Prohibited targeting",
    advertiserText:
      "The audience selection isn't allowed for this kind of offer. Widen or adjust the targeting and resubmit.",
  },
  {
    code: "INVALID_DESTINATION",
    label: "Missing or invalid destination URL",
    advertiserText:
      "The destination URL is missing or malformed. Add a valid https:// link and resubmit.",
  },
  {
    code: "OTHER",
    label: "Other (explain below)",
    advertiserText: "",
  },
];

const BY_CODE = new Map(AD_REJECTION_REASONS.map((r) => [r.code, r]));

export function reasonLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}

/**
 * The advertiser-facing text for a decision: the reviewer's own message first
 * (it is specific), then the canned guidance for each selected code.
 */
export function buildAdvertiserReason(
  codes: string[] | null | undefined,
  message?: string | null
): string {
  const parts: string[] = [];
  if (message?.trim()) parts.push(message.trim());
  for (const c of codes ?? []) {
    const text = BY_CODE.get(c)?.advertiserText;
    if (text) parts.push(text);
  }
  return parts.join("\n\n") || "This ad was not approved.";
}
