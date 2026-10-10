import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowedShortenerHosts, hostMatches } from "@/lib/visit-tasks";
import { loadVisitTask, openAttempt, visitCodeFor } from "@/lib/visit-tasks-server";

/**
 * The destination of a URL-shortener VISIT task. The admin sets the
 * shortener's target to this page; arriving here (signed in, same browser)
 * shows the person's own code, which they enter on the task to claim.
 *
 * Checked on arrival, all on the server: an attempt is in progress, the link
 * was opened through /go/task (open time known), at least `minSeconds` have
 * passed (a real pass through the shortener takes time), and the referrer is
 * the shortener. Too fast → no code. Wrong / missing source → "block": no
 * code; "review": the code is shown but the claim is held for an admin.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your code", robots: { index: false, follow: false } };

const nowMs = () => Date.now();

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-(--app-page) p-4 text-(--app-ink)">
      <div className="w-full max-w-md rounded-2xl border border-(--app-line) bg-(--app-surface) p-6 text-center shadow-xl">
        {children}
      </div>
    </main>
  );
}

export default async function VisitDestinationPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = await loadVisitTask(taskId);
  if (!task || task.config.kind !== "SHORTENER") {
    return (
      <Shell>
        <p className="text-lg font-bold">Link not found</p>
        <p className="mt-1 text-sm text-(--app-ink-2)">This task no longer exists.</p>
      </Shell>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return (
      <Shell>
        <p className="text-lg font-bold">Open this in your RevType browser</p>
        <p className="mt-2 text-sm text-(--app-ink-2)">
          You reached the end of the link, but this browser isn&apos;t signed in to RevType. Copy this page&apos;s
          address into the browser where you&apos;re signed in (or sign in here) and open it again.
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/v/${taskId}`)}`}
          className="mt-4 inline-block rounded-lg bg-(--app-cta) px-4 py-2 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  const attempt = await openAttempt(taskId, userId);
  const visit = attempt
    ? await prisma.taskVisit.findFirst({
        where: { submissionId: attempt.id, userId, kind: "SHORTENER" },
        orderBy: { openedAt: "desc" },
      })
    : null;
  if (!attempt || !visit) {
    return (
      <Shell>
        <p className="text-lg font-bold">Start the task first</p>
        <p className="mt-2 text-sm text-(--app-ink-2)">
          Open “{task.title}” in RevType and press Start — the link only counts when it&apos;s opened from the task.
        </p>
        <Link href={`/visit-tasks/${taskId}`} className="mt-4 inline-block rounded-lg bg-(--app-cta) px-4 py-2 text-sm font-bold text-white">
          Go to the task
        </Link>
      </Shell>
    );
  }

  // Judge the arrival once (the first arrival is the one that counts).
  let verdict = visit.verdict;
  if (!visit.reachedAt) {
    const h = await headers();
    let refHost: string | null = null;
    try {
      const r = h.get("referer");
      refHost = r ? new URL(r).host.toLowerCase().replace(/^www\./, "") : null;
    } catch {
      refHost = null;
    }
    // Our own pages are not the shortener (a reload of this page, say).
    const ownHost = (h.get("host") ?? "").toLowerCase().replace(/^www\./, "");
    if (refHost && refHost === ownHost) refHost = null;
    const elapsed = Math.floor((nowMs() - visit.openedAt.getTime()) / 1000);
    verdict =
      elapsed < task.config.minSeconds
        ? "TOO_FAST"
        : !refHost
          ? "UNKNOWN"
          : hostMatches(refHost, allowedShortenerHosts(task.config))
            ? "OK"
            : "MISMATCH";
    await prisma.taskVisit.updateMany({
      where: { id: visit.id, reachedAt: null },
      data: { reachedAt: new Date(), outcome: "REACHED", verdict, referrerHost: refHost, elapsedSec: elapsed },
    });
  }

  const blocked =
    verdict === "TOO_FAST" ||
    (task.config.onUnknownSource === "block" && (verdict === "UNKNOWN" || verdict === "MISMATCH"));
  if (blocked) {
    return (
      <Shell>
        <p className="text-lg font-bold">We couldn&apos;t confirm this visit</p>
        <p className="mt-2 text-sm text-(--app-ink-2)">
          {verdict === "TOO_FAST"
            ? "You got here faster than the link allows. Go back to the task, press Open link again and go through every step."
            : "You didn't arrive through the task's link. Go back to the task and open the link from there."}
        </p>
        <Link href={`/visit-tasks/${taskId}`} className="mt-4 inline-block rounded-lg bg-(--app-cta) px-4 py-2 text-sm font-bold text-white">
          Back to the task
        </Link>
      </Shell>
    );
  }

  const code = visitCodeFor(taskId, userId);
  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-wider text-(--app-ink-3)">Your code</p>
      <p className="mt-2 select-all font-mono text-3xl font-black tracking-widest">{code}</p>
      <p className="mt-3 text-sm text-(--app-ink-2)">
        Go back to “{task.title}” in RevType and enter this code to get your points. It works only for your account.
      </p>
      {verdict !== "OK" && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          We couldn&apos;t see where you came from, so this claim will be checked by an admin before it pays.
        </p>
      )}
      <Link href={`/visit-tasks/${taskId}`} className="mt-4 inline-block rounded-lg bg-(--app-cta) px-4 py-2 text-sm font-bold text-white">
        Back to the task
      </Link>
    </Shell>
  );
}
