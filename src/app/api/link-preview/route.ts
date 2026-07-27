import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetchLinkPreview } from "@/lib/link-preview";

// GET /api/link-preview?url=<encoded>
// Lazy OpenGraph preview for feed posts created before link-preview capture
// (or whose capture failed). Auth-gated + rate-limited; SSRF-guarded + cached
// inside fetchLinkPreview. Returns { preview: LinkPreview | null }.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(request, "link-preview", 30, 60_000);
  if (limited) return limited;

  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const preview = await fetchLinkPreview(url);
  return NextResponse.json({ preview });
}
