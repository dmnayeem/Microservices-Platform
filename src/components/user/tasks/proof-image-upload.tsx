"use client";

import { useRef, useState } from "react";
import { Loader2, X, Upload } from "lucide-react";
import { toast } from "@/lib/toast";
import { compressForUpload } from "@/lib/image-compress";

interface Props {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

const MAX_MB = 5;

/**
 * Mobile-first proof screenshot input. Lets the user pick/capture an image from
 * their phone (uploaded to S3 via /api/upload, folder "task-proofs"), with a
 * "paste URL" fallback. Value is the resulting public URL string.
 */
export function ProofImageUpload({ value, onChange, placeholder }: Props) {
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`Image must be under ${MAX_MB} MB`);
      return;
    }
    setBusy(true);
    try {
      const out = await compressForUpload(f, "task-proofs");
      const fd = new FormData();
      fd.append("file", out);
      fd.append("folder", "task-proofs");
      const res = await fetch("/api/upload", { method: "PUT", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error ?? `HTTP ${res.status}`);
      onChange(d.url as string);
      toast.success("Screenshot uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="proof"
            className="w-full max-w-[220px] rounded-lg border border-(--app-line) object-cover bg-(--app-page)"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
            aria-label="Remove screenshot"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-(--app-line) bg-(--app-surface-2) text-sm text-(--app-ink-2) hover:border-(--app-accent-edge) disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {busy ? "Uploading…" : "Upload screenshot"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => setShowUrl((v) => !v)}
        className="text-[11px] text-(--app-ink-3) hover:text-(--app-ink-2)"
      >
        {showUrl ? "Hide URL option" : "or paste a URL"}
      </button>

      {showUrl && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "https://..."}
          className="w-full px-3 py-2 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
        />
      )}
    </div>
  );
}
