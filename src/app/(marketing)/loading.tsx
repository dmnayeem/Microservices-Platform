// Instant skeleton for the public marketing pages.
//
// These are the first thing a visitor sees, and they read landing content from
// the database, so a slow read meant a blank white page with no indication
// anything was happening.
export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-4">
          <div className="h-10 w-3/4 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="h-5 w-1/2 rounded bg-gray-200/70 dark:bg-gray-800/70" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900" />
      </div>
    </div>
  );
}
