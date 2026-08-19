"use client";

import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Runs an ad's HTML in a sandboxed `<iframe srcDoc>` so injected `<script>`
 * actually executes (a composed AdSense/GAM document or any network snippet) —
 * `dangerouslySetInnerHTML` never runs scripts. Shared by every surface (banner,
 * interstitial, watch-&-earn) so network ads behave identically everywhere.
 * Optionally fires a third-party impression pixel.
 */
export function SandboxedAdFrame({
  html,
  height = 250,
  className,
  impressionPixel,
  badge = true,
  allowSameOrigin = false,
}: {
  html: string;
  height?: number;
  className?: string;
  impressionPixel?: string | null;
  badge?: boolean;
  /**
   * `allow-scripts` + `allow-same-origin` together CANCEL the sandbox: the frame
   * shares this app's origin, so its script can read cookies and call same-origin
   * APIs with the viewer's session. Default off. Only an `ads.manage` admin can
   * turn it on per ad, for a network snippet that genuinely needs it — advertiser
   * creatives can never reach this flag.
   */
  allowSameOrigin?: boolean;
}) {
  const sandbox = allowSameOrigin
    ? "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    : "allow-scripts allow-popups allow-popups-to-escape-sandbox";
  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden border border-white/10 bg-gray-900 mx-auto",
        className
      )}
    >
      {badge && (
        <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] font-bold uppercase tracking-wider text-white/90">
          <Megaphone className="w-2.5 h-2.5" />
          Sponsored
        </span>
      )}
      <iframe
        title="Embedded content"
        srcDoc={html}
        sandbox={sandbox}
        className="block w-full border-0"
        style={{ height }}
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
  );
}
