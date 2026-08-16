import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getEffectivePackage } from "@/lib/packages";
import {
  parsePageRules,
  parsePageOverrides,
  computeHiddenPaths,
  type PageVisibilityRules,
} from "@/lib/page-visibility";

const RULES_KEY = "page_visibility.rules";

/** The persisted package/role rules (admin-editable matrix). Fail-safe: empty. */
export async function getPageVisibilityRules(): Promise<PageVisibilityRules> {
  try {
    const raw = await getSetting<unknown>(RULES_KEY, null);
    return parsePageRules(raw);
  } catch {
    return parsePageRules(null);
  }
}

/**
 * The set of hidden user-facing paths for a user. Combines package + role rules
 * with the user's per-user overrides. Fail-safe: on any error nothing is hidden
 * (never lock a user out of the whole app because of a settings blip).
 */
export async function getHiddenPaths(userId: string): Promise<string[]> {
  try {
    const [rules, user, pkg] = await Promise.all([
      getPageVisibilityRules(),
      prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, pageOverrides: true },
      }),
      getEffectivePackage(userId).catch(() => null),
    ]);
    if (!user) return [];
    return computeHiddenPaths(
      rules,
      pkg?.slug ?? null,
      user.role ?? null,
      parsePageOverrides(user.pageOverrides)
    );
  } catch {
    return [];
  }
}
