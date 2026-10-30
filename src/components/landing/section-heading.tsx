import type { ReactNode } from "react";

/**
 * One section heading for the whole landing page.
 *
 * 2026-10-30: the centred pill eyebrow over a gradient-clipped second line was
 * the single most "generated" pattern on the page, repeated in every section.
 * It is now the same editorial heading the feature pages use (marketing kit,
 * globals.css "mkx"): a small ruled label, the title in solid ink with its
 * second half in the muted ink, and the supporting sentence beside it on a
 * desktop instead of under it.
 *
 *  - "split" (default): title left, sub right from `lg`.
 *  - "stack": everything in one left column — for a heading that sits in a
 *    narrow column of its own (the FAQ).
 *  - "center": kept for pages that still centre a heading.
 */
export function SectionHeading({
  eyebrow,
  line1,
  line2,
  sub,
  align = "split",
  as: Tag = "h2",
  id,
  children,
}: {
  eyebrow?: string;
  line1: string;
  line2?: string;
  sub?: string;
  align?: "split" | "stack" | "center" | "start";
  /** "h1" when this is the page's own title (e.g. /pricing). Same look. */
  as?: "h1" | "h2";
  id?: string;
  children?: ReactNode;
}) {
  const title = (
    <Tag id={id} className="mkx-h2 mt-4">
      {line1}
      {line2 ? <span className="text-(--mk-subtle)"> {line2}</span> : null}
    </Tag>
  );
  const label = eyebrow ? <p className="mkx-kicker">{eyebrow}</p> : null;

  if (align === "center") {
    return (
      <div className="mkx-head mkx-reveal mx-auto max-w-3xl text-center">
        {label}
        {title}
        {sub ? <p className="mkx-lead mx-auto mt-5 max-w-2xl">{sub}</p> : null}
        {children}
      </div>
    );
  }

  if (align === "stack" || align === "start") {
    return (
      <div className="mkx-head mkx-reveal">
        {label}
        {title}
        {sub ? <p className="mkx-lead mt-5 max-w-2xl">{sub}</p> : null}
        {children}
      </div>
    );
  }

  return (
    <div className="mkx-head mkx-reveal grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-10">
      <div className="lg:col-span-7">
        {label}
        {title}
      </div>
      {sub ? <p className="mkx-lead lg:col-span-5">{sub}</p> : null}
      {children ? <div className="lg:col-span-12">{children}</div> : null}
    </div>
  );
}
