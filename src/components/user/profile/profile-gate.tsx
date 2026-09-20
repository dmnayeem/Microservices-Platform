import Link from "next/link";
import { Lock, Circle, ChevronRight, UserCog } from "lucide-react";
import type { RequiredProgress } from "@/lib/profile-completion";

/**
 * Locked screen shown on Tasks / Daily Mission when the admin requires a
 * complete profile and the user hasn't filled the core essentials yet.
 * Presentational + server-friendly (only Links).
 */
export function ProfileGate({
  progress,
  surface = "this",
}: {
  progress: RequiredProgress;
  surface?: string;
}) {
  const { done, total, percentage } = progress;
  const circumference = Math.PI * 84;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>

        <h1 className="text-lg font-bold text-white">Complete your profile</h1>
        <p className="text-sm text-(--app-ink-3) mt-1">
          Finish your profile to unlock {surface}. It only takes a minute.
        </p>

        {/* Progress ring */}
        <div className="relative w-28 h-28 mx-auto my-5">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              className="fill-none stroke-gray-800"
              strokeWidth="9"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              className="fill-none stroke-amber-400 transition-[stroke-dashoffset]"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percentage / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-white tabular-nums leading-none">
              {percentage}%
            </span>
            <span className="text-[11px] text-(--app-ink-3) mt-0.5">
              {done}/{total} done
            </span>
          </div>
        </div>

        {/* Missing essentials */}
        {progress.missing.length > 0 && (
          <div className="space-y-1.5 text-left mb-5">
            <p className="text-[11px] uppercase tracking-wider text-(--app-ink-3) font-bold px-1">
              Still needed
            </p>
            {progress.missing.map((it) => (
              <Link
                key={it.key}
                href={it.href}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-(--app-page) border border-(--app-line) hover:border-amber-500/40 transition-colors"
              >
                <Circle className="w-3.5 h-3.5 text-(--app-glyph) shrink-0" />
                <span className="text-sm text-(--app-ink-2) flex-1 min-w-0 truncate">
                  {it.label}
                </span>
                <ChevronRight className="w-4 h-4 text-(--app-glyph)" />
              </Link>
            ))}
          </div>
        )}

        <Link
          href="/profile?tab=personal"
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-sm font-bold active:scale-[0.97] transition-transform"
        >
          <UserCog className="w-4 h-4" />
          Complete profile
        </Link>
      </div>
    </div>
  );
}
