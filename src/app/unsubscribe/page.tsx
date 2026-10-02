import Link from "next/link";
import type { Metadata } from "next";
import { MailX, CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { getPlatformName } from "@/lib/system-settings";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a broadcast email's "Unsubscribe" link lands. Logged-out and
 * cookie-less by design: the signed token in the link is the identity.
 *
 * Opening this page changes nothing — mail scanners open every link in a
 * message. The button posts to /api/email/unsubscribe, the same endpoint
 * Gmail's one-click unsubscribe uses.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; done?: string; error?: string }>;
}) {
  const { t, done, error } = await searchParams;
  const userId = verifyUnsubscribeToken(t);
  const [user, brand] = await Promise.all([
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailNotifications: true } })
      : Promise.resolve(null),
    getPlatformName(),
  ]);
  const masked = user?.email ? user.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(6, b.length)) + c) : "";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-(--app-page)">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-(--app-surface-2) ring-1 ring-(--app-line) flex items-center justify-center">
            <MailX className="w-8 h-8 text-(--app-ink-2)" />
          </div>
          <h1 className="text-2xl font-bold text-white">{brand} email updates</h1>
        </div>

        <div className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 space-y-4">
          {error || !user ? (
            <p className="text-sm text-(--app-ink-2) inline-flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              This unsubscribe link is not valid. Sign in and turn email updates off under Settings instead.
            </p>
          ) : done || !user.emailNotifications ? (
            <>
              <p className="text-sm text-(--app-ink-2) inline-flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                You&apos;re unsubscribed. {masked} will no longer get announcements and offers from {brand}.
              </p>
              <p className="text-xs text-(--app-ink-3)">
                You&apos;ll still get emails you need to use your account — password resets, security alerts and
                payment receipts. Changed your mind? Turn email updates back on in Settings.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-(--app-ink-2)">
                Stop announcement and offer emails to <span className="font-semibold text-white">{masked}</span>?
              </p>
              <p className="text-xs text-(--app-ink-3)">
                Account emails (password resets, security alerts, payment receipts) still arrive.
              </p>
              <form method="POST" action={`/api/email/unsubscribe?from=page&t=${encodeURIComponent(t ?? "")}`}>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Unsubscribe
                </button>
              </form>
            </>
          )}
          <Link href="/settings" className="inline-block text-sm font-semibold text-(--app-accent,#60a5fa) hover:underline">
            Email settings
          </Link>
        </div>
      </div>
    </div>
  );
}
