import "server-only";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_SETTING_KEY_PREFIX,
  isSectionKey,
  type LandingContent,
  type SectionKey,
} from "@/lib/landing-content";

/**
 * Reads all SystemSetting rows under category=landing and merges their
 * values onto DEFAULT_LANDING_CONTENT. Unknown keys are ignored. Missing
 * keys fall back to defaults.
 *
 * Server-only — keeps prisma out of the client bundle.
 */
export async function getLandingContent(): Promise<LandingContent> {
  const merged: LandingContent = structuredClone(DEFAULT_LANDING_CONTENT);
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { category: "landing" },
      // Landing/marketing pages read this on every render; changes are rare and
      // admin edits already call invalidateSettingsCache — cache at the edge.
      cacheStrategy: { ttl: 60, swr: 120 },
    });
    for (const row of rows) {
      if (!row.key.startsWith(LANDING_SETTING_KEY_PREFIX)) continue;
      const section = row.key.slice(LANDING_SETTING_KEY_PREFIX.length);
      if (!isSectionKey(section)) continue;
      const v = row.value;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        // Shallow merge so partial saves don't wipe added defaults from later
        // releases (e.g. a new field on hero).
        const next = { ...merged[section], ...(v as object) };
        (merged as Record<SectionKey, unknown>)[section] = next;
      }
    }
  } catch {
    // DB unreachable at build / preview time — fall back to defaults.
  }
  return merged;
}
