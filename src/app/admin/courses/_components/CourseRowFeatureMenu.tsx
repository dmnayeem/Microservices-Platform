"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Loader2,
  Star,
  Megaphone,
  ShieldOff,
  ShieldCheck,
  MoreHorizontal,
} from "lucide-react";

interface Props {
  courseId: string;
  isFeatured: boolean;
  isPromoted: boolean;
  status: string;
}

export function CourseRowFeatureMenu({
  courseId,
  isFeatured,
  isPromoted,
  status,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const patch = async (
    key: "feature" | "promote" | "suspend" | "reinstate",
    body: Record<string, unknown>
  ) => {
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/feature`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Saved");
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
        title="More"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MoreHorizontal className="w-4 h-4" />
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
            aria-label="Close"
          />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 text-xs">
            <MenuItem
              icon={<Star className={`w-3.5 h-3.5 ${isFeatured ? "fill-amber-300 text-amber-300" : "text-amber-300"}`} />}
              label={isFeatured ? "Un-feature" : "Feature"}
              onClick={() => patch("feature", { isFeatured: !isFeatured })}
            />
            <MenuItem
              icon={<Megaphone className="w-3.5 h-3.5 text-indigo-300" />}
              label={isPromoted ? "Un-promote" : "Promote"}
              onClick={() => patch("promote", { isPromoted: !isPromoted })}
            />
            <div className="border-t border-slate-800 my-1" />
            {status === "PUBLISHED" ? (
              <MenuItem
                icon={<ShieldOff className="w-3.5 h-3.5 text-rose-300" />}
                label="Suspend course"
                onClick={() => patch("suspend", { action: "suspend" })}
                tone="rose"
              />
            ) : (
              <MenuItem
                icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />}
                label="Reinstate course"
                onClick={() => patch("reinstate", { action: "reinstate" })}
                tone="emerald"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "rose" | "emerald";
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-300 hover:bg-rose-500/10"
      : tone === "emerald"
      ? "text-emerald-300 hover:bg-emerald-500/10"
      : "text-slate-200 hover:bg-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full inline-flex items-center gap-2 px-3 py-2 text-left font-bold ${toneCls}`}
    >
      {icon}
      {label}
    </button>
  );
}
