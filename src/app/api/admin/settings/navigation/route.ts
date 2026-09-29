import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import {
  NAV_KEYS,
  NAV_SETTING_KEYS,
  navSettingProblems,
  normalizeBottomTabs,
  normalizeHeader,
  normalizeSidebar,
} from "@/lib/nav-config";
import { normalizeQuickEarn } from "@/lib/feed-quick-earn";

/**
 * Save ONE navigation menu (Settings → Navigation). One key per request so a
 * tab's Save can never overwrite a menu edited on another tab.
 *
 * The value is checked (`navSettingProblems`) and rejected with every problem
 * listed, then normalised before it is stored, so what is saved is exactly
 * what the app will render.
 */
const CATEGORY: Record<string, string> = {
  [NAV_KEYS.quickEarn]: "feed",
  [NAV_KEYS.bottomTabs]: "navigation",
  [NAV_KEYS.header]: "navigation",
  [NAV_KEYS.sidebar]: "navigation",
};

function normalize(key: string, value: unknown): unknown {
  switch (key) {
    case NAV_KEYS.quickEarn:
      return normalizeQuickEarn(value);
    case NAV_KEYS.bottomTabs:
      return normalizeBottomTabs(value);
    case NAV_KEYS.header:
      return normalizeHeader(value);
    default:
      return normalizeSidebar(value);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    value?: unknown;
  } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  if (!NAV_SETTING_KEYS.includes(key)) {
    return NextResponse.json({ error: "Unknown navigation setting" }, { status: 400 });
  }

  const problems = navSettingProblems(key, body?.value);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  }

  const value = normalize(key, body?.value);
  await saveSetting(key, value, CATEGORY[key]);

  await writeAudit({
    actorId: session.user.id,
    action: "NAVIGATION_SETTINGS_UPDATED",
    entity: "SystemSetting",
    entityId: key,
    summary: `Changed the ${key} menu`,
    meta: { key, value },
  });

  return NextResponse.json({ success: true, value });
}
