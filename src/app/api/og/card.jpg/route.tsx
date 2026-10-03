import { ImageResponse } from "next/og";
import { OG_HEIGHT, OG_KICKER_MAX, OG_TITLE_MAX, OG_WIDTH, ogVerify } from "@/lib/seo/og-image";
import { jpegResponse, memGet, memSet, toOgJpeg, OG_CACHE_HEADERS } from "@/lib/seo/og-render";

/**
 * The branded share card: the page's own title on the RevType background.
 *
 * Only text our metadata signed is rendered (see lib/seo/og-image.ts) — an
 * unsigned title is refused, so nobody can mint an image that says anything
 * they like on revtype.com. With no title at all it renders the plain brand
 * card. Public in middleware (`/api/og/`), no database, no session.
 */

export const runtime = "nodejs";

const BG = "linear-gradient(135deg, #052e22 0%, #06140f 55%, #0b1220 100%)";

function card(title: string, kicker: string) {
  const size = title.length > 70 ? 54 : title.length > 40 ? 64 : 76;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: BG,
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
        <div
          style={{
            display: "flex",
            width: 56,
            height: 56,
            borderRadius: 14,
            marginRight: 18,
            alignItems: "center",
            justifyContent: "center",
            background: "#10b981",
            color: "#04261b",
            fontSize: 34,
          }}
        >
          R
        </div>
        <span>Rev</span>
        <span style={{ color: "#34d399" }}>Type</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {kicker ? (
          <div style={{ display: "flex", fontSize: 30, color: "#6ee7b7", fontWeight: 600, marginBottom: 18 }}>
            {kicker}
          </div>
        ) : null}
        <div style={{ display: "flex", fontSize: size, lineHeight: 1.15, fontWeight: 800, maxWidth: 1040 }}>
          {title || "Micro-tasks, a digital marketplace and online courses"}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, color: "#a7f3d0" }}>
        <span>revtype.com</span>
        <div style={{ display: "flex", width: 160, height: 8, borderRadius: 4, background: "#10b981" }} />
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const t = (q.get("t") || "").slice(0, OG_TITLE_MAX);
  const k = (q.get("k") || "").slice(0, OG_KICKER_MAX);
  if ((t || k) && !ogVerify(`${t}\n${k}`, q.get("sig"))) {
    return new Response("not found", { status: 404 });
  }

  const cacheKey = `card:${t}\n${k}`;
  const hit = memGet(cacheKey);
  if (hit) return jpegResponse(hit, true);

  const png = Buffer.from(await new ImageResponse(card(t, k), { width: OG_WIDTH, height: OG_HEIGHT }).arrayBuffer());
  const jpeg = await toOgJpeg(png, "fill");
  if (!jpeg) {
    // No sharp in this runtime: the PNG is still a valid 1200×630 card.
    return new Response(new Uint8Array(png), {
      headers: { ...OG_CACHE_HEADERS, "Content-Type": "image/png", "Content-Length": String(png.length) },
    });
  }
  memSet(cacheKey, jpeg);
  return jpegResponse(jpeg, false);
}
