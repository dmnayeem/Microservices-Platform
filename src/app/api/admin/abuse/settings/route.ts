import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { saveSetting } from "@/lib/system-settings";
import { abuseAccess } from "@/lib/abuse/access";
import { getAbuseSettings } from "@/lib/abuse/settings";
import { ABUSE_SETTING_KEYS } from "@/lib/abuse/policy";

export async function GET() {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.view) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ settings: await getAbuseSettings() });
}

const schema = z.object({
  email: z.string().trim().email().max(200).optional(),
  autoHideOnCritical: z.boolean().optional(),
  autoSuspendOnCritical: z.boolean().optional(),
  notifyAdmins: z.boolean().optional(),
});

// POST /api/admin/abuse/settings — fraud.manage / users.edit (the center's manage right).
export async function POST(req: NextRequest) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const v = schema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const before = await getAbuseSettings();
  const d = v.data;
  for (const k of Object.keys(ABUSE_SETTING_KEYS) as Array<keyof typeof ABUSE_SETTING_KEYS>) {
    if (d[k] === undefined) continue;
    await saveSetting(ABUSE_SETTING_KEYS[k], d[k], "security");
  }
  await writeAudit({
    actorId: a.userId,
    action: "ABUSE_SETTINGS_UPDATED",
    entity: "SystemSetting",
    summary: "Changed Abuse Center settings",
    meta: { before, changes: d },
  });
  return NextResponse.json({ ok: true, settings: await getAbuseSettings() });
}
