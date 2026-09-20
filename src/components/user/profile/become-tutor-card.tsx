"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, ArrowRight, Clock, CheckCircle2, XCircle } from "lucide-react";

interface ApplicationState {
  application: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
    adminNote?: string | null;
  } | null;
  profile: { id: string } | null;
  role: string;
}

export function BecomeTutorCard() {
  const [state, setState] = useState<ApplicationState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tutor/apply", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ApplicationState;
        if (!cancelled) setState(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything while loading, or for users who are already tutors / admins
  if (loading) return null;
  if (!state) return null;
  if (state.role !== "USER" && state.role !== "TUTOR") return null;
  if (state.role === "TUTOR") {
    // Already a tutor — show a tutor-dashboard quick link instead
    return (
      <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-emerald-500/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">You&apos;re a tutor</p>
              <p className="text-xs text-(--app-ink-3) mt-0.5">
                Build courses and earn from enrollments.
              </p>
            </div>
          </div>
          <Link
            href="/tutor/dashboard"
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-300 hover:text-teal-200"
          >
            Open tutor hub <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const app = state.application;
  if (app?.status === "PENDING") {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">
              Tutor application pending
            </p>
            <p className="text-xs text-amber-100/80 mt-0.5">
              Submitted{" "}
              {new Date(app.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              . An admin will review it shortly — you&apos;ll get a notification.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (app?.status === "REJECTED") {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">
              Tutor application not approved
            </p>
            {app.adminNote && (
              <p className="text-xs text-rose-100/80 mt-0.5">
                Reviewer note: {app.adminNote}
              </p>
            )}
            <Link
              href="/profile/become-tutor"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-300 hover:text-rose-200"
            >
              Re-apply <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (app?.status === "APPROVED") {
    // shouldn't normally hit (role flips to TUTOR) but defensive
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Application approved</p>
            <p className="text-xs text-emerald-100/80 mt-0.5">
              Reload the page to access the tutor dashboard.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No application yet — show CTA
  return (
    <div className="rounded-2xl border border-(--app-accent-edge)/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-(--app-cta)/20 text-(--app-accent-ink) flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">
              Become a tutor
            </p>
            <p className="text-xs text-(--app-ink-3) mt-0.5">
              Share what you know, build courses, and earn from every
              enrollment. Apply for tutor status — admin reviews are usually
              quick.
            </p>
          </div>
        </div>
        <Link
          href="/profile/become-tutor"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold whitespace-nowrap"
        >
          Apply <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
