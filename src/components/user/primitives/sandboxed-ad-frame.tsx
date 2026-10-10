"use client";

import { AD_FILL_MESSAGE_KEY, AD_FILL_PROBE, AD_FILL_TIMEOUT_MS } from "@/lib/ad-networks/fill-probe";
import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Runs an HTML ad (a network snippet or direct-sold HTML) in a sandboxed frame,
 * so its `<script>` executes — `dangerouslySetInnerHTML` never runs scripts.
 * Shared by every surface (banner, interstitial, admin preview).
 *
 * Two modes:
 *
 *  - **`frameUrl` (separate ad origin).** When `AD_FRAME_ORIGIN` is configured
 *    the server hands over a URL on that origin (`/api/ads/frame/[id]`), and
 *    the frame gets `allow-same-origin` — which grants the ad ITS origin
 *    (ads.revtype.com), not ours. Network code that needs cookies or storage
 *    works there.
 *  - **`srcDoc` (fallback).** Opaque origin, NO `allow-same-origin`, ever. A
 *    srcDoc frame with `allow-scripts` + `allow-same-origin` IS the app's
 *    origin, so the ad's script could read storage and call our APIs with the
 *    viewer's session. The old per-ad `allowSameOrigin` escape hatch did
 *    exactly that; it is now ignored here.
 *
 * Sizing: the frame is laid out at the creative's own pixel size and scaled
 * DOWN (never up) to fit a narrower column, so a 728×90 unit on a phone shrinks
 * instead of being clipped. The box reserves the scaled height up front — no
 * layout shift when the creative arrives.
 *
 * The "Sponsored" label sits OUTSIDE the frame. Painted over the creative it
 * covered part of a third-party unit, which networks treat as obstructing
 * their ad (and which hid their own AdChoices mark).
 */
export function SandboxedAdFrame({
  html,
  frameUrl,
  width,
  height = 250,
  className,
  impressionPixel,
  badge = true,
  onFill,
}: {
  html?: string;
  /** Frame document on the separate ad origin; preferred over `html` when set. */
  frameUrl?: string;
  /** Creative pixel width. Omitted = fill the column (responsive / native widget). */
  width?: number;
  height?: number;
  className?: string;
  impressionPixel?: string | null;
  badge?: boolean;
  /** Called once with whether the network drew anything (lib/ad-networks/fill-probe.ts). */
  onFill?: (filled: boolean) => void;
  /**
   * @deprecated Ignored. Same-origin access is granted only to frames served
   * from AD_FRAME_ORIGIN (see above), never to a srcDoc frame.
   */
  allowSameOrigin?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [scale, setScale] = useState(1);
  // "pending" → "1" (filled) / "0" (empty). The viewability tracker counts an
  // impression only on "1" (ad-measure-client.ts). If the probe never answers
  // (blocked, odd tag), treat it as filled after a grace period — the old
  // behaviour — so impressions are never under-counted.
  const [fill, setFill] = useState<"pending" | "1" | "0">("pending");
  const onFillRef = useRef(onFill);
  useEffect(() => {
    onFillRef.current = onFill;
  }, [onFill]);
  useEffect(() => {
    let done = false;
    const finish = (filled: boolean) => {
      if (done) return;
      done = true;
      setFill(filled ? "1" : "0");
      onFillRef.current?.(filled);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object" || d[AD_FILL_MESSAGE_KEY] !== 1) return;
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      finish(d.filled === true);
    };
    window.addEventListener("message", onMsg);
    const grace = setTimeout(() => finish(true), AD_FILL_TIMEOUT_MS + 4000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(grace);
    };
  }, [frameUrl, html]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !width || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / width));
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(el);
    return () => obs.disconnect();
  }, [width]);

  const sandbox = frameUrl
    ? "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-forms"
    : "allow-scripts allow-popups allow-popups-to-escape-sandbox";

  return (
    <div className={cn("mx-auto w-full", className)} style={width ? { maxWidth: width } : undefined}>
      {badge && (
        <div className="mb-1 flex justify-end">
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-(--app-ink-3)">
            <Megaphone className="w-2.5 h-2.5" />
            Sponsored
          </span>
        </div>
      )}
      <div
        ref={hostRef}
        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-(--app-surface)"
        style={{ height: Math.round(height * scale) }}
        data-ad-filled={fill}
      >
        <iframe
          ref={frameRef}
          title="Advertisement"
          src={frameUrl}
          srcDoc={frameUrl ? undefined : html ? html + AD_FILL_PROBE : html}
          sandbox={sandbox}
          referrerPolicy="strict-origin-when-cross-origin"
          className="block border-0"
          style={{
            width: width ?? "100%",
            height,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
          }}
        />
        {impressionPixel ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={impressionPixel}
            alt=""
            width={1}
            height={1}
            className="absolute bottom-0 right-0 opacity-0 pointer-events-none"
          />
        ) : null}
      </div>
    </div>
  );
}
