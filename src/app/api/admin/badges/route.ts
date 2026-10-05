import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { getBadgeConfig } from "@/lib/badges-server";
import { BADGE_CONFIG_SETTING, sanitizeBadgeConfig } from "@/lib/badges";
import { usd } from "@/lib/utils";

// The blue badge shop's prices and which styles are on sale. Money, so it
// sits with Packages (packages.view / packages.edit — finance permissions).

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "packages.view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ config: await getBadgeConfig() });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "packages.edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const before = await getBadgeConfig();
  const config = sanitizeBadgeConfig(await req.json().catch(() => null));
  await saveSetting(BADGE_CONFIG_SETTING, config, "badges");
  await writeAudit({
    actorId: session.user.id,
    action: "UPDATE",
    entity: "Setting",
    entityId: BADGE_CONFIG_SETTING,
    summary: `Blue badge shop ${config.enabled ? "open" : "closed"}, badge ${usd(config.badgePriceUsd)}/month`,
    meta: { before, after: config },
  });
  return NextResponse.json({ config });
}
