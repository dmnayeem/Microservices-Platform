import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serveFeedAds } from "@/lib/ad-serve";

// GET /api/ads/feed?count=N&exclude=id1,id2  (reached via the neutral
// `/api/feed/inline` rewrite). Returns up to N native (post-like) ads for the
// social feed, targeted to the viewer, excluding already-seen ids (rotation).
// Selection + shaping live in `serveFeedAds` (shared with the feed SSR inject).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get("count") || "8", 10);
  const exclude = (searchParams.get("exclude") ?? "").split(",").filter(Boolean);

  const session = await auth();
  const ads = await serveFeedAds({
    userId: session?.user?.id ?? null,
    count,
    exclude,
  });
  return NextResponse.json({ ads });
}
