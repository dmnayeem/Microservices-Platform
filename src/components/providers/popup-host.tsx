"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, ArrowRight } from "lucide-react";
import { mediaSrc } from "@/lib/media-url";
import { OFFER_RICHTEXT_CLASS } from "@/lib/offers";
import { isPopupQuietPath, type PopupView } from "@/lib/popups";

/**
 * Site popups from /admin/popups. The server decides who may see which popup
 * on which page (api/popups); this decides whether THIS device has already
 * seen it often enough, then shows at most one per page, after its delay.
 */

const seenKey = (p: PopupView) => `rt-popup:${p.id}:${p.version}`;

function read(store: Storage | undefined, k: string): string | null {
  try {
    return store?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function write(store: Storage | undefined, k: string, v: string) {
  try {
    store?.setItem(k, v);
  } catch {
    /* private mode / quota — the popup may simply show again */
  }
}

const today = () => new Date().toLocaleDateString("en-CA");

function due(p: PopupView): boolean {
  if (typeof window === "undefined") return false;
  const k = seenKey(p);
  switch (p.frequency) {
    case "ONCE":
      return !read(window.localStorage, k);
    case "DAILY":
      return read(window.localStorage, k) !== today();
    case "SESSION":
      return !read(window.sessionStorage, k);
    default:
      return true;
  }
}

function markSeen(p: PopupView) {
  const k = seenKey(p);
  if (p.frequency === "SESSION") write(window.sessionStorage, k, "1");
  else write(window.localStorage, k, p.frequency === "DAILY" ? today() : "1");
}

function track(id: string, type: "view" | "click") {
  void fetch(`/api/popups/${encodeURIComponent(id)}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
    keepalive: true,
  }).catch(() => {});
}

export function PopupHost() {
  const pathname = usePathname() || "/";
  const [current, setCurrent] = useState<PopupView | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isPopupQuietPath(pathname)) return;
    let cancelled = false;
    fetch(`/api/popups?path=${encodeURIComponent(pathname)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { popups?: PopupView[] } | null) => {
        if (cancelled || !d?.popups?.length) return;
        const next = d.popups.find(due);
        if (!next) return;
        timer.current = setTimeout(() => {
          // Never on top of another open dialog (a celebration, a confirm).
          if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
          markSeen(next);
          track(next.id, "view");
          setCurrent(next);
        }, next.delaySeconds * 1000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      setCurrent(null);
    };
  }, [pathname]);

  useEffect(() => {
    if (!current) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCurrent(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  if (!current) return null;
  const p = current;
  const close = () => setCurrent(null);
  const external = !!p.ctaUrl && /^https?:\/\//i.test(p.ctaUrl);
  const onCta = () => {
    track(p.id, "click");
    close();
  };
  const imageOnly = p.kind === "IMAGE" && !p.body;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 text-white shadow-2xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        {p.imageUrl &&
          (p.ctaUrl && imageOnly ? (
            // An image popup is one big button when it has a link.
            <a
              href={p.ctaUrl}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer sponsored" : undefined}
              onClick={onCta}
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaSrc(p.imageUrl)} alt={p.title} className="block max-h-[70vh] w-full object-contain bg-black" />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(p.imageUrl)} alt="" className="block max-h-72 w-full object-cover" />
          ))}

        {!imageOnly && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-5">
            {p.kind === "AD" && (
              <span className="mb-2 inline-block rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Sponsored
              </span>
            )}
            <h2 className="pr-8 text-lg font-extrabold leading-snug">{p.title}</h2>
            {p.body && (
              <div
                className={`${OFFER_RICHTEXT_CLASS} mt-2 text-sm`}
                // Sanitised on the server (lib/rich-html.ts) before it is sent.
                dangerouslySetInnerHTML={{ __html: p.body }}
              />
            )}
          </div>
        )}

        {p.ctaUrl && p.ctaLabel && !imageOnly && (
          <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-4">
            {external ? (
              <a
                href={p.ctaUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={onCta}
                className="app-accent inline-flex grow basis-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold"
              >
                {p.ctaLabel} <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <Link
                href={p.ctaUrl}
                onClick={onCta}
                className="app-accent inline-flex grow basis-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold"
              >
                {p.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={close}
              className="grow basis-auto whitespace-nowrap rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
