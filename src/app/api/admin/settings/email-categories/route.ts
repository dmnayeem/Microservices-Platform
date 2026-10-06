import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import {
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_GROUP_LABELS,
  EMAIL_CATEGORY_SETTING,
  getEmailCategoryState,
  type EmailCategoryDef,
} from "@/lib/email-categories";

/** GET / PUT which automatic emails are sent — SystemSetting `email.auto_categories`. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "settings.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const state = await getEmailCategoryState();
  return NextResponse.json({
    canEdit: await can(session.user.id, "settings.edit"),
    groups: EMAIL_CATEGORY_GROUP_LABELS,
    categories: (EMAIL_CATEGORIES as readonly EmailCategoryDef[]).map((c) => ({
      key: c.key,
      label: c.label,
      description: c.description,
      group: c.group,
      locked: !!c.locked,
      on: state[c.key as keyof typeof state],
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send { categoryKey: true|false }." }, { status: 400 });
  }
  const before = await getEmailCategoryState();
  // Only switchable categories are stored; locked ones are always on and a
  // value sent for them is ignored.
  const next: Record<string, boolean> = {};
  for (const c of EMAIL_CATEGORIES as readonly EmailCategoryDef[]) {
    if (c.locked) continue;
    const v = body[c.key];
    next[c.key] = typeof v === "boolean" ? v : before[c.key as keyof typeof before];
  }
  await saveSetting(EMAIL_CATEGORY_SETTING, next, "email");

  const changed = Object.keys(next).filter((k) => next[k] !== before[k as keyof typeof before]);
  if (changed.length) {
    await writeAudit({
      actorId: session.user.id,
      action: "EMAIL_CATEGORIES_UPDATE",
      entity: "SystemSetting",
      entityId: EMAIL_CATEGORY_SETTING,
      summary: `Email switches: ${changed.map((k) => `${k} ${next[k] ? "on" : "off"}`).join(", ")}`,
      meta: { before, after: next },
    });
  }
  return NextResponse.json({ ok: true, changed });
}
