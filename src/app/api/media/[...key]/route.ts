import { NextResponse } from "next/server";
import { getObjectStream, isS3Configured } from "@/lib/s3";

/**
 * First-party media proxy. Our S3 bucket is private and CloudFront has no read
 * access, so the public `https://<cloudfront>/media/…` URLs 403 → every avatar /
 * image renders blank. This route reads the object with the server's IAM
 * credentials (which CAN read the bucket) and streams it same-origin.
 *
 * Security: only PUBLIC prefixes are served — the same objects that were already
 * exposed via unguessable public CloudFront URLs. Private prefixes (`kyc/`,
 * `deliver/`, …) use presigned URLs and are explicitly rejected here, so this
 * open endpoint can never leak them.
 *
 * `posts/` holds feed post images, which are shown to every viewer of the feed
 * and were already public by URL. They were missing from this list, so a post
 * photo had no working path at all: the stored S3 URL 403s because the bucket is
 * private, and the proxy refused the key.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: segments } = await params;
  const key = (segments ?? []).map(decodeURIComponent).join("/");

  // Only public prefixes (admin media, user proof screenshots, feed post
  // images); block traversal and any non-public prefix (kyc/, deliver/, …).
  //
  // Keep in step with `ownMediaKey()` in src/lib/media-url.ts — that decides
  // which URLs get rewritten to point here, and this decides which are served.
  // A prefix in one and not the other is a broken image or an open door.
  const isPublic =
    key.startsWith("media/") ||
    key.startsWith("task-proofs/") ||
    key.startsWith("posts/");
  if (!isPublic || key.includes("..")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!isS3Configured()) {
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }

  try {
    const { body, contentType, contentLength } = await getObjectStream(key);
    if (!body) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const webStream = (
      body as { transformToWebStream: () => ReadableStream }
    ).transformToWebStream();

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      // Keys are unique per upload → the bytes never change: cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (contentLength != null) headers["Content-Length"] = String(contentLength);

    return new NextResponse(webStream, { status: 200, headers });
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    // Missing object → 404; anything else (incl. AccessDenied) → 404 too so we
    // don't leak whether a key exists.
    if (name === "NoSuchKey" || name === "NotFound") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("media proxy error:", key, name || e);
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
}
