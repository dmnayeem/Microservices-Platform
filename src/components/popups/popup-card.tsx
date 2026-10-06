"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import { OFFER_RICHTEXT_CLASS } from "@/lib/offers";
import type { PopupSize, PopupVideo, PopupView } from "@/lib/popups";

/**
 * One site popup, drawn the same way on the live site (PopupHost) and in the
 * admin preview. Responsive by construction: a centred card that is never
 * wider than the screen, scrolls inside itself when the content is tall, and
 * keeps the close button in the top-right corner at every size.
 */

const SIZE_CLASS: Record<PopupSize, string> = {
  SMALL: "max-w-sm",
  MEDIUM: "max-w-md sm:max-w-lg",
  LARGE: "max-w-lg sm:max-w-2xl",
  FULL: "max-w-none sm:max-w-5xl h-full sm:h-[92dvh]",
};

const isExternal = (url: string | null) => !!url && /^https?:\/\//i.test(url);

function CtaLink({
  href,
  children,
  onClick,
  primary,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  const cls = cn(
    "inline-flex min-h-11 grow basis-40 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-transform active:scale-[0.98]",
    primary
      ? "app-accent shadow-lg shadow-black/20"
      : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
  );
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={cls}>
      {children}
    </Link>
  );
}

function VideoPlayer({ videos }: { videos: PopupVideo[] }) {
  const [i, setI] = useState(0);
  const v = videos[Math.min(i, videos.length - 1)];
  if (!v) return null;
  return (
    <div className="bg-black">
      <div className="relative aspect-video w-full">
        {v.kind === "embed" ? (
          <iframe
            key={v.src}
            src={v.src}
            title="Video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <video key={v.src} src={v.src} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain">
            <source src={v.src} type={v.mime} />
          </video>
        )}
      </div>
      {videos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
          {videos.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setI(n)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                n === i ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              <Play className="h-3 w-3" /> Video {n + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HtmlFrame({ code, height, title }: { code: string; height: number; title: string }) {
  // Sandboxed: the admin's code (an ad network snippet, a form) runs, but it
  // has an opaque origin — no access to the site, its cookies or the session.
  const doc =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_blank"><style>:root{color-scheme:normal}html,body{margin:0;padding:0;background:transparent;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    "img,video,iframe{max-width:100%;height:auto}</style></head><body>" +
    code +
    "</body></html>";
  return (
    <iframe
      title={title}
      srcDoc={doc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
      className="block w-full border-0 bg-transparent"
      // Same colour scheme inside and out, or the browser paints the frame
      // opaque white (a white band under shorter ad code on the dark card).
      style={{ height, colorScheme: "normal" }}
    />
  );
}

export function PopupCard({
  popup: p,
  onClose,
  onCta,
  inline = false,
  closeRef,
}: {
  popup: PopupView;
  onClose: () => void;
  onCta?: () => void;
  /** Admin preview: draw in place, no fixed backdrop over the page. */
  inline?: boolean;
  closeRef?: React.Ref<HTMLButtonElement>;
}) {
  const imageOnly = p.kind === "IMAGE" && !p.body;
  const hasText = !imageOnly && (p.kind !== "HTML" || !!p.body) && (!!p.title || !!p.body);
  const cta = () => {
    onCta?.();
    onClose();
  };
  const buttons = !imageOnly && ((p.ctaUrl && p.ctaLabel) || (p.cta2Url && p.cta2Label));

  const card = (
    <div
      role="dialog"
      aria-modal={inline ? undefined : true}
      aria-label={p.title}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "animate-pop-in relative flex w-full flex-col overflow-hidden border border-white/10 bg-slate-900 text-white shadow-2xl",
        p.size === "FULL" ? "rounded-none sm:rounded-3xl" : "rounded-3xl",
        inline ? "max-h-full" : p.size === "FULL" ? "max-h-dvh" : "max-h-[88dvh]",
        SIZE_CLASS[p.size]
      )}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute right-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/75",
          p.size === "FULL" && !inline ? "top-[max(0.75rem,env(safe-area-inset-top))]" : "top-3"
        )}
      >
        <X className="h-4.5 w-4.5" />
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Media */}
        {p.kind === "VIDEO" && p.videos.length > 0 && <VideoPlayer videos={p.videos} />}
        {p.kind === "HTML" && p.htmlCode && <HtmlFrame code={p.htmlCode} height={p.htmlHeight} title={p.title} />}
        {p.imageUrl &&
          p.kind !== "VIDEO" &&
          p.kind !== "HTML" &&
          (imageOnly && p.ctaUrl ? (
            // An image popup is one big button when it has a link.
            isExternal(p.ctaUrl) ? (
              <a href={p.ctaUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={cta} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaSrc(p.imageUrl)} alt={p.title} className="block max-h-[78dvh] w-full bg-black object-contain" />
              </a>
            ) : (
              <Link href={p.ctaUrl} onClick={cta} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaSrc(p.imageUrl)} alt={p.title} className="block max-h-[78dvh] w-full bg-black object-contain" />
              </Link>
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc(p.imageUrl)}
              alt={imageOnly ? p.title : ""}
              className={cn("block w-full bg-black", imageOnly ? "max-h-[78dvh] object-contain" : "max-h-80 object-cover")}
            />
          ))}

        {/* Text */}
        {hasText && (
          <div className="px-5 pb-2 pt-5 sm:px-6">
            {p.kind === "AD" && (
              <span className="mb-2 inline-block rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Sponsored
              </span>
            )}
            {p.title && <h2 className="pr-10 text-lg font-extrabold leading-snug sm:text-xl">{p.title}</h2>}
            {p.body && (
              <div
                className={cn(OFFER_RICHTEXT_CLASS, "mt-2 text-sm leading-relaxed text-slate-200")}
                // Sanitised on the server (lib/rich-html.ts) before it is sent.
                dangerouslySetInnerHTML={{ __html: p.body }}
              />
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      {buttons ? (
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-4 sm:px-6">
          {p.ctaUrl && p.ctaLabel && (
            <CtaLink href={p.ctaUrl} onClick={cta} primary>
              {p.ctaLabel} <ArrowRight className="h-4 w-4" />
            </CtaLink>
          )}
          {p.cta2Url && p.cta2Label && (
            <CtaLink href={p.cta2Url} onClick={cta}>
              {p.cta2Label}
            </CtaLink>
          )}
        </div>
      ) : (
        !imageOnly && hasText && <div className="h-4" />
      )}
    </div>
  );

  if (inline) return card;
  return (
    <div
      className={cn(
        "fixed inset-0 z-[65] flex items-center justify-center bg-black/65 backdrop-blur-sm",
        p.size === "FULL" ? "p-0 sm:p-4" : "p-3 sm:p-6"
      )}
      onClick={onClose}
    >
      {card}
    </div>
  );
}
