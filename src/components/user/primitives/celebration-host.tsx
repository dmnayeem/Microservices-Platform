"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, Ticket, Award, Banknote, X } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { CelebrationKind, CelebrationPayload } from "@/lib/celebration";

type Popup = CelebrationPayload & { id: string };

const LOOK: Record<CelebrationKind, { Icon: typeof Trophy; band: string; emoji: string }> = {
  lottery: { Icon: Ticket, band: "from-amber-400 via-orange-500 to-pink-500", emoji: "🎉" },
  leaderboard: { Icon: Trophy, band: "from-yellow-300 via-amber-500 to-orange-600", emoji: "🏆" },
  achievement: { Icon: Award, band: "from-violet-400 via-fuchsia-500 to-pink-500", emoji: "🏅" },
  payment: { Icon: Banknote, band: "from-emerald-400 via-teal-500 to-cyan-500", emoji: "💸" },
};

/**
 * Celebration popups — a lottery win, a leaderboard prize, a big achievement, a
 * payment received — shown once, over the app, the next time the user opens
 * it. Content is the notification's `data.popup` (src/lib/celebration.ts).
 *
 * Not while a task is being worked on: a win is good news, but not good
 * enough to cover the task someone is in the middle of. It waits for the next
 * page.
 */
export function CelebrationHost() {
  const pathname = usePathname() ?? "";
  const [queue, setQueue] = useState<Popup[]>([]);
  const busy = useRef(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const quiet = /^\/(tasks|article-tasks|video-tasks|social-tasks|quiz-tasks|survey-tasks|app-install-tasks|custom-tasks|manual-tasks|proxy-tasks)\/[^/]+/.test(pathname);

  const load = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    fetch("/api/notifications/popups", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { popups?: Popup[] } | null) => {
        if (d?.popups?.length) {
          setQueue((q) => {
            const have = new Set(q.map((p) => p.id));
            return [...q, ...d.popups!.filter((p) => !have.has(p.id))];
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, { intervalMs: 120_000 });

  const current = quiet ? null : queue[0] ?? null;

  const close = useCallback(() => {
    const p = queue[0];
    if (!p) return;
    setQueue((q) => q.slice(1));
    void fetch("/api/notifications/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    }).catch(() => {});
  }, [queue]);

  useEffect(() => {
    if (!current) return;
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close]);

  if (!current) return null;
  const look = LOOK[current.kind] ?? LOOK.achievement;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in relative w-full max-w-sm overflow-hidden rounded-3xl border border-(--app-line) bg-(--app-surface) shadow-2xl"
      >
        {/* Band + confetti */}
        <div className={`relative h-28 bg-linear-to-br ${look.band}`}>
          <div aria-hidden className="celebrate-confetti absolute inset-0">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 0.12}s` }} />
            ))}
          </div>
          <div className="absolute inset-x-0 -bottom-9 flex justify-center">
            <span className="grid h-18 w-18 place-items-center rounded-2xl border-4 border-(--app-surface) bg-white text-3xl shadow-lg">
              {look.emoji}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white hover:bg-black/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-12 text-center">
          <h2 id="celebration-title" className="text-lg font-extrabold leading-snug text-(--app-ink)">
            {current.headline}
          </h2>
          {current.amount && (
            <p className="mt-2 text-3xl font-black tabular-nums text-(--app-accent-ink)">{current.amount}</p>
          )}
          {current.sub && <p className="mt-1 text-sm text-(--app-ink-3)">{current.sub}</p>}

          {current.winners && current.winners.length > 0 && (
            <div className="mt-4 text-left">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-(--app-ink-3)">Who won what</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {current.winners.map((w) => (
                  <li
                    key={`${w.rank}-${w.name}`}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                      w.you ? "bg-(--app-nav-wash) font-semibold" : "bg-(--app-page)"
                    }`}
                  >
                    <span className="w-7 shrink-0 font-bold tabular-nums text-(--app-ink-3)">#{w.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-(--app-ink)">
                      {w.name}
                      {w.you && <span className="ml-1 text-(--app-accent-ink)">(you)</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-(--app-ink-2)">{w.prize}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            {current.cta && (
              <Link
                href={current.cta.href}
                onClick={close}
                className="flex-1 rounded-xl border border-(--app-line) px-4 py-2.5 text-sm font-semibold text-(--app-ink) hover:bg-(--app-surface-2)"
              >
                {current.cta.label}
              </Link>
            )}
            <button
              ref={btnRef}
              type="button"
              onClick={close}
              className="app-accent flex-1 rounded-xl px-4 py-2.5 text-sm font-bold"
            >
              Nice!
            </button>
          </div>
          {queue.length > 1 && (
            <p className="mt-2 text-[11px] text-(--app-ink-3)">{queue.length - 1} more waiting</p>
          )}
        </div>
      </div>
    </div>
  );
}
