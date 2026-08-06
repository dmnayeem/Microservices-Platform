import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  SPLASH_SETTING_KEY,
  normalizeSplashConfig,
} from "@/lib/splash";
import { invalidateSettingsCache } from "@/lib/system-settings";

/** Admin: read the current splash config (merged over defaults). */
export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "banners.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await prisma.systemSetting.findUnique({
    where: { key: SPLASH_SETTING_KEY },
  });
  return NextResponse.json({ config: normalizeSplashConfig(row?.value) });
}

/** Admin: save the splash config. */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "banners.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const cfg = normalizeSplashConfig(body);
  const value = JSON.parse(JSON.stringify(cfg));
  await prisma.systemSetting.upsert({
    where: { key: SPLASH_SETTING_KEY },
    create: { key: SPLASH_SETTING_KEY, value, category: "splash", description: null },
    update: { value, category: "splash" },
  });
  invalidateSettingsCache();
  return NextResponse.json({ success: true, config: cfg });
}
