import Link from "next/link";
import { Lock, ArrowUpRight } from "lucide-react";

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
