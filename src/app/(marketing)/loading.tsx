// Instant skeleton for the public marketing pages.
//
// These are the first thing a visitor sees, and they read landing content from
// the database, so a slow read meant a blank page with no indication anything
// was happening.
//
// It used to paint `bg-(--mk-surface-2) dark:bg-(--mk-surface-2)`. Nothing in this app sets
// Tailwind's `dark:` condition — the marketing surface is driven by
// `data-mk-theme` on #mk-root and the app by `html[data-theme]` — so on a
// machine whose OS is in light mode the skeleton drew light-grey blocks over
// the dark marketing page. It now uses the same --mk-* tokens as the content
// it stands in for, so it is right in both themes, and its shape matches what
// arrives: a heading, a lead line, a card row, a panel.
export default function Loading() {
  return (
    <div className="mk-section px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="space-y-4">
          <div className="h-6 w-28 rounded-full bg-(--mk-accent-soft)" />
          <div className="h-11 w-3/4 rounded-xl bg-(--mk-surface-2)" />
          <div className="h-5 w-1/2 rounded-lg bg-(--mk-surface-2)" />
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-2xl border border-(--mk-border) bg-(--mk-surface)"
            />
          ))}
        </div>
        <div className="mt-4 h-64 rounded-2xl border border-(--mk-border) bg-(--mk-surface)" />
      </div>
    </div>
  );
}
