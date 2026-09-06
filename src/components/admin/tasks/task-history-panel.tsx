"use client";

import { useEffect, useState } from "react";
import { History, Loader2, ShieldAlert } from "lucide-react";
import { TASK_ACTION_LABEL, taskActionTone } from "@/lib/task-audit";

/**
 * Who did what to this task.
 *
 * Admin-only by construction: it is mounted on admin pages and fed by
 * `/api/admin/tasks/[id]/history`, which requires `tasks.view`. Nothing here is
 * ever handed to a user-facing route — which admin edited a task is internal
 * accountability, and a person doing the task has no part in it.
 */

interface HistoryEvent {
  id: string;
  action: string;
  label: string;
  summary: string | null;
  at: string;
  actor: { id: string; name: string | null; role: string } | null;
}

export function TaskHistoryPanel({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/tasks/${taskId}/history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        if (!cancelled) setEvents(d.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <History className="w-4 h-4 text-indigo-400" />
        <h2 className="text-white font-semibold">History</h2>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
          <ShieldAlert className="w-3 h-3" /> Admins only
        </span>
      </div>

      {events === null && !error && (
        <p className="p-5 text-sm text-gray-500 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      )}
      {error && (
        <p className="p-5 text-sm text-gray-500">Couldn&apos;t load the history.</p>
      )}
      {events?.length === 0 && (
        <p className="p-5 text-sm text-gray-500">
          Nothing recorded yet. Tasks created before this was tracked have no
          history — anything done from now on appears here.
        </p>
      )}

      {!!events?.length && (
        <ol className="divide-y divide-gray-800/70">
          {events.map((e) => (
            <li key={e.id} className="px-5 py-3 flex items-start gap-3">
              <span
                className={`shrink-0 px-2 py-1 rounded text-[11px] font-semibold ${taskActionTone(
                  e.action
                )}`}
              >
                {TASK_ACTION_LABEL[e.action] ?? e.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-300">
                  {e.summary || TASK_ACTION_LABEL[e.action] || e.action}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {e.actor ? (
                    <>
                      by <span className="text-gray-300">{e.actor.name}</span>
                      <span className="text-gray-600">
                        {" "}
                        · {e.actor.role.replace(/_/g, " ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-600">by the system</span>
                  )}
                  {" · "}
                  {new Date(e.at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
