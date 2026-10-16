import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import {
  APPLICATION_REQUIREMENTS_KEY,
  PROGRAMS,
  PROGRAM_KEYS,
  normalizeRequirementsConfig,
} from "@/lib/application-requirements";
import { getRequirementsConfig } from "@/lib/application-requirements-server";

/**
 * GET — the per-program requirements (creators.review may read them).
 * PUT — `{ config }`: save them (settings.edit).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "creators.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ config: await getRequirementsConfig() });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "settings.edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { config?: unknown };
  if (!body.config || typeof body.config !== "object") {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  const before = await getRequirementsConfig();
  const cfg = normalizeRequirementsConfig(body.config);
  await saveSetting(APPLICATION_REQUIREMENTS_KEY, cfg, "applications");
  const changed = PROGRAM_KEYS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(cfg[k]));
  await writeAudit({
    actorId: session.user.id,
    action: "APPLICATION_REQUIREMENTS_SET",
    entity: "SystemSetting",
    entityId: APPLICATION_REQUIREMENTS_KEY,
    summary: changed.length
      ? `Application requirements changed: ${changed.map((k) => PROGRAMS[k].label).join(", ")}`
      : "Application requirements saved (no change)",
    meta: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, cfg[k]])) },
  });
  return NextResponse.json({ ok: true, config: cfg });
}
