import Link from "next/link";
import { BrandLockup, BrandMark } from "@/components/providers/brand";

/**
 * The frame a LOGGED-OUT visitor gets around the public catalog pages
 * (marketplace + courses — see `isPublicCatalogPath`). Signed-in users never
 * see this: the (main) layout draws the full app shell for them exactly as
 * before.
 *
 * Deliberately small: no sidebar, no tab bar, no ad slots, no prompts. The
 * same `--app-*` surface as the app, so a visitor who signs in lands on
 * something that looks like what they were already reading.
 */
export function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-(--app-page) text-(--app-ink) flex flex-col">
      <header className="sticky top-0 z-30 border-b border-(--app-line) bg-(--app-page)/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="RevType home" className="shrink-0 inline-flex items-center">
            <BrandLockup area="app">
              <span className="app-icon app-icon-accent h-9 w-9 rounded-(--app-r-control)">
                <BrandMark iconClassName="w-4.5 h-4.5" />
              </span>
            </BrandLockup>
          </Link>
          <nav aria-label="Catalog" className="hidden sm:flex min-w-0 items-center gap-1 text-sm">
            <Link
              href="/marketplace"
              className="rounded-lg px-2 py-2 font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
            >
              Marketplace
            </Link>
            <Link
              href="/courses"
              className="rounded-lg px-2 py-2 font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
            >
              Courses
            </Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-lg px-2.5 text-sm font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center rounded-lg bg-(--app-cta) px-3 text-sm font-semibold text-(--app-on-cta)"
            >
              Join free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

      <footer className="border-t border-(--app-line) bg-(--app-surface)">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-sm text-(--app-ink-3) sm:px-6 lg:px-8">
          <Link href="/marketplace" className="hover:text-(--app-ink)">Marketplace</Link>
          <Link href="/marketplace/section/services" className="hover:text-(--app-ink)">Services</Link>
          <Link href="/courses" className="hover:text-(--app-ink)">Courses</Link>
          <Link href="/about" className="hover:text-(--app-ink)">About</Link>
          <Link href="/help" className="hover:text-(--app-ink)">Help</Link>
          <Link href="/terms" className="hover:text-(--app-ink)">Terms</Link>
          <Link href="/privacy" className="hover:text-(--app-ink)">Privacy</Link>
          <span className="ml-auto">© {new Date().getFullYear()} RevType</span>
        </div>
      </footer>
    </div>
  );
}
