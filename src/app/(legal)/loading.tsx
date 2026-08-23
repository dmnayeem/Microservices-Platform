// Instant skeleton for the legal pages (terms, privacy, refunds).
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-4 animate-pulse">
      <div className="h-8 w-1/2 rounded-lg bg-gray-800" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-4 w-full rounded bg-gray-800/60" />
      ))}
    </div>
  );
}
