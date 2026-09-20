import Link from "next/link";
import { Wrench } from "lucide-react";

/**
 * What a signed-in, non-staff user sees while maintenance mode is on.
 *
 * Deliberately not a redirect to a `/maintenance` route: a redirect leaves the
 * user on a URL they can leave by pressing Back, and every deep link in the app
 * would need its own guard. Replacing the shell's children closes the whole
 * authenticated app in one place.
 */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--app-page) px-4">
      <div className="w-full max-w-md rounded-2xl border border-(--app-line) bg-(--app-surface) p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
          <Wrench className="h-7 w-7 text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold text-white">
          We&rsquo;ll be back shortly
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-(--app-ink-3)">{message}</p>
        <p className="mt-6 text-xs text-(--app-ink-3)">
          Your balance and any tasks in progress are unaffected.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-(--app-line) px-4 py-2 text-sm font-medium text-(--app-ink-2) hover:bg-(--app-surface-2)"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
