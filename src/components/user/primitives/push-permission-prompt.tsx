"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { subscribeToPush } from "@/lib/push-client";

const STORAGE_KEY = "push_prompt_dismissed_at";

/** Routes where the prompt is suppressed — focused user flows. */
const SUPPRESSED_PATHS = [
  "/article-tasks",
  "/video-tasks",
  "/quiz-tasks",
  "/survey-tasks",
  "/social-tasks",
  "/proxy-tasks",
];

export function PushPermissionPrompt({ enabled = true }: { enabled?: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    // Don't interrupt focused task flows (e.g. mid-way through an article
    // task, the user shouldn't get a "Enable Notifications?" banner).
    const path = window.location.pathname || "";
    if (SUPPRESSED_PATHS.some((p) => path.startsWith(p))) return;
    const dismissed = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    if (Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000) return;
    const t = setTimeout(() => setShow(true), 6000);
    return () => clearTimeout(t);
  }, [enabled]);

  const enable = async () => {
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        // Register the SW + web-push subscription (no-op if VAPID unset).
        void subscribeToPush();
        toast.success("Notifications enabled");
      }
    } catch {
      // ignore
    } finally {
      setShow(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)]">
      <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-xl p-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Enable Notifications</p>
            <p className="text-xs text-gray-300">
              Stay updated on rewards, tasks, and chat.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={dismiss}
            className="flex-1 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold"
          >
            Not Now
          </button>
          <button
            onClick={enable}
            className="flex-1 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold"
          >
            Enable
          </button>
        </div>
      </div>
    </div>
  );
}
