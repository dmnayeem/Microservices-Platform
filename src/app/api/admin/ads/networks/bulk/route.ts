import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { adNetworkOf } from "@/lib/ad-serve";
import { adminSetStatus } from "@/lib/ad-review";

/**
 * Pause or resume every ad of one network — POST { network, status }.
 * Each ad goes through `adminSetStatus`, the one writer of `Ad.status`, so
 * every change is audited and a never-approved ad is not switched on.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const network = typeof body?.network === "string" ? body.network : "";
  const status = body?.status === "ACTIVE" || body?.status === "PAUSED" ? body.status : null;
  if (!network || !status) return NextResponse.json({ error: "network and status are required" }, { status: 400 });

  const from = status === "PAUSED" ? "ACTIVE" : "PAUSED";
  const candidates = await prisma.ad.findMany({
    where: { status: from },
    select: { id: true, type: true, networkId: true },
  });
  const targets = candidates.filter((a) => adNetworkOf(a) === network);

  let changed = 0;
  let skipped = 0;
  for (const a of targets) {
    try {
      await adminSetStatus({ adId: a.id, actorId: session.user.id, status });
      changed++;
    } catch {
      skipped++; // e.g. never approved — it stays as it is
    }
  }
  return NextResponse.json({ changed, skipped, total: targets.length });
}
