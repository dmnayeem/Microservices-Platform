import { getSetting } from "@/lib/system-settings";
import {
  NAV_KEYS,
  normalizeBottomTabs,
  normalizeHeader,
  normalizeSidebar,
  DEFAULT_BOTTOM_TABS,
  DEFAULT_HEADER,
  DEFAULT_SIDEBAR,
  type BottomTab,
  type HeaderConfig,
  type SidebarConfig,
} from "@/lib/nav-config";

export interface AppNavConfig {
  bottomTabs: BottomTab[];
  header: HeaderConfig;
  sidebar: SidebarConfig;
}

export const DEFAULT_APP_NAV: AppNavConfig = {
  bottomTabs: DEFAULT_BOTTOM_TABS,
  header: DEFAULT_HEADER,
  sidebar: DEFAULT_SIDEBAR,
};

/**
 * The shell's three admin-editable menus. Read in parallel through
 * `getSetting`'s per-key cache (~45s in memory, then the Accelerate edge), so
 * on a warm instance this costs no database round-trip at all. Never throws:
 * `getSetting` falls back on error and each normaliser falls back on a
 * malformed row.
 */
export async function getAppNavConfig(): Promise<AppNavConfig> {
  const [tabs, header, sidebar] = await Promise.all([
    getSetting<unknown>(NAV_KEYS.bottomTabs, null),
    getSetting<unknown>(NAV_KEYS.header, null),
    getSetting<unknown>(NAV_KEYS.sidebar, null),
  ]);
  return {
    bottomTabs: normalizeBottomTabs(tabs),
    header: normalizeHeader(header),
    sidebar: normalizeSidebar(sidebar),
  };
}
