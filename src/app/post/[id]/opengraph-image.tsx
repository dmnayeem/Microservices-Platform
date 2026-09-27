import { ImageResponse } from "next/og";
import { getPublicPost, postSummary } from "@/lib/public-post";

/**
 * The generated share card, for posts with no image of their own.
 *
 * Most posts on the feed are text — and a text post shared to WhatsApp or
 * Facebook with no `og:image` unfurls as a grey stub that nobody clicks. This
 * renders the post's own words onto a card instead.
 *
 * `generateMetadata` in page.tsx sets `openGraph.images` only when the post
 * HAS a picture; when it leaves that key undefined, Next's file convention
 * points `og:image` here. So exactly one of the two ever wins, and the post's
 * real photo always beats the generated card.
 *
 * The private-post rule applies here as hard as it does on the page: a post the
 * gate refuses renders a generic card with NO post content on it. An unfurler
 * that leaked the first 180 characters of a private post would be the same leak
 * as the page itself, just harder to notice.
 */

export const alt = "Post on RevType";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPublicPost(id);

  const body = post ? postSummary(post.content, 220) : "";
  const author = post ? post.author.name : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1e1b4b 0%, #030712 55%, #111827 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800 }}>
          <span>Earn</span>
          <span style={{ color: "#818cf8" }}>GPT</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: body.length > 120 ? 46 : 58,
            lineHeight: 1.25,
            fontWeight: 700,
            maxWidth: 1000,
          }}
        >
          {body || "Join the RevType community"}
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#cbd5e1" }}>
          {author ? `${author} · revtype.com` : "revtype.com"}
        </div>
      </div>
    ),
    size
  );
}
