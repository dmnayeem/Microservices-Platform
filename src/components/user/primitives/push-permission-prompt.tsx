"use client";

import { lsGet, lsSet } from "@/lib/safe-storage";
import { ENGAGED_EVENT } from "@/lib/header-data";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ListChecks, Gift, Wallet, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { resubscribeIfGranted, subscribeToPush } from "@/lib/push-client";

const STORAGE_KEY = "push_prompt_dismissed_at";
const COUNT_KEY = "push_prompt_dismiss_count";
/** "Not now" → ask again after this long … */
const ASK_AGAIN_MS = 3 * 24 * 60 * 60 * 1000;
/** … but never more than this many times on one device. */
const MAX_DISMISSALS = 5;
/** Shown once the member is in the app — not in the very first second. */
const DELAY_MS = 8_000;

/** Routes where the prompt is suppressed — focused user flows. */
const SUPPRESSED_PATHS = [
  "/article-tasks",
  "/video-tasks",
  "/quiz-tasks",
  "/survey-tasks",
  "/social-tasks",
  "/proxy-tasks",
];

const BENEFITS = [
  { icon: ListChecks, text: "New tasks the moment they're added" },
  { icon: Gift, text: "Rewards and approvals" },
  { icon: Wallet, text: "Withdrawal updates" },
];

function canAsk(minGapMs: number): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "default") return false;
  if (Number(lsGet(COUNT_KEY) ?? 0) >= MAX_DISMISSALS) return false;
  const dismissed = Number(lsGet(STORAGE_KEY) ?? 0);
  return Date.now() - dismissed >= minGapMs;
}

export function PushPermissionPrompt({ enabled = true, userId }: { enabled?: boolean; userId?: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();
  const firstPath = useRef<string | null>(null);

  // Silent re-subscribe: a member who allowed notifications keeps receiving
  // them even after their subscription was lost. Not gated by the popup
  // switch — it never asks anything. Production only: in development the
  // service worker is torn down on every load (service-worker-register.tsx).
  useEffect(() => {
    if (!userId || process.env.NODE_ENV !== "production") return;
    const t = setTimeout(() => void resubscribeIfGranted(userId), 3_000);
    return () => clearTimeout(t);
  }, [userId]);

  // Ask after 8 s in the app, or on the second page they open — whichever
  // comes first.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (firstPath.current === null) firstPath.current = pathname;
    const path = pathname || "";
    // Don't interrupt focused task flows (mid-way through an article task).
    if (SUPPRESSED_PATHS.some((p) => path.startsWith(p))) return;
    if (!canAsk(ASK_AGAIN_MS)) return;
    const secondPage = firstPath.current !== pathname;
    const t = setTimeout(() => setShow(true), secondPage ? 1_500 : DELAY_MS);
    return () => clearTimeout(t);
  }, [enabled, pathname]);

  // Starting a task is when a notification is worth most ("your task was
  // approved"), so ask right then — even on a task page, and after one day
  // rather than three since the last "Not now".
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return;
    const onEngaged = () => {
      if (canAsk(24 * 60 * 60 * 1000)) setShow(true);
    };
    window.addEventListener(ENGAGED_EVENT, onEngaged);
    return () => window.removeEventListener(ENGAGED_EVENT, onEngaged);
  }, [enabled]);

  const enable = async () => {
    setBusy(true);
    try {
      // Must be called straight from the tap (browsers ignore it otherwise).
      const result = await Notification.requestPermission();
      if (result === "granted") {
        const ok = await subscribeToPush();
        if (ok) {
          // They asked for notifications: make sure the account setting agrees.
          void fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pushNotifications: true }),
          }).catch(() => {});
          toast.success("Notifications are on", { description: "We'll let you know about new tasks and rewards." });
        } else {
          toast.error("Couldn't turn on notifications", { description: "Try again from Settings → Notifications." });
        }
      } else if (result === "denied") {
        toast.error("Notifications are blocked", {
          description: "You can allow them any time — Settings → Notifications shows how.",
        });
      } else {
        lsSet(STORAGE_KEY, String(Date.now()));
      }
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setShow(false);
    }
  };

  const dismiss = () => {
    lsSet(STORAGE_KEY, String(Date.now()));
    lsSet(COUNT_KEY, String(Number(lsGet(COUNT_KEY) ?? 0) + 1));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
      className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) dismiss();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-(--app-cta) text-(--app-on-cta)">
          <Bell className="h-7 w-7" />
        </div>
        <h2 id="push-prompt-title" className="text-lg font-bold text-(--app-ink)">
          Turn on notifications
        </h2>
        <ul className="mt-4 space-y-2.5 text-left">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-(--app-ink-2)">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--app-surface-2) text-(--app-ink)">
                <Icon className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="flex-1 rounded-xl border border-(--app-line) px-4 py-2.5 text-sm font-semibold text-(--app-ink) disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-(--app-cta) px-4 py-2.5 text-sm font-bold text-(--app-on-cta) disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Turn on
          </button>
        </div>
      </div>
    </div>
  );
}
