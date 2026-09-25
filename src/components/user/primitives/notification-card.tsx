"use client";

import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Coins,
  Gift,
  Newspaper,
  PartyPopper,
  Siren,
  Sparkles,
  Wrench,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import {
  notificationStyle,
  readPayload,
  type NotificationStyleDef,
} from "@/lib/notification-styles";

/**
 * One notification, rendered the way the admin composed it.
 *
 * The list used to print a title, a message and a small type icon, and dropped
 * everything else on the floor — the image, the link and the button label were
 * all being stored and none of them ever reached a screen. This renders them,
 * and applies the template's colour and motion.
 *
 * The whole card is NOT a link even when there is an action: a card that
 * navigates on any click makes "mark as read" and "delete" into traps, and on a
 * phone the whole thing is one big accidental tap. The button is the link.
 */

const ICONS: Record<string, LucideIcon> = {
  Bell,
  Siren,
  AlertCircle,
  AlertTriangle,
  Gift,
  Coins,
  Sparkles,
  CheckCircle2,
  PartyPopper,
  Newspaper,
  Wrench,
};

function motionClass(def: NotificationStyleDef, isRead: boolean): string {
  // A read notification stops moving. Continuing to flash at somebody who has
  // already dealt with it is how users learn to ignore the animation, which
  // costs the next urgent message its only advantage.
  if (isRead) return "";
  if (def.motion === "pulse") return "notif-pulse";
  if (def.motion === "glow") return "notif-glow";
  if (def.motion === "shine") return "notif-shine";
  return "";
}

export function NotificationCard({
  title,
  message,
  data,
  createdAtLabel,
  isRead = false,
  className,
  children,
}: {
  title: string;
  message: string;
  /** The `Notification.data` blob, whatever shape it is. */
  data?: unknown;
  createdAtLabel?: string;
  isRead?: boolean;
  className?: string;
  /** Row actions (mark read, delete) supplied by the page. */
  children?: React.ReactNode;
}) {
  const payload = readPayload(data);
  const def = notificationStyle(payload.style);
  const Icon = ICONS[def.icon] ?? Bell;
  const decorated = def.id !== "PLAIN";

  return (
    <div
      // `--notif-accent` feeds the keyframes, so one colour drives the ring,
      // the glow and the pulse without three places to keep in step.
      style={{ ["--notif-accent" as string]: def.mail.accent }}
      className={cn(
        "rounded-xl border p-4 transition-colors",
        def.web.ring,
        decorated && !isRead ? def.web.surface : "",
        isRead && "opacity-75",
        motionClass(def, isRead),
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl grid place-items-center shrink-0",
            def.web.iconWrap
          )}
        >
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {decorated && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                  def.web.chip,
                  def.motion === "pulse" && !isRead && "notif-chip-blink"
                )}
              >
                {def.label}
              </span>
            )}
            {payload.kicker && (
              <span className="text-[11px] font-semibold text-(--app-ink-3)">
                {payload.kicker}
              </span>
            )}
            {!isRead && (
              <span
                aria-label="Unread"
                className="w-2 h-2 rounded-full bg-(--app-cta) shrink-0"
              />
            )}
          </div>

          <h3
            className={cn(
              "mt-1 font-bold leading-snug break-words",
              decorated ? def.web.title : "text-white"
            )}
          >
            {title}
          </h3>

          <p className="mt-1 text-sm text-(--app-ink-3) whitespace-pre-line break-words">
            {message}
          </p>

          {payload.imageUrl && (
            // Arbitrary admin-supplied artwork, so a plain <img> through the
            // media proxy — the bucket is private and a raw URL renders blank.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc(payload.imageUrl)}
              alt=""
              loading="lazy"
              className="mt-3 w-full max-h-52 object-cover rounded-lg border border-(--app-line)"
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {payload.actionUrl && (
              <Link
                href={payload.actionUrl}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition",
                  def.web.button
                )}
              >
                {payload.actionLabel || "Open"}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            {createdAtLabel && (
              <span className="text-xs text-(--app-ink-3)">{createdAtLabel}</span>
            )}
          </div>
        </div>

        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
      </div>
    </div>
  );
}
