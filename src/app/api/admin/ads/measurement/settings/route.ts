import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import {
  IVT_DEFAULTS,
  IVT_RULES,
  IVT_RULE_LABELS,
  IVT_SETTING_KEY,
  getIvtSettings,
  normalizeIvtSettings,
} from "@/lib/ad-ivt";

/** GET / PUT the ad invalid-traffic (IVT) rules — SystemSetting `ads.ivt`. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    settings: await getIvtSettings(),
    defaults: IVT_DEFAULTS,
    rules: IVT_RULES.map((id) => ({ id, label: IVT_RULE_LABELS[id] })),
    canEdit: await can(session.user.id, "ads.manage"),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const before = await getIvtSettings();
  const next = normalizeIvtSettings(body);
  await saveSetting(IVT_SETTING_KEY, next, "general");
  await writeAudit({
    actorId: session.user.id,
    action: "ADS_IVT_SETTINGS_UPDATE",
    entity: "SystemSetting",
    entityId: IVT_SETTING_KEY,
    summary: "Changed ad invalid-traffic rules",
    meta: { before, after: next },
  });
  return NextResponse.json({ settings: next });
}
