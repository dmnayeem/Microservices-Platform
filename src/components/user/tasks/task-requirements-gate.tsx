"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, BellRing, Check, Loader2, MoreVertical, Plus, Share, Smartphone, UserRound, X } from "lucide-react";
import { isStandaloneApp } from "@/lib/standalone";
import { subscribeToPush } from "@/lib/push-client";
import { TASK_REQUIREMENTS_EVENT, type TaskNeed } from "@/lib/task-device-shared";

/**
 * "Do this first" popup for a task the admin marked app-only and/or
 * notifications-on (lib/task-device-gate.ts). Opens only when a task start was
 * refused for that reason, so a user who already meets the requirements never
 * sees it. Listens for the event providers/balance-sync.tsx fires.
 */

const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1));

export function TaskRequirementsGate() {
  const [needs, setNeeds] = useState<TaskNeed[] | null>(null);
  // For a "profile" need: how far along it is and what is still missing.
  const [profile, setProfile] = useState<{ percentage: number; missing: { label: string; href: string }[] } | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [pushState, setPushState] = useState<"idle" | "working" | "on" | "denied" | "failed">("idle");
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ needs?: string[]; profile?: unknown; kycStatus?: string }>).detail;
      const n = (detail?.needs ?? []).filter(
        (x): x is TaskNeed => x === "app" || x === "push" || x === "profile" || x === "kyc"
      );
      if (n.length === 0) return;
      setNeeds(n);
      setProfile((detail?.profile as typeof profile) ?? null);
      setKycStatus(detail?.kycStatus ?? null);
      setPushState("idle");
      setCanInstall(!!window.__egBip);
    };
    window.addEventListener(TASK_REQUIREMENTS_EVENT, open);
    return () => window.removeEventListener(TASK_REQUIREMENTS_EVENT, open);
  }, []);

  if (!needs) return null;

  const needApp = needs.includes("app");
  const needPush = needs.includes("push");
  const needProfile = needs.includes("profile");
  const needKyc = needs.includes("kyc");
  // In the browser the push step is pointless before the app step: the app is
  // its own device and asks for permission on its own.
  const inApp = isStandaloneApp();

  const turnOnPush = async () => {
    setPushState("working");
    try {
      if (typeof Notification === "undefined") return setPushState("failed");
      const result = await Notification.requestPermission();
      if (result !== "granted") return setPushState(result === "denied" ? "denied" : "failed");
      if (!(await subscribeToPush())) return setPushState("failed");
      // The account-level switch too — a device subscription with push turned
      // off in Settings would still deliver nothing.
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushNotifications: true }),
      }).catch(() => {});
      setPushState("on");
    } catch {
      setPushState("failed");
    }
  };

  const install = async () => {
    const ev = window.__egBip;
    if (!ev) return;
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      /* ignore */
    }
    window.__egBip = null;
    setCanInstall(false);
  };

  const step = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--app-surface-2) text-(--app-ink) font-semibold";
  // Profile and KYC are finished on their own pages, not in this popup.
  const done = (!needApp || inApp) && (!needPush || pushState === "on") && !needProfile && !needKyc;
  const asked = [
    needApp && "in the RevType app",
    needPush && "with notifications turned on",
    needProfile && "with a 100% complete profile",
    needKyc && "after your ID (KYC) is verified",
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-(--app-accent-edge)/40 bg-(--app-surface) p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Before you start this task</p>
            <p className="text-xs text-(--app-ink-2) mt-0.5">
              This task is only available {asked.join(", ")}.
            </p>
          </div>
          <button
            onClick={() => setNeeds(null)}
            className="p-1.5 rounded-lg text-(--app-ink-3) hover:text-(--app-ink) hover:bg-white/10 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="mt-3 space-y-3">
          {needApp && !inApp && (
            <li className="rounded-xl bg-(--app-surface-2)/60 p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Smartphone className="w-4 h-4 text-sky-400" /> Open the RevType app
              </p>
              <p className="mt-1 text-xs text-(--app-ink-2)">
                Already installed? Open RevType from your home screen and start the task there.
              </p>
              {canInstall ? (
                <button
                  onClick={install}
                  className="mt-2 w-full py-2 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-xs font-bold hover:opacity-90"
                >
                  Install the app
                </button>
              ) : isIos() ? (
                <p className="mt-2 text-xs text-(--app-ink-2) leading-6">
                  Not installed yet? In Safari tap <span className={step}><Share className="w-3 h-3" /> Share</span> then{" "}
                  <span className={step}><Plus className="w-3 h-3" /> Add to Home Screen</span>.
                </p>
              ) : (
                <p className="mt-2 text-xs text-(--app-ink-2) leading-6">
                  Not installed yet? Tap the browser menu <span className={step}><MoreVertical className="w-3 h-3" /></span> then{" "}
                  <span className={step}>Install app</span> (or <span className={step}>Add to Home screen</span>).
                </p>
              )}
            </li>
          )}

          {needPush && (!needApp || inApp) && (
            <li className="rounded-xl bg-(--app-surface-2)/60 p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <BellRing className="w-4 h-4 text-amber-400" /> Turn on notifications
              </p>
              {pushState === "on" ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Check className="w-4 h-4" /> Notifications are on
                </p>
              ) : (
                <>
                  <button
                    onClick={turnOnPush}
                    disabled={pushState === "working"}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-xs font-bold hover:opacity-90 disabled:opacity-60"
                  >
                    {pushState === "working" && <Loader2 className="w-4 h-4 animate-spin" />} Turn on notifications
                  </button>
                  {pushState === "denied" && (
                    <p className="mt-2 text-xs text-rose-300">
                      Notifications are blocked. Allow them for RevType in your phone or browser settings, then try again.
                    </p>
                  )}
                  {pushState === "failed" && (
                    <p className="mt-2 text-xs text-rose-300">Couldn&apos;t turn them on. Try again in a moment.</p>
                  )}
                </>
              )}
            </li>
          )}
          {needProfile && (
            <li className="rounded-xl bg-(--app-surface-2)/60 p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <UserRound className="w-4 h-4 text-emerald-400" /> Complete your profile to 100%
              </p>
              {profile && (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${profile.percentage}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-(--app-ink-2)">Now {profile.percentage}%. Still to do:</p>
                  <ul className="mt-1 space-y-1">
                    {profile.missing.slice(0, 6).map((m) => (
                      <li key={m.label}>
                        <Link href={m.href} onClick={() => setNeeds(null)} className="text-xs font-semibold text-(--app-accent-ink) hover:underline">
                          + {m.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Link
                href="/profile"
                onClick={() => setNeeds(null)}
                className="mt-2 block w-full rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) py-2 text-center text-xs font-bold text-white hover:opacity-90"
              >
                Open my profile
              </Link>
            </li>
          )}

          {needKyc && (
            <li className="rounded-xl bg-(--app-surface-2)/60 p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <BadgeCheck className="w-4 h-4 text-sky-400" /> Verify your ID (KYC)
              </p>
              <p className="mt-1 text-xs text-(--app-ink-2)">
                {kycStatus === "PENDING"
                  ? "Your ID is being checked. You can start this task as soon as it is approved."
                  : kycStatus === "REJECTED"
                    ? "Your last ID check was not approved. Send it again with clear photos and details that match your profile."
                    : "Send your ID once. The details must match your profile exactly."}
              </p>
              {kycStatus !== "PENDING" && (
                <Link
                  href="/kyc"
                  onClick={() => setNeeds(null)}
                  className="mt-2 block w-full rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) py-2 text-center text-xs font-bold text-white hover:opacity-90"
                >
                  Verify my ID
                </Link>
              )}
            </li>
          )}
        </ol>

        {done && (
          <button
            onClick={() => window.location.reload()}
            className="mt-3 w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500"
          >
            Start the task
          </button>
        )}
      </div>
    </div>
  );
}
