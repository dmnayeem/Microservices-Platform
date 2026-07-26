"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { USERNAME_REGEX } from "@/lib/username";
import { inp } from "./profile-view.constants";

export function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "amber" | "emerald" | "purple";
}) {
  const tones = {
    indigo: "text-indigo-400 bg-indigo-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    purple: "text-purple-400 bg-purple-500/10",
  } as const;
  return (
    <div className="glass p-3 flex items-center gap-3">
      <div className={cn("p-2 rounded-lg", tones[tone])}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-base font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function InfoRow({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-500 mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{label}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
          {sub}
        </p>
      </div>
    </div>
  );
}

export function DataLine({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
        {label}
      </p>
      <p className="text-sm text-white mt-0.5 inline-flex items-center gap-1.5">
        {icon}
        {value || <span className="text-gray-600 italic">—</span>}
      </p>
    </div>
  );
}

export function VerifTile({
  icon,
  label,
  ok,
  pending,
  rejected,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  pending?: boolean;
  rejected?: boolean;
  action: { label: string; href: string } | null;
}) {
  const status = ok
    ? { tone: "border-emerald-500/30 bg-emerald-500/10", color: "text-emerald-400", text: "Verified" }
    : pending
    ? { tone: "border-amber-500/30 bg-amber-500/10", color: "text-amber-400", text: "Pending" }
    : rejected
    ? { tone: "border-red-500/30 bg-red-500/10", color: "text-red-400", text: "Rejected" }
    : { tone: "border-gray-700 bg-gray-950", color: "text-gray-400", text: "Not set" };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border",
        status.tone
      )}
    >
      <div className={cn("p-1.5 rounded-md bg-black/20", status.color)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white">{label}</p>
        <p className={cn("text-[11px] font-semibold", status.color)}>
          {status.text}
        </p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 whitespace-nowrap"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

export function CompletionRing({ percentage }: { percentage: number }) {
  const ringColor =
    percentage >= 90
      ? "stroke-emerald-400"
      : percentage >= 60
      ? "stroke-amber-400"
      : "stroke-indigo-400";
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" className="fill-none stroke-gray-800" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r="42"
          className={cn("fill-none transition-[stroke-dashoffset]", ringColor)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={Math.PI * 84}
          strokeDashoffset={Math.PI * 84 * (1 - percentage / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-extrabold text-white tabular-nums">{percentage}%</span>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

/**
 * Username handle field with a leading "@", live availability check and a
 * preview of the resulting profile link. Setting a handle makes the user's
 * profile reachable at /u/<username> (the /u/[id] page redirects id → handle).
 */
export function UsernameField({
  value,
  onChange,
  currentUsername,
}: {
  value: string;
  onChange: (v: string) => void;
  currentUsername: string | null;
}) {
  const clean = value.replace(/^@+/, "").trim();
  const isCurrent =
    !!currentUsername && clean.toLowerCase() === currentUsername.toLowerCase();
  const formatValid = USERNAME_REGEX.test(clean);
  const needsRemote = !!clean && !isCurrent && formatValid;

  // Availability result, tagged with the handle it belongs to so a stale
  // response never shows against a newer input.
  const [remote, setRemote] = useState<{ u: string; available: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!needsRemote) return;
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/profile/username-available?u=${encodeURIComponent(clean)}`
        );
        const d = await r.json();
        if (!cancel) setRemote({ u: clean, available: !!d.available });
      } catch {
        /* leave prior state; treat as unknown */
      }
    }, 450);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [clean, needsRemote]);

  // Derive the display status synchronously (no setState-in-effect).
  const status: "idle" | "current" | "invalid" | "checking" | "available" | "taken" =
    !clean
      ? "idle"
      : isCurrent
        ? "current"
        : !formatValid
          ? "invalid"
          : remote && remote.u === clean
            ? remote.available
              ? "available"
              : "taken"
            : "checking";

  return (
    <Field label="Username">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
          @
        </span>
        <input
          value={clean}
          onChange={(e) =>
            onChange(e.target.value.replace(/^@+/, "").replace(/\s+/g, ""))
          }
          placeholder="yourname"
          maxLength={30}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(inp, "pl-7 pr-9")}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === "checking" && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          )}
          {(status === "available" || status === "current") && (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          {(status === "taken" || status === "invalid") && (
            <X className="w-4 h-4 text-rose-400" />
          )}
        </span>
      </div>
      {status === "invalid" ? (
        <p className="mt-1 text-[11px] text-rose-400">
          3-30 characters: letters, numbers, dot, underscore or hyphen.
        </p>
      ) : status === "taken" ? (
        <p className="mt-1 text-[11px] text-rose-400">
          This username is already taken.
        </p>
      ) : clean.trim() ? (
        <p className="mt-1 text-[11px] text-gray-400">
          {status === "available" ? "Available — " : ""}Profile link:{" "}
          <span className="text-indigo-300">/u/{clean.trim()}</span>
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-gray-500">
          Pick a public @handle — this becomes your profile link (/u/yourname).
        </p>
      )}
    </Field>
  );
}

export function Card({
  title,
  icon,
  tone,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "indigo" | "purple" | "amber" | "emerald" | "rose" | "sky";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones: Record<NonNullable<typeof tone>, string> = {
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    sky: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };
  return (
    <div className="glass glass-hover p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center border shrink-0",
                tone ? tones[tone] : "bg-gray-800 text-gray-400 border-gray-700"
              )}
            >
              {icon}
            </div>
          )}
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-gray-800 border-gray-600 text-indigo-500"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </label>
  );
}

export function Modal({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose?: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-strong rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
