/**
 * App-install task — admin pastes a Play Store / App Store link (metadata is
 * auto-fetched, then editable); the user installs the app, follows steps and
 * submits a proof screenshot; admin approves → "download counted". Client-safe
 * (no server imports) so both the admin builder and user page can import it.
 */

/** Is this an app or a game? Drives proof-requirement presets + wording. */
export type AppInstallKind = "app" | "game";

/** A single configurable proof requirement the user must satisfy. */
export type ProofItemKind = "INSTALL" | "LEVEL" | "DAYS" | "PLAYTIME" | "CUSTOM";

export interface AppInstallProofItem {
  /** Stable key (e.g. "pi_1"). */
  id: string;
  kind: ProofItemKind;
  /** What the user sees (preset per kind, admin-editable). */
  label: string;
  /** Target for LEVEL (level) / DAYS (days) / PLAYTIME (minutes). */
  target?: number;
  /** Require a screenshot for this item. */
  screenshot: boolean;
  /** If set, the user also types a value (e.g. "Level reached"). */
  valueLabel?: string;
}

export interface AppInstallConfig {
  /** Google Play link (https://play.google.com/store/apps/details?id=…). */
  playStoreUrl?: string;
  /** Apple App Store link (https://apps.apple.com/…/id123…). */
  appStoreUrl?: string;
  /** Display name of the app. */
  appName: string;
  /** App icon/logo URL (auto-fetched or uploaded). */
  appLogo?: string;
  /** Short description of the app. */
  description?: string;
  /** App or game — affects wording + which proof presets are suggested. */
  appKind?: AppInstallKind;
  /** Ordered install/verify instructions shown to the user (free text). */
  steps?: string[];
  /**
   * Structured proof requirements. When present, the user submits one proof
   * (screenshot and/or typed value) per item. Absent = legacy single screenshot.
   */
  proofItems?: AppInstallProofItem[];
  /** Auto-approve on screenshot submit (else queued for admin review). */
  autoApprove?: boolean;
}

/** Default label + whether a typed value is asked, for a given proof kind. */
export function proofItemPreset(
  kind: ProofItemKind,
  target?: number
): { label: string; valueLabel?: string } {
  switch (kind) {
    case "INSTALL":
      return { label: "Screenshot of the app open on your device" };
    case "LEVEL":
      return {
        label: `Reach level ${target ?? "X"} and screenshot it`,
        valueLabel: "Level reached",
      };
    case "DAYS":
      return {
        label: `Open the app on ${target ?? "N"} different days — screenshot your streak/usage`,
      };
    case "PLAYTIME":
      return {
        label: `Play for ${target ?? "N"} minutes — screenshot your playtime`,
      };
    case "CUSTOM":
    default:
      return { label: "" };
  }
}

/** The default requirement for a task with none configured (== legacy behavior). */
export function defaultProofItems(): AppInstallProofItem[] {
  return [
    {
      id: "install",
      kind: "INSTALL",
      label: proofItemPreset("INSTALL").label,
      screenshot: true,
    },
  ];
}

/** True if a value looks like a supported store URL. */
export function isStoreUrl(url: string): boolean {
  return /play\.google\.com\/store\/apps\/details|apps\.apple\.com|itunes\.apple\.com/i.test(
    url
  );
}

/** Which store a URL belongs to (or null). */
export function detectStore(url: string): "play" | "apple" | null {
  if (/play\.google\.com\/store\/apps\/details/i.test(url)) return "play";
  if (/apps\.apple\.com|itunes\.apple\.com/i.test(url)) return "apple";
  return null;
}

const PROOF_KINDS: ProofItemKind[] = [
  "INSTALL",
  "LEVEL",
  "DAYS",
  "PLAYTIME",
  "CUSTOM",
];

/** Validate an admin-authored config. Returns an error string or null. */
export function validateAppInstallConfig(c: unknown): string | null {
  if (!c || typeof c !== "object") return "App-install config is required.";
  const cfg = c as AppInstallConfig;
  if (!cfg.appName || !cfg.appName.trim()) return "App name is required.";
  if (!cfg.playStoreUrl && !cfg.appStoreUrl)
    return "Add at least one store link (Play Store or App Store).";
  for (const u of [cfg.playStoreUrl, cfg.appStoreUrl]) {
    if (u && !/^https?:\/\//i.test(u)) return "Store links must be full URLs.";
  }
  if (Array.isArray(cfg.proofItems)) {
    for (const it of cfg.proofItems) {
      if (!it || typeof it !== "object") return "Invalid proof requirement.";
      if (!PROOF_KINDS.includes(it.kind))
        return "Unknown proof requirement type.";
      if (!it.label || !String(it.label).trim())
        return "Each proof requirement needs a label.";
      if (
        (it.kind === "LEVEL" || it.kind === "DAYS" || it.kind === "PLAYTIME") &&
        (!Number.isFinite(Number(it.target)) || Number(it.target) <= 0)
      ) {
        return "Level / days / playtime requirements need a positive target.";
      }
      if (it.screenshot === false && !it.valueLabel?.trim()) {
        return "A proof requirement must ask for a screenshot and/or a typed value.";
      }
    }
  }
  return null;
}

/** Clean a raw config into the stored shape (trim, clamp steps, drop blanks). */
export function normalizeAppInstallConfig(c: AppInstallConfig): AppInstallConfig {
  const rawItems = Array.isArray(c.proofItems) ? c.proofItems : undefined;
  const proofItems = rawItems
    ?.filter((it) => it && PROOF_KINDS.includes(it.kind) && it.label?.trim())
    .slice(0, 10)
    .map((it, i) => {
      const target =
        it.kind === "LEVEL" || it.kind === "DAYS" || it.kind === "PLAYTIME"
          ? Math.max(1, Math.round(Number(it.target) || 1))
          : undefined;
      const valueLabel = it.valueLabel?.trim() || undefined;
      return {
        id: it.id?.trim() || `pi_${i + 1}`,
        kind: it.kind,
        label: it.label.trim(),
        target,
        // Fall back to requiring a screenshot when nothing else is asked.
        screenshot: it.screenshot !== false || !valueLabel,
        valueLabel,
      } as AppInstallProofItem;
    });

  return {
    playStoreUrl: c.playStoreUrl?.trim() || undefined,
    appStoreUrl: c.appStoreUrl?.trim() || undefined,
    appName: c.appName.trim(),
    appLogo: c.appLogo?.trim() || undefined,
    description: c.description?.trim() || undefined,
    appKind: c.appKind === "game" ? "game" : "app",
    steps: (c.steps ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 15),
    proofItems: proofItems && proofItems.length ? proofItems : undefined,
    autoApprove: !!c.autoApprove,
  };
}

/** True when any proof item asks for a typed value or a target (needs a human). */
export function hasRichProof(cfg: AppInstallConfig | null | undefined): boolean {
  return !!cfg?.proofItems?.some((it) => it.valueLabel || it.target);
}

/** The proof items to show/enforce (falls back to the legacy single screenshot). */
export function effectiveProofItems(
  cfg: AppInstallConfig | null | undefined
): AppInstallProofItem[] {
  return cfg?.proofItems && cfg.proofItems.length
    ? cfg.proofItems
    : defaultProofItems();
}

/** Safely read a stored `appInstallConfig` JSON into the typed shape. */
export function parseAppInstallConfig(v: unknown): AppInstallConfig | null {
  if (!v || typeof v !== "object") return null;
  const c = v as AppInstallConfig;
  if (!c.appName) return null;
  return c;
}
