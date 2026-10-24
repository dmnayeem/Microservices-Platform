"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { toast } from "@/lib/toast";
import { REASK_MINUTES, WARNING_REPLY_MAX, type ActiveWarning } from "@/lib/user-warnings";

/** Don't re-ask the server more often than this when the tab regains focus. */
const RECHECK_MS = 2 * 60_000;

/**
 * Pops up an admin's warning the moment the member opens the platform.
 *
 * It does not close on its own, on a backdrop tap or on Escape: the member
 * replies, or presses Close — and Close only hides it for REASK_MINUTES.
 *
 * No polling loop: it asks once on load, again when the tab comes back into
 * view (at most every two minutes), and once more when a dismissed warning is
 * due. A warning sent while someone browses shows on their next visit or tab
 * switch, which is soon enough and costs nothing for the members without one.
 */
export function WarningHost() {
  const [w, setW] = useState<ActiveWarning | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "dismiss" | null>(null);
  const lastCheck = useRef(0);
  const dueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const r = await fetch("/api/warnings", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { warning: ActiveWarning | null };
      if (!j.warning) return;
      setW(j.warning);
      setReply("");
      void fetch("/api/warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: j.warning.id, action: "seen" }),
      }).catch(() => {});
    } catch {
      /* offline — the next visit asks again */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void check(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > RECHECK_MS) {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      if (dueTimer.current) clearTimeout(dueTimer.current);
    };
  }, [check]);

  if (!w) return null;

  const send = async () => {
    const text = reply.trim();
    if (text.length < 2) {
      toast.error("Write a reply first");
      return;
    }
    setBusy("reply");
    try {
      const r = await fetch("/api/warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id, action: "reply", text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 409) throw new Error(j.error ?? `HTTP ${r.status}`);
      setW(null);
      toast.success("Reply sent", { description: "The team will review it." });
      // Another unanswered warning may be waiting behind this one.
      setTimeout(() => void check(), 800);
    } catch (err) {
      toast.error("Couldn't send the reply", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  const close = async () => {
    setBusy("dismiss");
    await fetch("/api/warnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, action: "dismiss" }),
    }).catch(() => {});
    setBusy(null);
    setW(null);
    // Back when it is due, even if the member stays on this page.
    if (dueTimer.current) clearTimeout(dueTimer.current);
    dueTimer.current = setTimeout(() => void check(), REASK_MINUTES * 60_000 + 5_000);
  };

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="user-warning-title"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-red-500/40 bg-(--app-surface) shadow-2xl shadow-red-500/10 mb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 border-b border-red-500/25 bg-red-500/10 px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-400">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="user-warning-title" className="text-base font-bold text-white">
              Warning from the RevType team
            </h2>
            <p className="text-xs text-red-200/80">
              {w.total > 1 ? `Warning ${w.total} on your account` : "Please read this carefully"}
            </p>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">What we noticed</p>
            <p className="mt-1 whitespace-pre-line wrap-break-word text-sm leading-relaxed text-(--app-ink)">{w.issue}</p>
          </section>
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">What happens if it continues</p>
            <p className="mt-1 whitespace-pre-line wrap-break-word text-sm leading-relaxed text-amber-50/90">
              {w.consequence}
            </p>
          </section>
          <section>
            <label htmlFor="user-warning-reply" className="text-[11px] font-bold uppercase tracking-wider text-(--app-ink-3)">
              Your reply
            </label>
            <textarea
              id="user-warning-reply"
              value={reply}
              onChange={(e) => setReply(e.target.value.slice(0, WARNING_REPLY_MAX))}
              rows={3}
              placeholder="Explain what happened, or confirm you understand."
              className="mt-1 w-full resize-y rounded-xl border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-(--app-ink) placeholder:text-(--app-ink-3) focus:border-red-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-(--app-ink-3)">
              Closing without a reply shows this again in {REASK_MINUTES} minutes.
            </p>
          </section>
        </div>

        <div className="flex gap-2 border-t border-(--app-line) px-4 py-3">
          <button
            type="button"
            onClick={close}
            disabled={busy !== null}
            className="app-press min-h-11 flex-1 rounded-xl border border-(--app-line) px-4 text-sm font-semibold text-(--app-ink-2) hover:text-(--app-ink) disabled:opacity-50"
          >
            {busy === "dismiss" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Close"}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy !== null || reply.trim().length < 2}
            className="app-press inline-flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy === "reply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send reply
          </button>
        </div>
      </div>
    </div>
  );
}
