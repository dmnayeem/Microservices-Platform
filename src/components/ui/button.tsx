"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { haptic } from "@/lib/haptics";

// Meaningful action variants get a light tap haptic (native feel); quiet
// variants (ghost/link/outline) don't, to avoid buzzing on every minor tap.
const HAPTIC_VARIANTS = new Set(["primary", "danger", "success", "gold"]);

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-page) disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-linear-to-br from-(--app-grad-a) to-(--app-grad-b) text-white shadow-lg shadow-(--app-cta)/25 hover:shadow-(--app-cta)/35 hover:brightness-110 hover:-translate-y-0.5 focus-visible:ring-(--app-accent-edge)",
        secondary:
          "bg-(--app-surface-2) text-white hover:bg-(--app-surface-2) border border-(--app-line) shadow-sm",
        outline:
          "border border-(--app-line) bg-transparent text-white hover:bg-(--app-surface-2) hover:border-(--app-line)",
        ghost:
          "text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2)",
        danger:
          "bg-red-500 text-white shadow-lg shadow-red-600/20 hover:bg-red-600 hover:-translate-y-0.5 focus-visible:ring-red-500",
        success:
          "bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-600 hover:-translate-y-0.5 focus-visible:ring-emerald-500",
        gold: "bg-linear-to-br from-amber-400 to-yellow-600 text-(--app-on-bright) shadow-lg shadow-amber-500/25 hover:brightness-110 hover:-translate-y-0.5 focus-visible:ring-amber-500",
        link: "text-(--app-accent-ink) underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        onClick={(e) => {
          if (HAPTIC_VARIANTS.has(variant ?? "primary")) haptic("light");
          onClick?.(e);
        }}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : leftIcon ? (
          leftIcon
        ) : null}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
