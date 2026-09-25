/**
 * Notification templates — one definition of what "Urgent" or "Offer" looks
 * like, read by the admin picker, the in-app card and the email builder.
 *
 * Before this, a broadcast could carry an image, a link and a button label and
 * the notification list rendered none of them: every message, whether it
 * announced a bonus or an account lock, came out as the same grey line of text.
 * The admin had a choice of eight `NotificationType` values that changed a
 * small icon and nothing else.
 *
 * Type and style are deliberately separate. `NotificationType` is what the
 * message is ABOUT — it drives the user's filter tabs and must keep meaning
 * "wallet" or "task" forever. Style is how loudly it is said. The same wallet
 * notification is calm when a payout lands and urgent when one fails, and
 * folding those together would mean choosing between a correct filter and a
 * correct colour.
 *
 * Client-safe: no prisma, no server imports. The email builder reads the hex
 * values from here because mail clients cannot see Tailwind, and the web card
 * reads the class names, so the two cannot drift apart into different reds.
 */

export type NotificationStyle =
  | "PLAIN"
  | "IMPORTANT"
  | "URGENT"
  | "OFFER"
  | "UPDATE"
  | "REWARD"
  | "WARNING"
  | "SUCCESS"
  | "EVENT"
  | "MAINTENANCE"
  | "NEWS";

/** How hard the card works to be noticed. */
export type NotificationMotion = "none" | "pulse" | "glow" | "shine";

export type NotificationStyleDef = {
  id: NotificationStyle;
  /** The chip the user sees, e.g. "URGENT". */
  label: string;
  /** Lucide icon name; resolved by the card through its own map. */
  icon: string;
  motion: NotificationMotion;
  /** Tailwind classes for the web card. */
  web: {
    ring: string;
    chip: string;
    iconWrap: string;
    title: string;
    button: string;
    /** The tinted background of the whole card. */
    surface: string;
  };
  /** Literal colours for email, where no stylesheet exists. */
  mail: { accent: string; soft: string; ink: string };
  /** One line in the admin picker. */
  hint: string;
};

export const NOTIFICATION_STYLES: NotificationStyleDef[] = [
  {
    id: "PLAIN",
    label: "Normal",
    icon: "Bell",
    motion: "none",
    web: {
      ring: "border-(--app-line)",
      chip: "bg-(--app-surface-2) text-(--app-ink-3)",
      iconWrap: "bg-(--app-surface-2) text-(--app-ink-2)",
      title: "text-white",
      button: "bg-(--app-cta) text-white hover:brightness-110",
      surface: "",
    },
    mail: { accent: "#6366f1", soft: "#eef2ff", ink: "#1e1b4b" },
    hint: "No decoration. For everyday messages.",
  },
  {
    id: "URGENT",
    label: "URGENT",
    icon: "Siren",
    // The only style that keeps moving. If everything pulsed, nothing would
    // read as urgent — the animation is the whole point of this one.
    motion: "pulse",
    web: {
      ring: "border-rose-500/60",
      chip: "bg-rose-500 text-white",
      iconWrap: "bg-rose-500/20 text-rose-300",
      title: "text-rose-200",
      button: "bg-rose-500 text-white hover:bg-rose-400",
      surface: "bg-rose-500/10",
    },
    mail: { accent: "#e11d48", soft: "#fff1f2", ink: "#881337" },
    hint: "Needs acting on now — account locked, payout failed, security.",
  },
  {
    id: "IMPORTANT",
    label: "Important",
    icon: "AlertCircle",
    motion: "glow",
    web: {
      ring: "border-amber-500/50",
      chip: "bg-amber-500 text-black",
      iconWrap: "bg-amber-500/20 text-amber-300",
      title: "text-amber-100",
      button: "bg-amber-500 text-black hover:bg-amber-400",
      surface: "bg-amber-500/[0.07]",
    },
    mail: { accent: "#f59e0b", soft: "#fffbeb", ink: "#78350f" },
    hint: "Must be read, but nothing is on fire. Terms, policy, deadlines.",
  },
  {
    id: "OFFER",
    label: "Offer",
    icon: "Gift",
    motion: "shine",
    web: {
      ring: "border-fuchsia-500/50",
      chip: "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white",
      iconWrap: "bg-fuchsia-500/20 text-fuchsia-300",
      title: "text-fuchsia-100",
      button:
        "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white hover:brightness-110",
      surface: "bg-fuchsia-500/[0.07]",
    },
    mail: { accent: "#d946ef", soft: "#fdf4ff", ink: "#701a75" },
    hint: "Bonus, discount, limited-time promotion.",
  },
  {
    id: "REWARD",
    label: "Reward",
    icon: "Coins",
    motion: "shine",
    web: {
      ring: "border-yellow-500/50",
      chip: "bg-yellow-400 text-black",
      iconWrap: "bg-yellow-400/20 text-yellow-300",
      title: "text-yellow-100",
      button: "bg-yellow-400 text-black hover:bg-yellow-300",
      surface: "bg-yellow-400/[0.07]",
    },
    mail: { accent: "#eab308", soft: "#fefce8", ink: "#713f12" },
    hint: "Money or points have arrived.",
  },
  {
    id: "UPDATE",
    label: "Update",
    icon: "Sparkles",
    motion: "none",
    web: {
      ring: "border-sky-500/50",
      chip: "bg-sky-500 text-white",
      iconWrap: "bg-sky-500/20 text-sky-300",
      title: "text-sky-100",
      button: "bg-sky-500 text-white hover:bg-sky-400",
      surface: "bg-sky-500/[0.06]",
    },
    mail: { accent: "#0ea5e9", soft: "#f0f9ff", ink: "#0c4a6e" },
    hint: "New feature, a change worth knowing about.",
  },
  {
    id: "SUCCESS",
    label: "Done",
    icon: "CheckCircle2",
    motion: "none",
    web: {
      ring: "border-emerald-500/50",
      chip: "bg-emerald-500 text-white",
      iconWrap: "bg-emerald-500/20 text-emerald-300",
      title: "text-emerald-100",
      button: "bg-emerald-500 text-white hover:bg-emerald-400",
      surface: "bg-emerald-500/[0.06]",
    },
    mail: { accent: "#10b981", soft: "#ecfdf5", ink: "#064e3b" },
    hint: "Something the user was waiting for has gone through.",
  },
  {
    id: "WARNING",
    label: "Warning",
    icon: "AlertTriangle",
    motion: "glow",
    web: {
      ring: "border-orange-500/50",
      chip: "bg-orange-500 text-white",
      iconWrap: "bg-orange-500/20 text-orange-300",
      title: "text-orange-100",
      button: "bg-orange-500 text-white hover:bg-orange-400",
      surface: "bg-orange-500/[0.07]",
    },
    mail: { accent: "#f97316", soft: "#fff7ed", ink: "#7c2d12" },
    hint: "Something will go wrong unless the user acts.",
  },
  {
    id: "EVENT",
    label: "Event",
    icon: "PartyPopper",
    motion: "shine",
    web: {
      ring: "border-violet-500/50",
      chip: "bg-violet-500 text-white",
      iconWrap: "bg-violet-500/20 text-violet-300",
      title: "text-violet-100",
      button: "bg-violet-500 text-white hover:bg-violet-400",
      surface: "bg-violet-500/[0.07]",
    },
    mail: { accent: "#8b5cf6", soft: "#f5f3ff", ink: "#4c1d95" },
    hint: "Contest, giveaway, live session, seasonal campaign.",
  },
  {
    id: "NEWS",
    label: "News",
    icon: "Newspaper",
    motion: "none",
    web: {
      ring: "border-cyan-500/50",
      chip: "bg-cyan-500 text-white",
      iconWrap: "bg-cyan-500/20 text-cyan-300",
      title: "text-cyan-100",
      button: "bg-cyan-500 text-white hover:bg-cyan-400",
      surface: "bg-cyan-500/[0.06]",
    },
    mail: { accent: "#06b6d4", soft: "#ecfeff", ink: "#164e63" },
    hint: "Announcements and general platform news.",
  },
  {
    id: "MAINTENANCE",
    label: "Maintenance",
    icon: "Wrench",
    motion: "none",
    web: {
      ring: "border-slate-500/50",
      chip: "bg-slate-500 text-white",
      iconWrap: "bg-slate-500/20 text-slate-300",
      title: "text-slate-100",
      button: "bg-slate-500 text-white hover:bg-slate-400",
      surface: "bg-slate-500/[0.07]",
    },
    mail: { accent: "#64748b", soft: "#f8fafc", ink: "#1e293b" },
    hint: "Downtime, migrations, temporary limits.",
  },
];

const BY_ID = new Map(NOTIFICATION_STYLES.map((s) => [s.id, s]));

/** Never throws: an unknown or missing style falls back to PLAIN, because a
 *  notification rendering with no decoration is a far better failure than one
 *  that does not render at all. */
export function notificationStyle(id?: string | null): NotificationStyleDef {
  return BY_ID.get((id ?? "") as NotificationStyle) ?? BY_ID.get("PLAIN")!;
}

export function isNotificationStyle(id: string): id is NotificationStyle {
  return BY_ID.has(id as NotificationStyle);
}

/** Everything a rich notification can carry, as stored in `Notification.data`. */
export type NotificationPayload = {
  style?: NotificationStyle;
  imageUrl?: string;
  actionUrl?: string;
  actionLabel?: string;
  /** Short highlighted line above the title, e.g. "Ends in 3 hours". */
  kicker?: string;
  priority?: string;
  broadcastId?: string;
};

/** Read the decoration out of a `Notification.data` blob, whatever shape it is. */
export function readPayload(data: unknown): NotificationPayload {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  return {
    style: isNotificationStyle(String(d.style ?? "")) ? (d.style as NotificationStyle) : undefined,
    imageUrl: str("imageUrl"),
    actionUrl: str("actionUrl"),
    actionLabel: str("actionLabel"),
    kicker: str("kicker"),
    priority: str("priority"),
    broadcastId: str("broadcastId"),
  };
}
