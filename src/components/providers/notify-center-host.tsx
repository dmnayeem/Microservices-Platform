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
    gradient: "from-indigo-500 to-violet-600",
    glow: "bg-indigo-500/25",
    border: "border-indigo-500/25",
    line: "via-indigo-500/60",
    bar: "bg-indigo-500",
    shadow: "shadow-indigo-500/30",
  },
};

export function NotifyCenterHost() {
  const active = useSyncExternalStore(
    subscribeNotify,
    getNotifySnapshot,
    () => null
  );

  // `active` is null on the server + first client render, so createPortal /
  // document is only reached after a notification is triggered (client only).
  if (!active) return null;
  return createPortal(
    <NotifyView key={active.id} item={active} />,
    document.body
  );
}

function formatAmount(amount: number, unit: "pts" | "USD") {
  return unit === "pts"
    ? `+${amount.toLocaleString()} pts`
    : `+${usd(amount)}`;
}

function NotifyView({ item }: { item: NotifyItem }) {
  const { id, durationMs } = item;

  // Auto-dismiss after the item's duration.
  useEffect(() => {
    const t = setTimeout(() => dismissNotify(id), durationMs);
    return () => clearTimeout(t);
  }, [id, durationMs]);

  const close = () => dismissNotify(id);

  return (
    <div
      className="fixed inset-0 z-10001 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {item.kind === "reward" ? (
        <RewardCard item={item} onClose={close} />
      ) : (
        <SimpleCard item={item} onClose={close} />
      )}
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

function SimpleCard({
  item,
  onClose,
}: {
  item: NotifyItem;
  onClose: () => void;
}) {
  const t = TONE[item.kind as Exclude<NotifyKind, "reward">] ?? TONE.info;
  const Icon = t.icon;
  return (
    <div
      role="status"
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        "relative w-full max-w-68 overflow-hidden rounded-3xl border bg-gray-900 px-6 pt-8 pb-9 text-center elevate-2 animate-pop-in",
        t.border
      )}
    >
      {/* Top accent line */}
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent",
          t.line
        )}
      />
      {/* Ambient tone glow behind the icon */}
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 -top-10 h-32 w-32 -translate-x-1/2 rounded-full blur-3xl",
          t.glow
        )}
      />

      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Icon medallion — centered on top */}
      <div
        className={cn(
          "relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-linear-to-br text-white shadow-lg ring-1 ring-white/15",
          t.gradient,
          t.shadow
        )}
      >
        <Icon className="h-8 w-8" />
      </div>

      <h2 className="relative text-display text-base text-white">
        {item.title}
      </h2>
      {item.description && (
        <p className="relative mt-1.5 text-sm text-gray-300 whitespace-pre-line">
          {item.description}
        </p>
      )}

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
      className="relative w-full max-w-xs cursor-pointer overflow-hidden rounded-3xl border border-amber-500/25 bg-linear-to-b from-gray-900 to-gray-950 px-6 pt-8 pb-8 text-center elevate-2 shadow-amber-500/10 animate-pop-in"
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
        <p className="relative mt-1 text-sm text-gray-400">{item.description}</p>
      )}
      <p className="relative mt-4 text-[11px] uppercase tracking-wider text-gray-600">
        Tap to dismiss
      </p>

      <CountdownBar durationMs={item.durationMs} tone="bg-amber-500" />
    </div>
  );
}
