"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  Send,
  Paperclip,
  X,
} from "lucide-react";
import { CardSkeleton } from "@/components/user/primitives/skeleton";

interface AssignmentField {
  id: string;
  type: "TEXT" | "TEXTAREA" | "LINK" | "NUMBER" | "FILE" | "IMAGE";
  label: string;
  required: boolean;
  hint?: string;
}

interface AssignmentPayload {
  id: string;
  title: string;
  instructions: string;
  maxMarks: number;
  fields: AssignmentField[];
  submission: {
    id: string;
    status: "PENDING" | "GRADED" | "RESUBMIT";
    marks: number | null;
    feedback: string | null;
    answers: Record<string, unknown>;
    fileUrls: string[];
  } | null;
}

interface Props {
  courseId: string;
  assignmentId: string;
  onSubmitted: () => void;
}

export function AssignmentSubmitter({
  courseId,
  assignmentId,
  onSubmitted,
}: Props) {
  const [payload, setPayload] = useState<AssignmentPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/courses/${courseId}/assignments/${assignmentId}`,
          { cache: "no-store" }
        );
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        const p = d.assignment as AssignmentPayload;
        setPayload(p);
        if (p.submission) {
          setAnswers(
            Object.fromEntries(
              Object.entries(p.submission.answers ?? {}).map(([k, v]) => [
                k,
                String(v ?? ""),
              ])
            )
          );
          setFileUrls(p.submission.fileUrls ?? []);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, assignmentId]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("fileType", file.type.startsWith("image/") ? "IMAGE" : "DOCUMENT");
      form.append("folder", "assignment-submissions");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const url = d.media?.cloudFrontUrl || d.media?.s3Url || d.media?.url || d.url;
      if (!url) throw new Error("Upload returned no URL");
      setFileUrls((prev) => [...prev, url]);
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!payload) return;
    for (const f of payload.fields) {
      if (f.required && !answers[f.id]?.toString().trim()) {
        toast.error(`"${f.label}" is required`);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/courses/${courseId}/assignments/${assignmentId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, fileUrls }),
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Assignment submitted");
      onSubmitted();
      setPayload((p) => (p ? { ...p, submission: d.submission } : p));
    } catch (err) {
      toast.error("Submit failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/40 rounded-2xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-300 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-rose-100">
            Couldn&apos;t load the assignment
          </p>
          <p className="text-sm text-rose-200/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const isGraded = payload.submission?.status === "GRADED";

  return (
    <div className="space-y-3">
      <header className="bg-gray-900 rounded-2xl border border-amber-500/30 p-5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[10px] font-bold uppercase tracking-wider">
          <ClipboardList className="w-3 h-3" /> Assignment
        </span>
        <h1 className="text-xl font-bold text-white mt-2">{payload.title}</h1>
        <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">
          {payload.instructions}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Max marks: {payload.maxMarks}
        </p>
      </header>

      {isGraded && payload.submission && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-bold text-white">
            Graded: {payload.submission.marks} / {payload.maxMarks}
          </p>
          {payload.submission.feedback && (
            <p className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">
              {payload.submission.feedback}
            </p>
          )}
        </div>
      )}

      <div className="card p-5 space-y-4">
        {payload.fields.map((f) => (
          <div key={f.id}>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              {f.label}
              {f.required && <span className="text-rose-400 ml-1">*</span>}
            </label>
            {f.type === "TEXTAREA" ? (
              <textarea
                value={answers[f.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                rows={4}
                disabled={isGraded}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 resize-y"
              />
            ) : (
              <input
                type={
                  f.type === "NUMBER"
                    ? "number"
                    : f.type === "LINK"
                    ? "url"
                    : "text"
                }
                value={answers[f.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                disabled={isGraded}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
              />
            )}
            {f.hint && (
              <p className="text-[11px] text-gray-500 mt-1">{f.hint}</p>
            )}
          </div>
        ))}

        {/* Optional attachments — separate from typed fields */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
            Attachments
          </label>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/*,application/pdf,application/zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <div className="space-y-1.5">
            {fileUrls.map((u, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-lg bg-gray-950 border border-gray-700 text-xs"
              >
                <Paperclip className="w-3.5 h-3.5 text-amber-300" />
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-300 truncate flex-1 hover:underline"
                >
                  {u}
                </a>
                {!isGraded && (
                  <button
                    type="button"
                    onClick={() =>
                      setFileUrls((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-gray-500 hover:text-rose-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {!isGraded && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-700 hover:border-amber-500 text-gray-400 hover:text-amber-300 text-xs disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
                {uploading ? "Uploading…" : "Attach a file"}
              </button>
            )}
          </div>
        </div>
      </div>

      {!isGraded && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {payload.submission ? "Resubmit" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}
