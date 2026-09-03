import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getMediationConfig, saveMediationConfig } from "@/lib/marketplace-mediation";
import { z } from "zod";

// GET /api/admin/marketplace/mediation
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ config: await getMediationConfig() });
}

const schema = z.object({
  enabled: z.boolean(),
  feeBps: z.number().int().min(0).max(10000),
});

// PATCH /api/admin/marketplace/mediation
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await saveMediationConfig({ enabled: v.data.enabled, feeBps: v.data.feeBps });
  // No target user: this is a platform-wide setting. It still belongs in the
  // feed — it changes the fee taken out of every mediated deal.
  await writeAudit({
    actorId: session.user.id,
    action: "MARKETPLACE_MEDIATION_CONFIG",
    entity: "SystemSetting",
    entityId: "marketplace.mediation",
    summary: `Mediation ${v.data.enabled ? "on" : "off"}, fee ${(v.data.feeBps / 100).toFixed(2)}%`,
    meta: { enabled: v.data.enabled, feeBps: v.data.feeBps },
  });
  return NextResponse.json({ config: { enabled: v.data.enabled, feeBps: v.data.feeBps } });
}
