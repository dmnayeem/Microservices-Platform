import type { ReactNode } from "react";

/**
 * One section heading for the whole landing page.
 *
 * Six sections had hand-copied heading markup: the same eyebrow chip in four
 * different hues, `text-3xl sm:text-4xl lg:text-5xl` retyped each time, and a
 * bottom margin that was mb-16 in four places and mb-12 in two. That is why
 * the page read as a stack of unrelated blocks rather than one document — the
 * rhythm changed every time you scrolled past a divider.
 *
 * The eyebrow hues are also the reason the badges were unreadable in dark
 * mode: `text-(--mk-accent)` measures 3.00:1 on the dark marketing band. The
 * `mk-eyebrow` class uses the measured accent pair instead (6.97:1 light,
 * 8.23:1 dark).
 */
export function SectionHeading({
  eyebrow,
  line1,
  line2,
  sub,
  align = "center",
  children,
}: {
  eyebrow?: string;
  line1: string;
  line2?: string;
  sub?: string;
  align?: "center" | "start";
  children?: ReactNode;
}) {
  const centered = align === "center";
  return (
    <div
      className={
        centered
          ? "mk-section-head mk-rise text-center"
          : "mk-section-head mk-rise text-left"
      }
    >
      {eyebrow ? <span className="mk-eyebrow mb-5">{eyebrow}</span> : null}
      <h2 className="mk-h2 text-(--mk-text) mt-0 mb-4">
        {line1}
        {line2 ? (
          <>
            {" "}
            <span className="bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
              {line2}
            </span>
          </>
        ) : null}
      </h2>
      {sub ? (
        <p
          className={
            centered
              ? "mk-lead mk-measure mx-auto"
              : "mk-lead mk-measure"
          }
        >
          {sub}
        </p>
      ) : null}
      {children}
    </div>
  );
}
