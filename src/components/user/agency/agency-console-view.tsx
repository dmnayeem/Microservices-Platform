"use client";

import { useEffect, useState } from "react";
import { Loader2, EyeOff, Check, ArrowUpRight, Inbox } from "lucide-react";
import { toast } from "@/lib/toast";

type Priority = "URGENT" | "HIGH" | "NORMAL";

interface ReportPreview {
  text: string;
  images: string[];
  isHidden: boolean;
  author: string;
}

interface Report {
  id: string;
  contentType: "POST" | "COMMENT";
  contentId: string;
  reason: string;
  details: string | null;
  priority: Priority;
  createdAt: string;
  preview: ReportPreview | null;
}

const priorityStyles: Record<Priority, string> = {
  URGENT: "bg-red-500/10 text-red-400 ring-red-500/20",
  HIGH: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  NORMAL: "bg-(--app-ink-3)/10 text-(--app-ink-3) ring-(--app-ink-3)/20",
};

export function AgencyConsoleView() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agency/reports");
        if (!res.ok) throw new Error(await res.text());
        const d = await res.json();
        if (!cancelled) setItems(Array.isArray(d.items) ? d.items : []);
      } catch {
        if (!cancelled) toast.error("Failed to load reports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const act = async (
    id: string,
    action: "dismiss" | "hide" | "escalate",
  ) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(await res.text());
      setItems((prev) => prev.filter((r) => r.id !== id));
      toast.success(
        action === "dismiss"
          ? "Report dismissed"
          : action === "hide"
            ? "Content hidden"
            : "Escalated to admin",
      );
    } catch {
      toast.error("Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-white">Agency Console</h1>
        <p className="text-sm text-(--app-ink-3) mt-0.5">
          Review reported content. You can dismiss, hide, or escalate — bans and
          deletions are admin-only.
        </p>
      </div>

      {loading ? (
        <div className="glass rounded-xl p-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-(--app-ink-3) animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-(--app-glyph)" />
          <p className="text-sm text-(--app-ink-3)">No reports to review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ${priorityStyles[r.priority] ?? priorityStyles.NORMAL}`}
                  >
                    {r.priority}
                  </span>
                  <span className="text-xs font-medium text-(--app-ink-2)">
                    {r.contentType}
                  </span>
                  <span className="text-xs text-(--app-ink-3)">· {r.reason}</span>
                </div>

                {r.preview ? (
                  <div className="rounded-lg border border-(--app-line) bg-(--app-page) p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-(--app-ink-2)">
                        {r.preview.author}
                      </span>
                      {r.preview.isHidden && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--app-surface-2)/60 text-(--app-ink-2)">
                          hidden
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-(--app-ink-3) line-clamp-3">
                      {r.preview.text}
                    </p>
                    {r.preview.images.length > 0 && (
                      <p className="text-[11px] text-(--app-ink-3) mt-1">
                        {r.preview.images.length} attached image
                        {r.preview.images.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-(--app-ink-3) italic">
                    Preview unavailable (content may be deleted).
                  </p>
                )}

                {r.details && (
                  <p className="text-xs text-(--app-ink-3)">
                    <span className="text-(--app-ink-3)">Reporter note:</span>{" "}
                    {r.details}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => act(r.id, "dismiss")}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-(--app-line) bg-(--app-page) text-(--app-ink-2) text-xs font-semibold hover:border-(--app-line) disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Dismiss
                  </button>
                  <button
                    onClick={() => act(r.id, "hide")}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 text-xs font-semibold hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                    Hide content
                  </button>
                  <button
                    onClick={() => act(r.id, "escalate")}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/10 text-red-400 ring-1 ring-red-500/20 text-xs font-semibold hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    )}
                    Escalate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
