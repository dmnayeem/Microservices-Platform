import Link from "next/link";
import { Lock, ArrowUpRight, ArrowRight } from "lucide-react";

/**
 * Shown when a section is disabled for the user's plan (or an admin per-user
 * override turned it off). Mirrors the hidden nav item with a clear upgrade CTA.
 * When `applyHref` is set, an "Apply for access" CTA is shown too — for creator/
 * seller capabilities a user can request instead of (or besides) upgrading.
 */
export function FeatureLock({
  title,
  applyHref,
}: {
  title: string;
  applyHref?: string;
}) {
  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">{title} is not available</h1>
        <p className="text-sm text-gray-400 mt-1">
          {applyHref
            ? `${title} isn't unlocked for your account yet. Apply for access or upgrade your plan.`
            : `${title} isn't included in your current plan. Upgrade to unlock it.`}
        </p>
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
          {applyHref && (
            <Link
              href={applyHref}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold active:scale-[0.97] transition-transform"
            >
              Apply for access
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
          <Link
            href="/packages"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold active:scale-[0.97] transition-transform"
          >
            View plans
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
