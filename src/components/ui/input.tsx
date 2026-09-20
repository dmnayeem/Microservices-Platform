"use client";

import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, AlertCircle } from "lucide-react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-(--app-ink-2)">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--app-ink-3)">
              {leftIcon}
            </div>
          )}
          <input
            type={isPassword && showPassword ? "text" : type}
            className={cn(
              "app-field",
              "focus:border-(--app-cta) focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                : "border-(--app-line) hover:border-(--app-line)",
              leftIcon && "pl-10",
              (rightIcon || isPassword) && "pr-10",
              className
            )}
            ref={ref}
            disabled={disabled}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-ink-3) hover:text-(--app-ink-3) transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          )}
          {!isPassword && rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-ink-3)">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="flex items-center gap-1 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-sm text-(--app-ink-3)">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
