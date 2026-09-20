import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  icon?: React.ReactNode;
  /** Right-aligned actions (buttons, links). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent page/section heading — display-weight title with an optional
 * eyebrow label, giving screens a real typographic hierarchy instead of a bare
 * `text-2xl font-bold`.
 */
export function SectionHeader({
  title,
  eyebrow,
  description,
  icon,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-display flex items-center gap-2 text-2xl text-white">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-1 text-sm text-(--app-ink-3)">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
