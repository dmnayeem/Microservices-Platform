"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  error?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, disabled, ...props }, ref) => {
    return (
      <div className="space-y-1">
        <label
          className={cn(
            "flex items-start gap-3 cursor-pointer",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              ref={ref}
              disabled={disabled}
              className="peer sr-only"
              {...props}
            />
            <div
              className={cn(
                "h-5 w-5 rounded border-2 transition-all duration-200",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-(--app-accent-edge)/20 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-gray-950",
                "peer-checked:border-indigo-500 peer-checked:bg-indigo-500",
                error
                  ? "border-red-500"
                  : "border-gray-600",
                className
              )}
            />
            <Check className="absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
          </div>
          {label && (
            <span className="text-sm text-gray-400 leading-tight">
              {label}
            </span>
          )}
        </label>
        {error && (
          <p className="text-sm text-red-500 ml-8">{error}</p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
