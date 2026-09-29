import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { saveSetting } from "@/lib/system-settings";
import { CPA_MANAGE, requireCpaAdmin } from "@/lib/cpa/admin";
import { getCpaRetryHours } from "@/lib/cpa/eligibility";
import {
  CPA_RETRY_MAX_HOURS,
  CPA_RETRY_MIN_HOURS,
  CPA_RETRY_SETTING_KEY,
} from "@/lib/cpa/retry";

// GET /api/admin/cpa/settings → { retryAfterHours }
export async function GET() {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ retryAfterHours: await getCpaRetryHours() });
}

const bodySchema = z.object({
  retryAfterHours: z
    .number()
    .int("Whole hours only")
    .min(CPA_RETRY_MIN_HOURS)
    .max(CPA_RETRY_MAX_HOURS, `At most ${CPA_RETRY_MAX_HOURS} hours (30 days)`),
});

// POST /api/admin/cpa/settings { retryAfterHours: 0–720 } — how long after a
// rejection a user may try the same offer again. Setting key
// `cpa.retry_after_hours` (default 24). Audited.
export async function POST(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const before = await getCpaRetryHours();
  const after = parsed.data.retryAfterHours;
  await saveSetting(CPA_RETRY_SETTING_KEY, after, "cpa");
  await writeAudit({
    actorId: gate.userId,
    action: "CPA_SETTINGS_UPDATED",
    entity: "SystemSetting",
    entityId: CPA_RETRY_SETTING_KEY,
    summary: `CPA retry wait after a rejection: ${before}h → ${after}h`,
    meta: { key: CPA_RETRY_SETTING_KEY, before, after },
  });
  return NextResponse.json({ retryAfterHours: after });
}
