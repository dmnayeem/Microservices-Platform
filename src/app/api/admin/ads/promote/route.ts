import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  promotableItems,
  setItemPromo,
  refreshPromos,
  summarisePromos,
} from "@/lib/house-promos";
import { z } from "zod";

/**
 * Advertise the platform's own listings and courses.
 *
 * A promo is an ordinary house ad, so everything downstream — serving,
 * frequency caps, impression and click counting, the ad reports — is the code
 * that already runs paid inventory. Nothing here is a second ad system.
 */
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ items: await promotableItems() });
}

const schema = z.object({
  kind: z.enum(["LISTING", "COURSE"]),
  id: z.string().min(1).max(64),
  // Empty means "stop advertising this", which is what unticking every box on
  // the admin screen means.
  placements: z.array(z.string().min(1).max(60)).max(36),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  // `refresh` re-reads every promoted item and rewrites its creative, and stops
  // the ones that have since sold or been unpublished.
  if (body?.refresh === true) {
    const res = await refreshPromos();
    await writeAudit({
      actorId: session.user.id,
      action: "ADS_PROMO_REFRESH",
      entity: "Ad",
      summary: `Refreshed platform promos — ${summarisePromos(res)}`,
      meta: res,
    });
    return NextResponse.json({ ...res, message: summarisePromos(res) });
  }

  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }

  try {
    const res = await setItemPromo(v.data.kind, v.data.id, v.data.placements);
    await writeAudit({
      actorId: session.user.id,
      action: v.data.placements.length ? "ADS_PROMO_SET" : "ADS_PROMO_STOP",
      entity: "Ad",
      entityId: v.data.id,
      summary: v.data.placements.length
        ? `Promoted ${v.data.kind.toLowerCase()} in ${v.data.placements.length} placement(s) — ${summarisePromos(res)}`
        : `Stopped promoting ${v.data.kind.toLowerCase()} — ${summarisePromos(res)}`,
      meta: { ...v.data, ...res },
    });
    return NextResponse.json({ ...res, message: summarisePromos(res) });
  } catch (e) {
    // loadItem throws a sentence written for the admin, not a stack trace.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the promo" },
      { status: 400 }
    );
  }
}
