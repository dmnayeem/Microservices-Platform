"use client";

import { useSyncExternalStore, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Gift,
  Sparkles,
  X,
} from "lucide-react";
import { cn, usd } from "@/lib/utils";
import {
  subscribeNotify,
  getNotifySnapshot,
  dismissNotify,
  type NotifyItem,
  type NotifyKind,
} from "@/lib/notify-center";

// Per-tone visual language. All class strings are literal (Tailwind purge-safe).
const TONE: Record<
  Exclude<NotifyKind, "reward">,
  {
    icon: typeof Info;
    gradient: string; // icon medallion fill
    glow: string; // radial ambient blob
    border: string; // card border tint
    line: string; // top accent gradient via-color
    bar: string; // countdown bar
    shadow: string; // medallion glow
  }
> = {
  success: {
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-teal-600",
    glow: "bg-emerald-500/25",
    border: "border-emerald-500/25",
    line: "via-emerald-500/60",
    bar: "bg-emerald-500",
    shadow: "shadow-emerald-500/30",
  },
  error: {
    icon: XCircle,
    gradient: "from-red-500 to-rose-600",
    glow: "bg-red-500/25",
    border: "border-red-500/25",
    line: "via-red-500/60",
    bar: "bg-red-500",
    shadow: "shadow-red-500/30",
  },
  warning: {
    icon: AlertTriangle,
    gradient: "from-amber-400 to-orange-500",
    glow: "bg-amber-500/25",
    border: "border-amber-500/25",
    line: "via-amber-500/60",
    bar: "bg-amber-500",
    shadow: "shadow-amber-500/30",
  },
  info: {
    icon: Info,
    gradient: "from-(--app-grad-a) to-(--app-grad-b)",
    glow: "bg-(--app-cta)/25",
    border: "border-(--app-accent-edge)/25",
    line: "via-(--app-rail-b)/60",
    bar: "bg-(--app-cta)",
    shadow: "shadow-(--app-cta)/30",
  },
};

const NO_ITEMS: NotifyItem[] = [];

export function NotifyCenterHost() {
  const queue = useSyncExternalStore(
    subscribeNotify,
    getNotifySnapshot,
    () => NO_ITEMS
  );

  // Empty on the server + first client render, so createPortal / document is
  // only reached after a notification is triggered (client only).
  if (queue.length === 0) return null;
  const reward = queue.find((n) => n.kind === "reward");
  const toasts = queue.filter((n) => n.kind !== "reward");
  return createPortal(
    <>
      {toasts.length > 0 && (
        // Top corner, no backdrop: the page stays sharp and usable while the
        // message is read. Full width on a phone, a column on the right above.
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10001 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96"
        >
          {toasts.map((t) => (
            <ToastCard key={t.id} item={t} />
          ))}
        </div>
      )}
      {reward && <RewardView key={reward.id} item={reward} />}
    </>,
    document.body
  );
}

function formatAmount(amount: number, unit: "pts" | "USD") {
  return unit === "pts"
    ? `+${amount.toLocaleString()} pts`
    : `+${usd(amount)}`;
}

function useAutoDismiss(id: number, durationMs: number) {
  useEffect(() => {
    const t = setTimeout(() => dismissNotify(id), durationMs);
    return () => clearTimeout(t);
  }, [id, durationMs]);
}

/** A reward is a celebration, so it keeps the centre — dimmed, never blurred. */
function RewardView({ item }: { item: NotifyItem }) {
  useAutoDismiss(item.id, item.durationMs);
  const close = () => dismissNotify(item.id);
  return (
    <div
      className="fixed inset-0 z-10001 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <RewardCard item={item} onClose={close} />
    </div>
  );
}

/** Thin bar that empties over the notification's lifetime (left → right). */
function CountdownBar({ durationMs, tone }: { durationMs: number; tone: string }) {
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-2xl bg-white/5">
      <span
        className={cn("block h-full w-full animate-notify-bar", tone)}
        style={{ animationDuration: `${durationMs}ms` }}
      />
    </span>
  );
}

function ToastCard({ item }: { item: NotifyItem }) {
  useAutoDismiss(item.id, item.durationMs);
  const t = TONE[item.kind as Exclude<NotifyKind, "reward">] ?? TONE.info;
  const Icon = t.icon;
  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border bg-(--app-surface) py-3 pl-3 pr-10 shadow-xl shadow-black/30 animate-toast-in",
        t.border
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br text-white ring-1 ring-white/15",
          t.gradient
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-bold leading-snug text-white">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-(--app-ink-2) whitespace-pre-line wrap-break-word">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={() => dismissNotify(item.id)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-(--app-ink-3) transition-colors hover:bg-white/5 hover:text-(--app-ink-2)"
      >
        <X className="h-4 w-4" />
      </button>
      <CountdownBar durationMs={item.durationMs} tone={t.bar} />
    </div>
  );
}

function RewardCard({
  item,
  onClose,
}: {
  item: NotifyItem;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
      className="relative w-full max-w-xs cursor-pointer overflow-hidden rounded-3xl border border-amber-500/25 bg-linear-to-b from-(--app-surface) to-(--app-page) px-6 pt-8 pb-8 text-center elevate-2 shadow-amber-500/10 animate-pop-in"
    >
      {/* Sparkle burst */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <span className="absolute -top-10 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
        {[
          "left-6 top-6",
          "right-7 top-8",
          "left-10 bottom-10",
          "right-9 bottom-12",
          "left-1/2 top-4",
        ].map((pos, i) => (
          <Sparkles
            key={i}
            className={cn(
              "absolute h-4 w-4 text-amber-300/80 animate-sparkle",
              pos
            )}
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>

      {/* Gift medallion */}
      <div className="relative mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-linear-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/40 ring-1 ring-white/15 animate-pop-in">
        <Gift className="h-10 w-10 text-white" />
      </div>

      {typeof item.amount === "number" && (
        <p className="relative bg-linear-to-r from-amber-300 to-orange-400 bg-clip-text text-4xl font-black tabular-nums text-transparent">
          {formatAmount(item.amount, item.unit ?? "pts")}
        </p>
      )}
      <h2 className="relative mt-1 text-lg font-bold text-white">{item.title}</h2>
      {item.description && (
        <p className="relative mt-1 text-sm text-(--app-ink-3)">{item.description}</p>
      )}
      <p className="relative mt-4 text-[11px] uppercase tracking-wider text-(--app-ink-3)">
        Tap to dismiss
      </p>

      <CountdownBar durationMs={item.durationMs} tone="bg-amber-500" />
    </div>
  );
}
