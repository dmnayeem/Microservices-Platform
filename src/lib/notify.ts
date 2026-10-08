import webpush from "web-push";
import type { CelebrationPayload } from "@/lib/celebration";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { NotificationType } from "@/generated/prisma/client";
import { getSetting } from "@/lib/system-settings";
import { emailCategoryForNotificationType, type EmailCategoryKey } from "@/lib/email-categories";

/**
 * Platform-wide notification switches (admin → Settings → Notifications).
 *
 * Every one of these boxes wrote a `SystemSetting` row that nothing read: the
 * only gates were the per-user `emailNotifications` / `pushNotifications`
 * columns, so an admin turning "Notify on new task" off changed nothing for
 * anybody. These are the master switches — a user preference can still opt OUT
 * of something the admin leaves on, but never back IN to something switched off.
 *
 * Types with no switch of their own are always allowed; only the four listed
 * categories are separately controllable, which is what the screen offers.
 */
const TYPE_SWITCH: Partial<Record<NotificationType, string>> = {
  [NotificationType.TASK]: "notify_new_task",
  [NotificationType.WALLET]: "notify_withdrawal",
  [NotificationType.REFERRAL]: "notify_referral",
  [NotificationType.ACHIEVEMENT]: "notify_level_up",
};

/** False when the admin has switched this category of notification off. */
async function typeAllowed(type: NotificationType): Promise<boolean> {
  const key = TYPE_SWITCH[type];
  if (!key) return true;
  return (await getSetting<boolean>(key, true)) !== false;
}

/** False when the admin has switched web push off for the whole platform. */
async function pushAllowed(): Promise<boolean> {
  return (
    (await getSetting<boolean>("push_notifications_enabled", true)) !== false
  );
}

let vapidReady: boolean | null = null;

/** Configure web-push VAPID from env once. Returns false if keys are unset. */
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@revtype.com";
  if (pub && priv) {
    try {
      webpush.setVapidDetails(subject, pub, priv);
      vapidReady = true;
    } catch {
      vapidReady = false;
    }
  } else {
    vapidReady = false;
  }
  return vapidReady;
}

/**
 * Unread notifications per user — sent with every push as `badgeCount`, so
 * the number on the installed app's icon (public/sw.js → setAppBadge) is the
 * real count even while the app is closed, like Messenger. A user missing from
 * the map has none. Never throws.
 */
async function unreadCounts(userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  try {
    const rows = (await prisma.notification.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, isRead: false },
      _count: { _all: true },
    })) as unknown as { userId: string; _count: { _all: number } }[];
    for (const r of rows) out.set(r.userId, r._count._all);
  } catch {
    /* no count → the service worker shows a plain dot instead */
  }
  return out;
}

/** True when our own web push (VAPID keys) can send. */
export function isWebPushConfigured(): boolean {
  return ensureVapid();
}

/**
 * Our own web push to many users at once — the broadcast path. Respects the
 * site switch and each user's push setting, drops dead subscriptions (404/410)
 * like the single-user path, and never throws.
 */
export async function webPushToUsers(
  userIds: string[],
  msg: { title: string; body: string; url?: string }
): Promise<{ devices: number; delivered: number }> {
  const out = { devices: 0, delivered: 0 };
  try {
    if (userIds.length === 0 || !ensureVapid() || !(await pushAllowed())) return out;
    const optedIn = await prisma.user.findMany({
      where: { id: { in: userIds }, pushNotifications: true },
      select: { id: true },
    });
    if (optedIn.length === 0) return out;
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: optedIn.map((u) => u.id) } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });
    out.devices = subs.length;
    const counts = await unreadCounts(optedIn.map((u) => u.id));
    const payloadFor = (userId: string) =>
      JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/", badgeCount: counts.get(userId) || undefined });
    // A few at a time: push services rate-limit a burst from one sender.
    const PARALLEL = 20;
    for (let i = 0; i < subs.length; i += PARALLEL) {
      await Promise.all(
        subs.slice(i, i + PARALLEL).map((s) =>
          webpush
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadFor(s.userId))
            .then(() => {
              out.delivered++;
            })
            .catch(async (err: { statusCode?: number }) => {
              if (err?.statusCode === 404 || err?.statusCode === 410) {
                await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
              }
            })
        )
      );
    }
  } catch {
    // best-effort, like every push here
  }
  return out;
}

/**
 * Deliver email + web-push for an event whose in-app Notification row is created
 * elsewhere (e.g. inside a Prisma $transaction). Does NOT create a row. Safe to
 * call fire-and-forget after the transaction commits. Never throws.
 */
export async function deliverToUser(opts: {
  userId: string;
  title: string;
  message: string;
  link?: string;
  /**
   * A service notice about the user's own money (a payout, a refund): emailed
   * even when they turned notification emails off, and sent while the master
   * marketing-email switch is off. A payment receipt is not marketing, and a
   * user must not be left unsure whether they were paid.
   */
  transactional?: boolean;
  /** Template id from `lib/notification-styles.ts`, for the email's band. */
  style?: string;
  /**
   * Which admin switch governs the email copy (lib/email-categories.ts).
   * Off → no email; the in-app row and the push are unaffected.
   */
  category: EmailCategoryKey;
}) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, emailNotifications: true, pushNotifications: true },
    });
    if (!user) return;
    if (
      (user.emailNotifications || opts.transactional) &&
      user.email &&
      !user.email.endsWith("@deleted.local")
    ) {
      sendNotificationEmail(user.email, opts.title, opts.message, opts.link, {
        category: opts.category,
        transactional: opts.transactional === true,
        ...(opts.style ? { style: opts.style } : {}),
      }).catch(() => {});
    }
    if (user.pushNotifications && (await pushAllowed()) && ensureVapid()) {
      const subs = await prisma.pushSubscription.findMany({
        where: { userId: opts.userId },
      });
      const payload = JSON.stringify({
        title: opts.title,
        body: opts.message,
        url: opts.link ?? "/",
        badgeCount: (await unreadCounts([opts.userId])).get(opts.userId) || undefined,
      });
      await Promise.all(
        subs.map((s) =>
          webpush
            .sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload
            )
            .catch(async (err: { statusCode?: number }) => {
              if (err?.statusCode === 404 || err?.statusCode === 410) {
                await prisma.pushSubscription
                  .delete({ where: { id: s.id } })
                  .catch(() => {});
              }
            })
        )
      );
    }
  } catch {
    // best-effort
  }
}

export interface NotifyOptions {
  userId: string;
  type?: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Deep link opened when the notification is clicked. */
  link?: string;
  /**
   * Also show it as a celebration popup the next time the user opens the app
   * (src/lib/celebration.ts). For big moments only.
   */
  popup?: CelebrationPayload;
}

/**
 * Central notification dispatch: (1) always writes the in-app Notification row,
 * (2) sends an email if the user opted in and SMTP is configured, (3) sends a
 * web-push to every registered subscription. Email/push are best-effort and
 * never throw — a delivery failure must not break the triggering action.
 */
export async function notifyUser(opts: NotifyOptions) {
  const { userId, title, message, data, link } = opts;
  const type = opts.type ?? NotificationType.SYSTEM;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data:
        data || opts.popup
          ? JSON.parse(JSON.stringify({ ...(data ?? {}), ...(link ? { link } : {}), ...(opts.popup ? { popup: opts.popup } : {}) }))
          : link
            ? { link }
            : undefined,
      ...(opts.popup ? { popup: true } : {}),
    },
  });

  // Load prefs + email lazily (don't block the row creation on it).
  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { email: true, emailNotifications: true, pushNotifications: true },
    })
    .catch(() => null);

  // The in-app row is always written — an admin switch mutes the *delivery*
  // channels, it does not erase the record of what happened to the user.
  const allowed = await typeAllowed(type);

  if (
    allowed &&
    user?.emailNotifications &&
    user.email &&
    !user.email.endsWith("@deleted.local")
  ) {
    sendNotificationEmail(user.email, title, message, link, {
      category: emailCategoryForNotificationType(type),
    }).catch(() => {});
  }

  if (
    allowed &&
    user?.pushNotifications &&
    (await pushAllowed()) &&
    ensureVapid()
  ) {
    const subs = await prisma.pushSubscription
      .findMany({ where: { userId } })
      .catch(() => []);
    const payload = JSON.stringify({
      title,
      body: message,
      url: link ?? "/",
      badgeCount: (await unreadCounts([userId])).get(userId) || undefined,
    });
    await Promise.all(
      subs.map((s) =>
        webpush
          .sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          )
          .catch(async (err: { statusCode?: number }) => {
            // Prune dead subscriptions.
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await prisma.pushSubscription
                .delete({ where: { id: s.id } })
                .catch(() => {});
            }
          })
      )
    );
  }

  return notification;
}
