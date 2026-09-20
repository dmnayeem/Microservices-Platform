import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + brand ring for clickable cards. */
  interactive?: boolean;
  /** Frosted-glass surface instead of the solid `card` fill. */
  glass?: boolean;
  /** Inner padding preset. */
  padding?: "none" | "sm" | "md" | "lg";
}

const PAD: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

/**
 * Premium surface card — uses the `card` utility (real elevation + hairline
 * border + subtle top highlight) defined in globals.css. Replaces the flat
 * `bg-(--app-surface) border border-(--app-line) rounded-xl` pattern.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, glass, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        glass ? "glass" : "card",
        interactive && (glass ? "glass-hover cursor-pointer" : "card-interactive cursor-pointer"),
        PAD[padding],
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";
