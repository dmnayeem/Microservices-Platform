// Instant skeleton for every /tutor route.
//
// This tree had none. `tutor/layout.tsx` awaits the session plus an RBAC check
// before it renders anything, and the course pages each do several sequential
// reads on top — so a click on "Courses" showed the previous page, frozen, until
// all of that finished. Without a `loading.tsx` there is no boundary for React
// to show a fallback at, so the navigation simply appears not to have happened.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-gray-800" />
        <div className="h-4 w-72 rounded bg-gray-800/70" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-gray-800 bg-gray-900"
          />
        ))}
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3"
        >
          <div className="h-32 w-full rounded-lg bg-gray-800/70" />
          <div className="h-4 w-2/3 rounded bg-gray-800" />
          <div className="h-3 w-1/3 rounded bg-gray-800/70" />
        </div>
      ))}
    </div>
  );
}
