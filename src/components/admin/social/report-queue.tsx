"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  Flag,
  ExternalLink,
  Loader2,
  EyeOff,
  Eye,
  Trash2,
  AlertTriangle,
  Ban,
  Clock,
  X,
  Layers,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/user/primitives/smart-image";
import {
  allowedResolutions,
  CONTENT_TYPE_LABEL,
  REASON_LABEL,
  PRIORITY_LABEL,
  RESOLUTION_LABEL,
  type ReportResolution,
} from "@/lib/moderation";
import type { ReportPreview } from "@/lib/report-previews";

export interface QueueItem {
  id: string;
  contentType: string;
  contentId: string;
  reason: string;
  details: string | null;
  priority: string;
  status: string;
  resolution: string | null;
  resolverNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string } | null;
  preview: ReportPreview | null;
  /** Other pending reports about the same content. */
  alsoReported: number;
}

const ACTION_META: Record<
  ReportResolution,
  { label: string; icon: typeof Flag; tone: string; danger?: boolean }
> = {
  DISMISSED: { label: "Dismiss", icon: X, tone: "text-slate-300 hover:bg-slate-700" },
  WARNED: { label: "Warn author", icon: AlertTriangle, tone: "text-amber-300 hover:bg-amber-500/10" },
  HIDDEN: { label: "Hide", icon: EyeOff, tone: "text-orange-300 hover:bg-orange-500/10" },
  DELETED: { label: "Delete", icon: Trash2, tone: "text-red-300 hover:bg-red-500/10", danger: true },
  SUSPENDED: { label: "Suspend author", icon: Clock, tone: "text-orange-300 hover:bg-orange-500/10", danger: true },
  BANNED: { label: "Ban author", icon: Ban, tone: "text-red-300 hover:bg-red-500/10", danger: true },
};

export function ReportQueue({
  items,
  canAct,
  status,
}: {
  items: QueueItem[];
  canAct: boolean;
  status: string;
}) {
  if (items.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
        <Flag className="w-12 h-12 mx-auto mb-4 text-slate-600" />
        <h3 className="text-lg font-medium text-white mb-1">
          {status === "PENDING" ? "Nothing waiting" : "No resolved reports"}
        </h3>
        <p className="text-sm text-slate-400">
          {status === "PENDING"
            ? "Reports appear here when users flag content."
            : "Reports you've actioned will be listed here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ReportCard key={item.id} item={item} canAct={canAct} />
      ))}
    </div>
  );
}

function ReportCard({ item, canAct }: { item: QueueItem; canAct: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [applyToAll, setApplyToAll] = useState(item.alsoReported > 0);

  const urgent = item.priority === "URGENT";
  const preview = item.preview;
  const actions = allowedResolutions(item.contentType);

  const apply = async (resolution: ReportResolution) => {
    const meta = ACTION_META[resolution];
    if (meta.danger) {
      const who = preview?.author?.name ?? "this user";
      const ok = await confirmDialog({
        title: `${meta.label}?`,
        description:
          resolution === "DELETED"
            ? item.contentType === "COMMENT"
              ? "The comment and every reply under it will be removed. This can't be undone."
              : "This content will be removed permanently. Hiding it instead is reversible."
            : `${who}'s account will be ${resolution === "BANNED" ? "banned" : "suspended"}.`,
        tone: "danger",
        confirmLabel: meta.label,
      });
      if (!ok) return;
    }

    setBusy(resolution);
    try {
      const res = await fetch(`/api/admin/social-reports/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution,
          resolverNote: note.trim() || undefined,
          applyToAll,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't apply that");
      const extras: string[] = [];
      if (d.resolved > 1) extras.push(`${d.resolved} reports closed`);
      if (d.extraRemoved > 0) extras.push(`${d.extraRemoved} replies removed`);
      toast.success(RESOLUTION_LABEL[resolution], {
        description: extras.join(" · ") || undefined,
      });
      router.refresh();
    } catch (err) {
      toast.error("Nothing was changed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy("restore");
    try {
      const res = await fetch(`/api/admin/social-reports/${item.id}`, {
        method: "PUT",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't restore");
      toast.success("Content restored");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't restore", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border-l-4 border bg-slate-900 p-4",
        urgent
          ? "border-l-red-500 border-red-500/25 bg-red-500/5"
          : "border-l-slate-700 border-slate-800"
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300">
          {CONTENT_TYPE_LABEL[item.contentType] ?? item.contentType}
        </span>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-[11px] font-bold",
            urgent ? "bg-red-500/15 text-red-300" : "bg-slate-800 text-slate-400"
          )}
        >
          {PRIORITY_LABEL[item.priority] ?? item.priority}
        </span>
        <span className="text-sm text-white font-medium">
          {REASON_LABEL[item.reason] ?? item.reason}
        </span>
        {item.alsoReported > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300">
            <Layers className="w-3 h-3" />
            {item.alsoReported + 1} reports on this
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-500">
          {format(new Date(item.createdAt), "MMM d, HH:mm")}
        </span>
      </div>

      {/* THE CONTENT — this is what the page never showed. */}
      {preview?.found ? (
        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            {preview.author?.avatar && (
              <div className="relative w-6 h-6 rounded-full overflow-hidden bg-slate-800 shrink-0">
                <SmartImage
                  src={preview.author.avatar}
                  alt={preview.author.name}
                  fill
                  sizes="24px"
                  className="object-cover"
                />
              </div>
            )}
            <span className="text-xs text-slate-300">
              {preview.author ? (
                <Link
                  href={`/admin/users/${preview.author.id}`}
                  className="hover:text-white"
                >
                  {preview.author.name}
                  {preview.author.username && (
                    <span className="text-slate-500"> @{preview.author.username}</span>
                  )}
                </Link>
              ) : (
                "Unknown author"
              )}
            </span>
            {preview.hidden && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/15 text-orange-300">
                Already hidden
              </span>
            )}
            {preview.href && (
              <Link
                href={preview.href}
                target="_blank"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
              >
                Open <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {preview.text && (
            <p className="text-sm text-slate-200 whitespace-pre-wrap line-clamp-6">
              {preview.text}
            </p>
          )}
          {preview.images.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {preview.images.slice(0, 4).map((src, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-lg overflow-hidden bg-slate-800"
                >
                  <SmartImage
                    src={src}
                    alt={`Reported image ${i + 1}`}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
              ))}
              {preview.images.length > 4 && (
                <span className="text-[11px] text-slate-500 self-end">
                  +{preview.images.length - 4} more
                </span>
              )}
            </div>
          )}
          {preview.meta && (
            <p className="text-[11px] text-slate-500 mt-2">{preview.meta}</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 mb-3">
          <p className="text-sm text-slate-400">
            This content no longer exists — it was deleted, or it&apos;s a type
            with no moderation view. Dismiss the report.
          </p>
          <p className="text-[11px] text-slate-600 font-mono mt-1">
            {item.contentType} · {item.contentId}
          </p>
        </div>
      )}

      {item.details && (
        <p className="text-xs text-slate-400 mb-3 italic">
          Reporter said: &ldquo;{item.details}&rdquo;
        </p>
      )}
      <p className="text-[11px] text-slate-500 mb-3">
        Reported by{" "}
        {item.reporter ? (
          <Link
            href={`/admin/users/${item.reporter.id}`}
            className="text-slate-400 hover:text-white"
          >
            {item.reporter.name}
          </Link>
        ) : (
          "a deleted account"
        )}
      </p>

      {/* Actions */}
      {item.status === "PENDING" && canAct && (
        <div className="space-y-2">
          {item.alsoReported > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              Apply to all {item.alsoReported + 1} reports about this content
            </label>
          )}

          {showNote ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Note for the record — included in the message to the author."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <button
              onClick={() => setShowNote(true)}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              + Add a note
            </button>
          )}

          <div className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const meta = ACTION_META[a];
              const Icon = meta.icon;
              return (
                <button
                  key={a}
                  onClick={() => apply(a)}
                  disabled={busy !== null}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50",
                    meta.tone
                  )}
                >
                  {busy === a ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {item.status === "RESOLVED" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldDot resolution={item.resolution} />
            {item.resolution
              ? RESOLUTION_LABEL[item.resolution] ?? item.resolution
              : "Resolved"}
            {item.resolvedAt && (
              <span className="text-slate-600">
                · {format(new Date(item.resolvedAt), "MMM d")}
              </span>
            )}
          </span>
          {item.resolverNote && (
            <span className="text-slate-500 italic">
              &ldquo;{item.resolverNote}&rdquo;
            </span>
          )}
          {/* Hiding is the reversible action; until now nothing in the codebase
              could un-hide anything. */}
          {item.resolution === "HIDDEN" && canAct && (
            <button
              onClick={restore}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {busy === "restore" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Undo2 className="w-3.5 h-3.5" />
              )}
              Restore
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ShieldDot({ resolution }: { resolution: string | null }) {
  const tone =
    resolution === "DISMISSED"
      ? "bg-slate-500"
      : resolution === "HIDDEN"
        ? "bg-orange-400"
        : resolution === "WARNED"
          ? "bg-amber-400"
          : "bg-red-400";
  return <span className={cn("w-1.5 h-1.5 rounded-full", tone)} />;
}

export { Eye };
