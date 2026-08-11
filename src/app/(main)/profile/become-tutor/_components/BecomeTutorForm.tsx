"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Loader2, Plus, X, Send, Upload, Image as ImageIcon } from "lucide-react";

export function BecomeTutorForm() {
  const router = useRouter();
  const [bio, setBio] = useState("");
  const [expertise, setExpertise] = useState<string[]>([]);
  const [expertiseDraft, setExpertiseDraft] = useState("");
  const [sampleOutline, setSampleOutline] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [idDocumentUrl, setIdDocumentUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addExpertise = () => {
    const v = expertiseDraft.trim();
    if (!v) return;
    if (expertise.includes(v)) {
      setExpertiseDraft("");
      return;
    }
    if (expertise.length >= 10) {
      toast.error("Maximum 10 expertise tags");
      return;
    }
    setExpertise([...expertise, v]);
    setExpertiseDraft("");
  };

  const removeExpertise = (v: string) =>
    setExpertise(expertise.filter((e) => e !== v));

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("fileType", file.type.startsWith("image/") ? "IMAGE" : "DOCUMENT");
      form.append("folder", "tutor-applications");
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const url = d.media?.cloudFrontUrl || d.media?.s3Url || d.media?.url || d.url;
      if (!url) throw new Error("Upload succeeded but no URL was returned");
      setIdDocumentUrl(url);
      toast.success("ID uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (bio.trim().length < 50) {
      toast.error("Bio must be at least 50 characters");
      return;
    }
    if (expertise.length === 0) {
      toast.error("Add at least one expertise tag");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tutor/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio,
          expertise,
          sampleOutline: sampleOutline || null,
          portfolioUrl: portfolioUrl || null,
          idDocumentUrl: idDocumentUrl || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Application submitted — admins will review it shortly.");
      router.refresh();
    } catch (err) {
      toast.error("Submission failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold text-white">About you</h2>
          <p className="text-xs text-slate-400">
            Who you are, what you teach, why students should trust you. At least 50 characters.
          </p>
        </div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={5}
          maxLength={2000}
          className={inputCls + " resize-none"}
          placeholder="e.g. 10-year full-stack engineer, former Google, taught 8k students on YouTube. Will teach React + system design."
        />
        <p className="text-[11px] text-slate-500 tabular-nums">
          {bio.length} / 2000
        </p>
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold text-white">Expertise tags</h2>
          <p className="text-xs text-slate-400">
            Up to 10 topics or skills you can teach. Add one at a time.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={expertiseDraft}
            onChange={(e) => setExpertiseDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExpertise();
              }
            }}
            maxLength={60}
            className={inputCls + " flex-1"}
            placeholder="React, Python, Trading, Forex…"
          />
          <button
            type="button"
            onClick={addExpertise}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
        {expertise.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {expertise.map((e) => (
              <span
                key={e}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-medium"
              >
                {e}
                <button
                  type="button"
                  onClick={() => removeExpertise(e)}
                  className="text-indigo-300/70 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold text-white">Sample course outline</h2>
          <p className="text-xs text-slate-400">
            Optional. A rough table of contents for the first course you&apos;d like to publish.
          </p>
        </div>
        <textarea
          value={sampleOutline}
          onChange={(e) => setSampleOutline(e.target.value)}
          rows={5}
          maxLength={4000}
          className={inputCls + " resize-none"}
          placeholder={`Module 1 — Intro\n  - Lesson 1: …\n  - Lesson 2: …\nModule 2 — Core\n  - Lesson 1: …`}
        />
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold text-white">Proof & credibility</h2>
          <p className="text-xs text-slate-400">
            Optional but speeds up review. Link to existing work and upload a
            government ID so admins can verify identity.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Portfolio / YouTube / GitHub URL
            </span>
            <input
              type="url"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              className={inputCls}
              placeholder="https://…"
            />
          </label>
          <div>
            <span className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Government ID (image / PDF)
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {idDocumentUrl ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-700 text-xs">
                <ImageIcon className="w-4 h-4 text-emerald-300" />
                <span className="text-slate-300 truncate flex-1">{idDocumentUrl}</span>
                <button
                  type="button"
                  onClick={() => setIdDocumentUrl("")}
                  className="text-slate-500 hover:text-rose-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-300 text-xs disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? "Uploading…" : "Upload ID"}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit application
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";
