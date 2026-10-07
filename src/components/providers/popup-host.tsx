"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isPopupQuietPath, popupDeviceOfWidth, type PopupView } from "@/lib/popups";
import { PopupCard } from "@/components/popups/popup-card";

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
    // The device class decides device-targeted popups (mobile / tablet / desktop).
    const device = popupDeviceOfWidth(window.innerWidth || 1024);
    fetch(`/api/popups?path=${encodeURIComponent(pathname)}&d=${device}`, { cache: "no-store" })
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
  return (
    <PopupCard
      popup={p}
      closeRef={closeRef}
      onClose={() => setCurrent(null)}
      onCta={() => track(p.id, "click")}
    />
  );
}
