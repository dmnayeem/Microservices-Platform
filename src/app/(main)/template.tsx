// App Router re-mounts a `template` on every navigation — the idiomatic hook for
// a native-style "screen enters" animation. We fade (no persistent transform) so
// that `position: fixed` overlays inside pages (video player, image zoom) aren't
// re-anchored to a transformed ancestor.
//
// Implemented as a pure-CSS keyframe (`.animate-page-fade` in globals.css, which
// also honours `prefers-reduced-motion`) so framer-motion stays out of the
// shared client bundle. This is a server component now — no "use client" needed.
export default function MainTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-page-fade">{children}</div>;
}
