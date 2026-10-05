import type { ReactNode } from "react";

/**
 * A titled section on a task page, each kind in its own colour with an icon
 * and a one-line "what this is for" (owner, 2026-10-05): users could not tell
 * the instructions, the pages to open and the keywords apart when every block
 * was the same grey card with a tiny grey label.
 *
 * Colours are literal Tailwind hues on purpose — `indigo` is remapped to the
 * admin's accent, which the submit area already uses. Instructions are sky
 * (task-instructions.tsx); these take the others.
 */
const TONES = {
  violet: {
    card: "border-violet-500/30 bg-violet-500/5",
    icon: "bg-violet-500/15 text-violet-400",
  },
  rose: {
    card: "border-rose-500/30 bg-rose-500/5",
    icon: "bg-rose-500/15 text-rose-400",
  },
  amber: {
    card: "border-amber-500/30 bg-amber-500/5",
    icon: "bg-amber-500/15 text-amber-400",
  },
} as const;

export function TaskSection({
  icon,
  title,
  hint,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${t.card}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.icon}`}>{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-(--app-ink)">{title}</h2>
          {hint && <p className="text-[11px] text-(--app-ink-3)">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
