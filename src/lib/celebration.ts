/**
 * What a celebration popup shows. Stored on the notification as `data.popup`
 * (with `Notification.popup = true`), rendered once by `CelebrationHost` the
 * next time the user opens the app. Client-safe: no prisma.
 *
 * Only for the moments worth interrupting someone for — a lottery win, a
 * leaderboard prize, a big achievement, a payment received. Everything else
 * stays a quiet bell notification.
 */
export type CelebrationKind = "lottery" | "leaderboard" | "achievement" | "payment";

export interface CelebrationWinner {
  rank: number;
  /** Display name — never an email. */
  name: string;
  prize: string;
  /** The person looking at the popup. */
  you?: boolean;
}

export interface CelebrationPayload {
  kind: CelebrationKind;
  headline: string;
  /** The big number: "5,000 points", "$48.75". */
  amount?: string;
  sub?: string;
  /** Everyone who won the same draw / cycle — "who won what". */
  winners?: CelebrationWinner[];
  cta?: { label: string; href: string };
}

/** A name safe to show to other users. */
export function publicName(u: { name?: string | null; username?: string | null } | null | undefined): string {
  return (u?.name || u?.username || "A member").trim().slice(0, 40);
}
