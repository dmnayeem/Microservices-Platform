"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Image as ImageIcon,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";

interface AppealUser {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
}

interface AppealDocument {
  id: string;
  documentType: string;
  documentUrl: string;
  rejectionReason: string | null;
  status: string;
}

interface Appeal {
  id: string;
  userId: string;
  user: AppealUser | null;
  kycDocumentId: string;
  kycDocument: AppealDocument | null;
  reason: string;
  evidence: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

type FilterKey = typeof STATUS_FILTERS[number]["value"];

export function KycAppealsList({ canReview }: { canReview: boolean }) {
  const router = useRouter();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    appeal: Appeal;
    action: "approve" | "reject";
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/admin/users/kyc/appeals");
      const d = await res.json();
      setAppeals(d.appeals ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    if (!reviewing) return;
    if (reviewing.action === "reject" && !adminNote.trim()) {
      toast.error("Rejection requires a note explaining why");
      return;
    }
    setBusyId(reviewing.appeal.id);
    try {
      const res = await fetch(
        `/api/admin/users/kyc/appeals/${reviewing.appeal.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: reviewing.action,
            adminNote: adminNote || undefined,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        reviewing.action === "approve"
          ? "Appeal approved · KYC restored to APPROVED"
          : "Appeal rejected"
      );
      setReviewing(null);
      setAdminNote("");
      void load();
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = filter === "ALL"
    ? appeals
    : appeals.filter((a) => a.status === filter);

  const counts = {
    PENDING: appeals.filter((a) => a.status === "PENDING").length,
    APPROVED: appeals.filter((a) => a.status === "APPROVED").length,
    REJECTED: appeals.filter((a) => a.status === "REJECTED").length,
  };

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-2 text-slate-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading appeals…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const isActive = filter === f.value;
          const count =
            f.value === "ALL" ? appeals.length : counts[f.value];
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                isActive
                  ? "bg-blue-500/15 text-white border-blue-500/40"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-blue-500 text-white"
                    : "bg-slate-800 text-slate-300"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
          <BadgeCheck className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-base font-medium text-white">No appeals</p>
          <p className="text-sm text-slate-500 mt-1">
            {filter === "PENDING"
              ? "All appeals have been reviewed."
              : "No appeals match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AppealCard
              key={a.id}
              appeal={a}
              canReview={canReview && a.status === "PENDING"}
              busy={busyId === a.id}
              onAction={(action) => {
                setReviewing({ appeal: a, action });
                setAdminNote("");
              }}
            />
          ))}
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  reviewing.action === "approve"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                )}
              >
                {reviewing.action === "approve" ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-white">
                  {reviewing.action === "approve"
                    ? "Approve appeal?"
                    : "Reject appeal?"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {reviewing.action === "approve"
                    ? "User's KYC will be restored to APPROVED status."
                    : "User stays in REJECTED status. Provide a clear reason so they understand."}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Admin note{" "}
                {reviewing.action === "reject" && (
                  <span className="text-red-400">*</span>
                )}
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                disabled={busyId !== null}
                placeholder={
                  reviewing.action === "approve"
                    ? "Optional context — shown to the user."
                    : "Required — explain why so the user can re-submit correctly."
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setReviewing(null)}
                disabled={busyId !== null}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busyId !== null}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50",
                  reviewing.action === "approve"
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-red-500 hover:bg-red-600"
                )}
              >
                {busyId !== null ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : reviewing.action === "approve" ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Confirm{" "}
                {reviewing.action === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Appeal Card
// ─────────────────────────────────────────────────────────────────────────────

function AppealCard({
  appeal,
  canReview,
  busy,
  onAction,
}: {
  appeal: Appeal;
  canReview: boolean;
  busy: boolean;
  onAction: (action: "approve" | "reject") => void;
}) {
  const tone =
    appeal.status === "PENDING"
      ? "border-amber-500/30 bg-amber-500/5"
      : appeal.status === "APPROVED"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-red-500/30 bg-red-500/5";
  const statusBadge =
    appeal.status === "PENDING"
      ? "bg-amber-500/20 text-amber-400"
      : appeal.status === "APPROVED"
        ? "bg-emerald-500/20 text-emerald-400"
        : "bg-red-500/20 text-red-400";
  const StatusIcon =
    appeal.status === "PENDING"
      ? Clock
      : appeal.status === "APPROVED"
        ? CheckCircle
        : XCircle;

  return (
    <div className={cn("rounded-xl border p-4", tone)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {(appeal.user?.name ?? appeal.user?.email ?? "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {appeal.user?.name ?? appeal.user?.email ?? "Unknown user"}
            </p>
            {appeal.user?.email && (
              <p className="text-[11px] text-slate-500 truncate">
                {appeal.user.email}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
            statusBadge
          )}
        >
          <StatusIcon className="w-3 h-3" />
          {appeal.status}
        </span>
      </div>

      {/* Original rejection */}
      {appeal.kycDocument && (
        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 mb-3 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-bold">
              Original {appeal.kycDocument.documentType}
            </span>
          </div>
          {appeal.kycDocument.rejectionReason && (
            <p className="text-xs text-red-300 mt-1">
              <strong>Rejected:</strong>{" "}
              {appeal.kycDocument.rejectionReason}
            </p>
          )}
          {appeal.kycDocument.documentUrl && (
            <div className="mt-2">
              <ImageZoomGallery
                images={[appeal.kycDocument.documentUrl]}
                size={64}
              />
            </div>
          )}
        </div>
      )}

      {/* Appeal reason */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
          User&apos;s appeal reason
        </p>
        <p className="text-sm text-slate-200 whitespace-pre-wrap">
          {appeal.reason}
        </p>
      </div>

      {/* Evidence */}
      {appeal.evidence.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />
            Additional evidence ({appeal.evidence.length})
          </p>
          <ImageZoomGallery images={appeal.evidence} size={64} />
        </div>
      )}

      {/* Admin note (if reviewed) */}
      {appeal.adminNote && appeal.status !== "PENDING" && (
        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5 mb-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">
            Admin note
          </p>
          <p className="text-slate-200">{appeal.adminNote}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Submitted{" "}
          {formatDistanceToNow(new Date(appeal.createdAt), {
            addSuffix: true,
          })}
        </span>
        {appeal.reviewedAt && (
          <span>Reviewed {format(new Date(appeal.reviewedAt), "PP")}</span>
        )}
      </div>

      {canReview && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800">
          <button
            onClick={() => onAction("approve")}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={() => onAction("reject")}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
