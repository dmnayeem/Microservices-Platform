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
  className?: string;
}

export function TaskSubmissionRow({
  title,
  status,
  points,
  date,
  rejectionReason,
  adminNote,
  className,
}: TaskSubmissionRowProps) {
  const d = typeof date === "string" ? new Date(date) : date;
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
            status === "REVISION_REQUESTED" && "bg-orange-500/10 text-orange-400"
          )}
        >
          {status.replace(/_/g, " ")}
        </span>
        <span className="text-sm font-bold text-amber-400 tabular-nums shrink-0">
          +{points}
        </span>
      </div>
      {(rejectionReason || adminNote) && (
        <p className="text-xs text-gray-400 mt-1.5 px-2 py-1.5 rounded bg-gray-950">
          {rejectionReason && <strong>{rejectionReason}: </strong>}
          {adminNote}
        </p>
      )}
    </div>
  );
}
