import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordImpression, recordClick } from "@/lib/ad-events";

/**
 * Unified ad-engagement endpoint. The web client posts here (via the neutral
 * `/api/spaces/:id/event` rewrite) instead of the legacy `/click` + `/impression`
 * paths — neither the URL nor the body contains an ad-blocker filter token.
 *
 * Body: `{ kind: "view" | "open" }`  (view = impression, open = click).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const kind = (body as { kind?: string }).kind;

  if (kind === "view") {
    await recordImpression(id);
    return NextResponse.json({ success: true });
  }

  if (kind === "open") {
    // Only logged-in users can bill a click (ads are served to authed users).
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: true, billed: false });
    }
    const { billed } = await recordClick(id, session.user.id);
    return NextResponse.json({ success: true, billed });
  }

  return NextResponse.json({ error: "bad kind" }, { status: 400 });
}
