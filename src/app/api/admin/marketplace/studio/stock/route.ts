import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { searchStock, isMagnificConfigured, type StockKind } from "@/lib/magnific";

/**
 * Search the Magnific (ex-Freepik) stock library from the Stock Studio.
 *
 * Search is free; only `/download` consumes the plan's quota, so browsing here
 * costs nothing and the import step is where the admin spends.
 *
 * The upstream rows are normalised to the handful of fields the picker renders
 * — passing the raw payload through would ship a few hundred KB of licence
 * blocks and format variants per page for no gain.
 */
export const runtime = "nodejs";

const KINDS: StockKind[] = ["resources", "icons", "videos"];

type RawRow = {
  id?: number | string;
  title?: string;
  name?: string;
  url?: string;
  thumbnails?: { url?: string; width?: number }[];
  image?: { source?: { url?: string } };
  preview?: { url?: string };
  licenses?: { type?: string }[];
};

function thumbOf(row: RawRow): string {
  if (Array.isArray(row.thumbnails) && row.thumbnails.length) {
    // Icons return several sizes; take the largest for a crisp picker tile.
    const best = [...row.thumbnails].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    if (best?.url) return best.url;
  }
  return row.image?.source?.url ?? row.preview?.url ?? "";
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isMagnificConfigured())) {
    return NextResponse.json(
      { error: "MAGNIFIC_API_KEY is not set — add it in Settings → Integrations" },
      { status: 503 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const term = (sp.get("term") ?? "").trim();
  const kind = (sp.get("kind") ?? "resources") as StockKind;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

  if (!term) return NextResponse.json({ error: "Type something to search for" }, { status: 400 });
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown library" }, { status: 400 });
  }

  const res = await searchStock(kind, term, { page, perPage: 24 });
  if (!res.success) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 502 });
  }

  const rows = (Array.isArray(res.data) ? res.data : []) as RawRow[];
  return NextResponse.json({
    kind,
    page,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title ?? r.name ?? `#${r.id}`,
      thumbnail: thumbOf(r),
      sourceUrl: r.url ?? "",
      license: r.licenses?.[0]?.type ?? null,
    })),
  });
}
