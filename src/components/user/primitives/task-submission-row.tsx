import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * One row in a task-type view's "submitted / approved / rejected" list. Shared
 * across all task-type views (article/video/quiz/social/proxy/board) so the
 * submission list looks identical everywhere instead of being hand-rolled ~6×.
 */
export interface TaskSubmissionRowProps {
  title: string;
  status: string;
  points: number;
  /** ISO string or Date. */
  date: string | Date;
  rejectionReason?: string | null;
  adminNote?: string | null;
  /** Admin marking (0–100). */
  score?: number | null;
  /** Points deducted as a penalty on rejection. */
  penaltyPoints?: number | null;
  /** When the admin asked for a redo, link to reopen the task. */
  redoHref?: string;
  className?: string;
}

export function TaskSubmissionRow({
  title,
  status,
  points,
  date,
  rejectionReason,
  adminNote,
  score,
  penaltyPoints,
  redoHref,
  className,
}: TaskSubmissionRowProps) {
  const d = typeof date === "string" ? new Date(date) : date;
  const isRevision = status === "REVISION_REQUESTED";
  return (
    <div className={cn("card p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          <p className="text-[11px] text-gray-500">{format(d, "PP p")}</p>
        </div>
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[11px] font-bold uppercase shrink-0",
            status === "PENDING" && "bg-amber-500/10 text-amber-400",
            (status === "APPROVED" || status === "AUTO_APPROVED") &&
              "bg-emerald-500/10 text-emerald-400",
            status === "REJECTED" && "bg-red-500/10 text-red-400",
            isRevision && "bg-orange-500/10 text-orange-400"
          )}
        >
          {isRevision ? "Needs changes" : status.replace(/_/g, " ")}
        </span>
        <span className="text-sm font-bold text-amber-400 tabular-nums shrink-0">
          +{points}
        </span>
      </div>
      {(score != null || (penaltyPoints ?? 0) > 0) && (
        <div className="flex items-center gap-2 mt-1.5">
          {score != null && (
            <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 rounded px-1.5 py-0.5">
              Marks: {score}/100
            </span>
          )}
          {(penaltyPoints ?? 0) > 0 && (
            <span className="text-[11px] font-bold text-red-300 bg-red-500/10 rounded px-1.5 py-0.5">
              −{penaltyPoints} pts penalty
            </span>
          )}
        </div>
      )}
      {(rejectionReason || adminNote) && (
        <p className="text-xs text-gray-400 mt-1.5 px-2 py-1.5 rounded bg-gray-950 whitespace-pre-line">
          {rejectionReason && <strong>{rejectionReason}: </strong>}
          {adminNote}
        </p>
      )}
      {isRevision && redoHref && (
        <Link
          href={redoHref}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Redo task
        </Link>
      )}
    </div>
  );
}
