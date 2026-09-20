import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-14 px-6",
        className
      )}
    >
      {/* A single flat circle reads as "something failed to load". Two
          concentric rings plus a tinted plate read as a deliberate state — the
          difference between a blank screen and a finished one. */}
      <div className="relative mb-5 flex items-center justify-center">
        <span
          aria-hidden
          className="absolute w-24 h-24 rounded-full border border-(--app-line)"
        />
        <span
          aria-hidden
          className="absolute w-[4.5rem] h-[4.5rem] rounded-full border border-(--app-line)/70"
        />
        <span className="relative w-14 h-14 rounded-2xl bg-(--app-surface-2) border border-(--app-line) flex items-center justify-center">
          <Icon className="w-7 h-7 text-(--app-ink-3)" />
        </span>
      </div>
      <h3 className="text-[0.9375rem] font-semibold text-white tracking-tight mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-sm leading-relaxed text-(--app-ink-3) max-w-[28ch] mb-5">
          {description}
        </p>
      )}
      {action &&
        (action.href ? (
          <a
            href={action.href}
            className="press inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold transition-colors"
          >
            {action.label}
          </a>
        ) : (
          <button
            onClick={action.onClick}
            className="press inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold transition-colors"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
