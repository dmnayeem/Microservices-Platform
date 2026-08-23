// Instant skeleton for a public offer page. It does six sequential reads before
// rendering, and it is usually reached from an ad or a shared link — a visitor
// with no prior context and no patience.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6 animate-pulse">
      <div className="h-56 w-full rounded-xl bg-gray-800/70" />
      <div className="h-8 w-2/3 rounded-lg bg-gray-800" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-gray-800/60" />
        ))}
      </div>
      <div className="h-12 w-48 rounded-lg bg-gray-800" />
    </div>
  );
}
