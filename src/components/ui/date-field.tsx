"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Date / date-time input with a calendar button that actually opens something.
 *
 * The app is dark-first, so the browser's own picker indicator was painted as a
 * near-invisible dark glyph — and that ~16px glyph is the only part of a native
 * date input that opens a picker. Users saw "a calendar icon" and clicking it
 * did nothing. Firefox on desktop draws no indicator at all.
 *
 * So the button here is ours, and it opens our own calendar on every browser.
 * The underlying element is still a real `<input type="date">`, which keeps
 * typing, form validation, `min`/`max` and the native OS picker on mobile.
 *
 * The value is the input's own string format — `YYYY-MM-DD` or
 * `YYYY-MM-DDTHH:mm` — so this is a drop-in swap for the plain inputs it
 * replaces. Use `toDateInputValue()` to convert an ISO string from an API.
 */

export type DateFieldType = "date" | "datetime-local";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO string / Date → the string a date or datetime-local input expects. */
export function toDateInputValue(
  v: string | Date | null | undefined,
  type: DateFieldType = "date"
): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return type === "date"
    ? day
    : `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseValue(value: string, type: DateFieldType): Date | undefined {
  if (!value) return undefined;
  // Parse the parts by hand: `new Date("2026-08-21")` is treated as UTC and can
  // land on the previous day for anyone west of Greenwich.
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return undefined;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    type === "datetime-local" ? Number(m[4] ?? 0) : 0,
    type === "datetime-local" ? Number(m[5] ?? 0) : 0
  );
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function timePart(value: string): string {
  const m = value.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "00:00";
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  type?: DateFieldType;
  /** Applied to the input, so each form keeps its own styling. */
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
}

export function DateField({
  value,
  onChange,
  type = "date",
  className,
  min,
  max,
  disabled,
  required,
  id,
  name,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = parseValue(value, type);

  // Close on outside click or Escape — a popover you can't dismiss is worse
  // than no popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = useCallback(
    (day: Date | undefined) => {
      if (!day) return;
      const base = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
      if (type === "date") {
        onChange(base);
        setOpen(false);
        return;
      }
      // Keep whatever time was already set; default to 00:00 for a fresh value.
      onChange(`${base}T${timePart(value)}`);
    },
    [onChange, type, value]
  );

  const setTime = (t: string) => {
    const base = value.slice(0, 10) || toDateInputValue(new Date(), "date");
    onChange(`${base}T${t || "00:00"}`);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        id={id}
        name={name}
        aria-label={ariaLabel}
        className={cn(className, "pr-10")}
      />
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setMonth(selected ?? new Date());
          setOpen((v) => !v);
        }}
        disabled={disabled}
        aria-label="Open calendar"
        aria-expanded={open}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <CalendarDays className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-2">
          <DayPicker
            mode="single"
            selected={selected}
            month={month}
            onMonthChange={setMonth}
            onSelect={pick}
            captionLayout="dropdown"
            startMonth={new Date(new Date().getFullYear() - 100, 0)}
            endMonth={new Date(new Date().getFullYear() + 10, 11)}
            disabled={[
              ...(min ? [{ before: parseValue(min, type) ?? new Date(0) }] : []),
              ...(max ? [{ after: parseValue(max, type) ?? new Date(0) }] : []),
            ]}
            className="rdp-dark"
            style={
              {
                "--rdp-accent-color": "#6366f1",
                "--rdp-accent-background-color": "rgba(99,102,241,0.25)",
                "--rdp-today-color": "#818cf8",
                "--rdp-day-height": "2.1rem",
                "--rdp-day-width": "2.1rem",
              } as React.CSSProperties
            }
          />
          {type === "datetime-local" && (
            <div className="flex items-center gap-2 px-2 pt-2 border-t border-gray-800">
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                Time
              </label>
              <input
                type="time"
                value={timePart(value)}
                onChange={(e) => setTime(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-md bg-gray-950 border border-gray-700 text-white text-sm"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
