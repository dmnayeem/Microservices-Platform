"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, ArrowUpRight, ShieldAlert, RefreshCw, Loader2 } from "lucide-react";
import { recheckAdblock } from "@/lib/adblock";

/**
 * Shown when a task-start is blocked because the user has used up their daily
 * mission allowance for that task type (server returns code "UPGRADE_REQUIRED").
 * Mirrors FeatureLock's look but shows the dynamic server message + an upgrade
 * CTA to /packages.
 */
export function TaskUpgradeNotice({
  message,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={`max-w-md mx-auto px-4 py-10 ${className}`}>
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">Daily limit reached</h1>
        <p className="text-sm text-gray-400 mt-1">
          {message ||
            "You've done all your daily-mission tasks for today. Upgrade your plan to do more."}
        </p>
        <Link
          href="/packages"
          className="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-linear-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold active:scale-[0.97] transition-transform"
        >
          Upgrade plan
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

/** True when an API error payload signals the daily-mission upgrade gate. */
export function isUpgradeRequired(json: unknown): boolean {
  return (
    !!json &&
    typeof json === "object" &&
    (json as { code?: string }).code === "UPGRADE_REQUIRED"
  );
}

/**
 * Shown when a task-start is blocked because an earlier task in the sequential
 * chain isn't done yet (server returns code "TASK_LOCKED"). No CTA — the user
 * just needs to finish the previous task.
 */
export function TaskLockedNotice({
  message,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={`max-w-md mx-auto px-4 py-10 ${className}`}>
      <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-indigo-400" />
        </div>
        <h1 className="text-lg font-bold text-white">Task locked</h1>
        <p className="text-sm text-gray-400 mt-1">
          {message ||
            "Complete the previous task first to unlock this one."}
        </p>
        <Link
          href="/tasks"
          className="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold transition-colors"
        >
          Back to tasks
        </Link>
      </div>
    </div>
  );
}

/** True when an API error payload signals the sequential-unlock lock. */
export function isTaskLocked(json: unknown): boolean {
  return (
    !!json &&
    typeof json === "object" &&
    (json as { code?: string }).code === "TASK_LOCKED"
  );
}

/**
 * Shown on a task page when an ad blocker is detected (the task-open guard
 * refused to start it). Re-check re-runs detection and reloads the page when the
 * blocker is off, so the task starts normally.
 */
export function AdblockNotice({ className = "" }: { className?: string }) {
  const [checking, setChecking] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);

  const onRecheck = async () => {
    setChecking(true);
    setStillBlocked(false);
    const clear = await recheckAdblock();
    if (clear) {
      window.location.reload();
      return;
    }
    setChecking(false);
    setStillBlocked(true);
  };

  return (
    <div className={`max-w-md mx-auto px-4 py-10 ${className}`}>
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">Ad blocker detected</h1>
        <p className="text-sm text-gray-400 mt-1">
          Please turn off your ad blocker (or anti-adblock extension) to open
          this task, then re-check.
        </p>
        {stillBlocked && (
          <p className="text-xs text-amber-300 mt-2">
            Still detected — make sure it&apos;s fully disabled for this site.
          </p>
        )}
        <button
          onClick={onRecheck}
          disabled={checking}
          className="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-linear-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
        >
          {checking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {checking ? "Checking…" : "I've turned it off — Re-check"}
        </button>
      </div>
    </div>
  );
}
