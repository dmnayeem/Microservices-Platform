import { cn } from "@/lib/utils";

export type BadgeTone =
  | "brand"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "gold";

const TONE: Record<BadgeTone, string> = {
  brand: "bg-indigo-500/10 text-indigo-300 ring-(--app-accent-edge)/25",
  neutral: "bg-gray-800 text-gray-300 ring-(--app-line-strong)",
  success: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  warning: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  danger: "bg-red-500/10 text-red-300 ring-red-500/25",
  gold: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Small pill/chip with a tinted, ringed look. */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        TONE[tone],
        className
      )}
      {...props}
    />
  );
}
