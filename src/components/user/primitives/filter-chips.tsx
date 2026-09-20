"use client";

import { cn } from "@/lib/utils";
import { ScrollFadeRow } from "./scroll-fade-row";

export interface FilterChip<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string> {
  options: FilterChip<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  variant?: "pill" | "underline";
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
  variant = "pill",
}: FilterChipsProps<T>) {
  return (
    <ScrollFadeRow
      className={cn("-mx-4", className)}
      innerClassName="flex items-center gap-2 px-4"
      ariaLabel="Filters"
    >
      {options.map((opt) => {
          const active = opt.value === value;
          if (variant === "underline") {
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={cn(
                  "shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-(--app-accent-edge) text-(--app-accent-ink)"
                    : "border-transparent text-(--app-ink-3) hover:text-(--app-ink)"
                )}
              >
                {opt.label}
                {opt.count !== undefined && (
                  <span className="ml-1.5 text-xs text-(--app-ink-3)">
                    {opt.count}
                  </span>
                )}
              </button>
            );
          }
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                active
                  ? "bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white shadow-md shadow-(--app-cta)/25"
                  : "bg-(--app-surface-2) text-(--app-ink-2) border border-(--app-line)/60 hover:bg-(--app-surface-2) hover:text-white"
              )}
            >
              {opt.label}
              {opt.count !== undefined && (
                <span
                  className={cn(
                    "px-1.5 rounded-full text-[10px] tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-(--app-surface) text-(--app-ink-3)"
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
    </ScrollFadeRow>
  );
}
