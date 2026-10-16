import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { isBotRequest } from "@/lib/bot-detect";
import { chargeBoostEvent } from "@/lib/boost/core";
import { boostWasServed, loadBoostViewer } from "@/lib/boost-feed";

/**
 * POST /api/boost/event { campaignId, kind } — a sponsored post in the feed was
 * shown (IMPRESSION), on screen ≥50% for ≥1s (VIEW) or opened (CLICK).
 *
 * Only these three come from the browser. LIKE / COMMENT / SHARE are charged
 * by their own routes after the action really happened (lib/boost-feed.ts),
 * so a script cannot bill them without doing them.
 *
 * The boost owner pays per event, so the gates are strict: signed in, active
 * account, not a bot UA, rate-limited, and the feed must actually have served
 * this boost to this viewer (PostBoostView). chargeBoostEvent then dedupes per
 * viewer and refuses the owner's own activity.
 */
const CLIENT_KINDS = new Set(["IMPRESSION", "VIEW", "CLICK"] as const);
type ClientKind = "IMPRESSION" | "VIEW" | "CLICK";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A long scroll fires a few events per sponsored post; 120/min is far above
  // a human and well below a loop.
  const limited = await enforceDbRateLimit(request, "boost-event", userId, 120, 60_000);
  if (limited) return limited;

  let body: { campaignId?: unknown; kind?: unknown };
  try {
    // sendBeacon posts text/plain, so read the text and parse it ourselves.
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId.slice(0, 64) : "";
  const kind = body.kind as ClientKind;
  if (!campaignId || !CLIENT_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  if (await isBotRequest()) return NextResponse.json({ result: "not_charged" });

  const campaign = await prisma.boostCampaign.findUnique({
    where: { id: campaignId },
    select: { postId: true, status: true, startsAt: true },
  });
  if (!campaign?.postId || campaign.status !== "ACTIVE") return NextResponse.json({ result: "inactive" });

  const [viewer, served] = await Promise.all([
    loadBoostViewer(userId, false),
    boostWasServed(userId, campaign.postId, campaign.startsAt),
  ]);
  if (!viewer || viewer.status === "BANNED" || viewer.status === "SUSPENDED") {
    return NextResponse.json({ result: "not_charged" });
  }
  if (!served) return NextResponse.json({ result: "not_charged" });

  try {
    const result = await chargeBoostEvent({ campaignId, viewerId: userId, kind, country: viewer.country ?? null });
    return NextResponse.json({ result });
  } catch (e) {
    console.error("boost event failed:", e);
    return NextResponse.json({ error: "Failed to record the event" }, { status: 500 });
  }
}
