"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Loader2, Send } from "lucide-react";

export function AnnouncementComposer({
  courseId,
  enrolledCount,
}: {
  courseId: string;
  enrolledCount: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || title.trim().length < 3) {
      toast.error("Title is required (min 3 chars)");
      return;
    }
    if (!body.trim() || body.trim().length < 10) {
      toast.error("Body is required (min 10 chars)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tutor/courses/${courseId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(`Sent to ${d.notifiedCount ?? enrolledCount} student(s)`);
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err) {
      toast.error("Failed to send", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={140}
        placeholder="Title"
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="What do you want to tell your students?"
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Will notify {enrolledCount} enrolled student{enrolledCount === 1 ? "" : "s"}.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Send announcement
        </button>
      </div>
    </div>
  );
}
