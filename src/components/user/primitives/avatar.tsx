import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SmartImage } from "./smart-image";

/**
 * Shared avatar primitive: a fixed-size rounded box that shows a user image
 * (via `SmartImage`, so arbitrary hosts stay `unoptimized` and never throw) or a
 * fallback — an initial letter, an icon, or an empty coloured block. Replaces
 * ~40 hand-rolled avatar sites so size/shape/fallback stay consistent.
 *
 * `size` accepts a px number (the common case → `w/h` + `sizes="Npx"`) OR a
 * Tailwind class string for the two responsive profile headers
 * (`"w-28 h-28 sm:w-32 sm:h-32"`). The fallback initial's text-size is derived
 * from a numeric `size` so small chips and big headers render identically.
 */

type AvatarShape = "circle" | "rounded";
type AvatarFallbackStyle = "gradient" | "solid-gray" | "solid-slate";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  /** px number, or a Tailwind size class string for responsive headers. */
  size: number | string;
  shape?: AvatarShape;
  /** Fallback text source — first char is upper-cased. */
  name?: string | null;
  /** Pre-derived fallback text; overrides `name`. */
  fallbackText?: string;
  /** Fallback icon (e.g. a group icon) when there's no image or name. */
  fallbackIcon?: ReactNode;
  fallbackStyle?: AvatarFallbackStyle;
  /** Escape hatch for one-off themed fallback backgrounds. */
  fallbackClassName?: string;
  priority?: boolean;
  /** Override the auto-derived `sizes` (numeric size only). */
  sizes?: string;
  className?: string;
}

const FALLBACK_BG: Record<AvatarFallbackStyle, string> = {
  gradient: "bg-linear-to-br from-indigo-500 to-purple-600",
  "solid-gray": "bg-gray-700",
  "solid-slate": "bg-slate-800",
};

/** Map a numeric px size to a proportional fallback text-size class. */
function initialTextClass(px: number): string {
  if (px <= 20) return "text-[10px]";
  if (px <= 28) return "text-xs";
  if (px <= 40) return "text-sm";
  if (px <= 48) return "text-base";
  if (px <= 64) return "text-xl";
  if (px <= 96) return "text-2xl";
  return "text-4xl";
}

export function Avatar({
  src,
  alt = "",
  size,
  shape = "circle",
  name,
  fallbackText,
  fallbackIcon,
  fallbackStyle = "gradient",
  fallbackClassName,
  priority,
  sizes,
  className,
}: AvatarProps) {
  const numeric = typeof size === "number";
  const radius = shape === "rounded" ? "rounded-2xl" : "rounded-full";

  const initial =
    fallbackText ??
    (name ? name.charAt(0).toUpperCase() : undefined);

  const box = cn(
    "relative overflow-hidden flex items-center justify-center text-white font-medium",
    // Numeric sizes use inline style (dynamic Tailwind arbitrary values aren't
    // JIT-scannable); responsive header sizes come in as a literal class string.
    !numeric && (size as string),
    radius,
    // Only paint the fallback background when there's no image.
    !src && (fallbackClassName ?? FALLBACK_BG[fallbackStyle]),
    !src && numeric && initialTextClass(size as number),
    className
  );

  return (
    <div
      className={box}
      style={numeric ? { width: size, height: size } : undefined}
    >
      {src ? (
        <SmartImage
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? (numeric ? `${size}px` : undefined)}
          priority={priority}
          className="object-cover"
        />
      ) : (
        initial ?? fallbackIcon ?? null
      )}
    </div>
  );
}
