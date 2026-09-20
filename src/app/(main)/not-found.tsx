import Link from "next/link";

export default function MainNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-black text-(--app-accent-ink) tabular-nums">404</p>
        <h1 className="mt-4 text-xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-(--app-ink-3) text-sm">
          This page doesn&apos;t exist. Head back to your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex px-5 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
