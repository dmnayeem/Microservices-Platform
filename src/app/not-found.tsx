import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-(--app-page) px-4">
      <div className="text-center max-w-md">
        <p className="text-7xl font-black text-(--app-accent-ink) tabular-nums">404</p>
        <h1 className="mt-4 text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-(--app-ink-3)">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
