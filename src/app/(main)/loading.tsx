// Content-shaped skeleton shown instantly on navigation so a click never feels
// hung. Applies to every (main) route while its server segment loads.
export default function Loading() {
  return (
    // Full-bleed to match the real pages — a max-w-3xl skeleton made the layout
    // visibly jump width on every navigation.
    <div className="space-y-4 animate-pulse">
      {/* Title bar */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-gray-800" />
        <div className="h-4 w-64 rounded bg-gray-800/70" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-gray-800 bg-gray-900" />
        ))}
      </div>

      {/* Card placeholders */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-gray-800" />
              <div className="h-3 w-1/4 rounded bg-gray-800/70" />
            </div>
          </div>
          <div className="h-3.5 w-full rounded bg-gray-800/70" />
          <div className="h-3.5 w-5/6 rounded bg-gray-800/70" />
        </div>
      ))}
    </div>
  );
}
