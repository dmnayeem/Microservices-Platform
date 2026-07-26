"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { inp } from "./profile-view.constants";
import { Modal } from "./profile-ui";

export function PhotoModal({
  target,
  currentUrl,
  onClose,
  onSaved,
}: {
  target: "avatar" | "coverPhoto";
  currentUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Build preview from selected File
  useEffect(() => {
    if (!file) return;
    const obj = URL.createObjectURL(file);
    setPreviewUrl(obj);
    return () => URL.revokeObjectURL(obj);
  }, [file]);

  const handleFileSelect = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB");
      return;
    }
    setFile(f);
    setUrlInput("");
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const uploadFile = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("target", target);
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(target === "avatar" ? "Profile photo updated" : "Cover photo updated");
      onSaved();
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = async () => {
    if (!urlInput.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [target]: urlInput.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!(await confirmDialog({ title: `Remove ${target === "avatar" ? "profile photo" : "cover photo"}?`, tone: "danger", confirmLabel: "Remove" }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [target]: null }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Removed");
      onSaved();
    } catch (err) {
      toast.error("Couldn't remove", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={busy ? undefined : onClose}
      title={target === "avatar" ? "Update Profile Photo" : "Update Cover Photo"}
      subtitle="Upload from your device, or paste a public image URL"
    >
      <div className="space-y-4">
        {previewUrl && (
          <div
            className={cn(
              "rounded-lg overflow-hidden border border-gray-800 bg-gray-950",
              target === "avatar"
                ? "w-32 h-32 mx-auto rounded-full"
                : "w-full aspect-[5/2]"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Drag & drop / click upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative rounded-xl border-2 border-dashed p-5 cursor-pointer text-center transition-colors",
            dragOver
              ? "border-indigo-500 bg-indigo-500/5"
              : "border-gray-700 hover:border-indigo-500/50 hover:bg-gray-950"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
          <Upload className="w-7 h-7 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-white font-semibold">
            {file ? file.name : "Click or drag image here"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            JPG, PNG, WebP, GIF · Up to 8 MB
          </p>
        </div>

        {file && (
          <button
            onClick={uploadFile}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload {target === "avatar" ? "Profile Photo" : "Cover Photo"}
          </button>
        )}

        {/* OR divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            or paste URL
          </span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (e.target.value) {
                setFile(null);
                setPreviewUrl(e.target.value);
              }
            }}
            placeholder="https://..."
            className={cn(inp, "font-mono text-xs flex-1")}
          />
          <button
            onClick={saveUrl}
            disabled={busy || !urlInput.trim()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            Use URL
          </button>
        </div>

        {currentUrl && (
          <button
            onClick={removePhoto}
            disabled={busy}
            className="w-full text-xs text-red-400 hover:text-red-300 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove current photo
          </button>
        )}
      </div>

      <div className="flex justify-end mt-5 pt-4 border-t border-gray-800">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
