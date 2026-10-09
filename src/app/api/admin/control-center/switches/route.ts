import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { saveSetting } from "@/lib/system-settings";
import { invalidateUiTogglesCache } from "@/lib/ui-toggles-server";
import { invalidateSocialEarningCache } from "@/lib/social-earning";
import { validateSettingValues } from "@/lib/setting-guards";
import { loadFeatureSwitches, switchEntry, unwrapSetting } from "@/lib/control-center-switches";

// Control Center → Feature switches. Super admin only (DB role, not the JWT's).
// Reads and writes the SAME SystemSetting rows the settings form and feature
// pages use — this is a second door to them, not a second store.

async function requireSuper() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Only a super admin can do this" }, { status: 403 }) };
  }
  return { actorId: session.user.id };
}

export async function GET() {
  const g = await requireSuper();
  if ("error" in g) return g.error;
  return NextResponse.json({ switches: await loadFeatureSwitches() });
}

const schema = z.object({ key: z.string().min(1).max(200), value: z.boolean() });

export async function PATCH(request: NextRequest) {
  const g = await requireSuper();
  if ("error" in g) return g.error;
  const v = schema.safeParse(await request.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { key, value } = v.data;

  const found = await switchEntry(key);
  if (!found) {
    return NextResponse.json({ error: "Not an on/off setting" }, { status: 400 });
  }
  const rejections = validateSettingValues({ [key]: value });
  if (rejections.length > 0) {
    return NextResponse.json({ error: rejections[0].message }, { status: 400 });
  }

  // Keep the row's existing shape: some readers take the raw value, some
  // unwrap `{ v }`; switching the shape under them would silently flip them.
  const wrapped =
    !!found.stored && typeof found.stored === "object" && !Array.isArray(found.stored) && "v" in (found.stored as object);
  let before: unknown = found.stored === undefined ? null : unwrapSetting(found.stored);
  if (found.jsonField) {
    // A field inside a JSON config (referral bonuses, affiliate): change that
    // one field and keep every other setting in the object as it is.
    const obj =
      before && typeof before === "object" && !Array.isArray(before) ? (before as Record<string, unknown>) : {};
    before = obj[found.jsonField] ?? null;
    await saveSetting(key, { ...obj, [found.jsonField]: value }, found.entry.group);
  } else {
    await saveSetting(key, wrapped ? { v: value } : value, found.entry.group);
  }
  invalidateUiTogglesCache();
  if (key.startsWith("social_earning.")) invalidateSocialEarningCache();

  await writeAudit({
    actorId: g.actorId,
    action: "CONTROL_CENTER_SWITCH",
    entity: "SystemSetting",
    entityId: key,
    summary: `Turned ${found.entry.label} ${value ? "on" : "off"} (Control Center)`,
    meta: { key, before, after: value },
  });

  return NextResponse.json({ ok: true, key, value });
}
