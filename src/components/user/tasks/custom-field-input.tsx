"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import type { CustomField, CustomAnswer } from "@/lib/custom-tasks";

interface Props {
  field: CustomField;
  value: CustomAnswer | undefined;
  onChange: (next: CustomAnswer) => void;
  /** Disable inputs while the parent is submitting. */
  disabled?: boolean;
}

const inp =
  "w-full px-3 py-2.5 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50";

export function CustomFieldInput({ field, value, onChange, disabled }: Props) {
  const labelEl = (
    <label className="block">
      <span className="text-sm font-bold text-white inline-flex items-center gap-1.5">
        {field.label}
        {field.required && <span className="text-red-400 text-base">*</span>}
      </span>
      {field.hint && (
        <span className="block text-xs text-gray-500 mt-0.5">{field.hint}</span>
      )}
    </label>
  );

  switch (field.type) {
    case "TEXT":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            maxLength={field.maxLength}
            placeholder={field.hint || "Your answer"}
            className={inp}
          />
          {field.maxLength && (
            <p className="text-[10px] text-gray-600 text-right tabular-nums">
              {(typeof value === "string" ? value : "").length} / {field.maxLength}
            </p>
          )}
        </div>
      );

    case "TEXTAREA":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <textarea
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            maxLength={field.maxLength}
            placeholder={field.hint || "Type your answer here…"}
            className={inp}
          />
          {field.maxLength && (
            <p className="text-[10px] text-gray-600 text-right tabular-nums">
              {(typeof value === "string" ? value : "").length} / {field.maxLength}
            </p>
          )}
        </div>
      );

    case "LINK":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="url"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="https://…"
            className={`${inp} font-mono text-xs`}
          />
        </div>
      );

    case "EMAIL":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="email"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="name@example.com"
            className={inp}
          />
        </div>
      );

    case "PHONE":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="tel"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="+880 1234 567890"
            className={inp}
          />
        </div>
      );

    case "NUMBER":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="number"
            value={typeof value === "number" ? value : value === "" || value === null || value === undefined ? "" : Number(value)}
            min={field.min}
            max={field.max}
            onChange={(e) =>
              onChange(e.target.value === "" ? "" : Number(e.target.value))
            }
            disabled={disabled}
            placeholder={field.hint || "0"}
            className={inp}
          />
        </div>
      );

    case "SELECT":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <div className="space-y-1.5">
            {(field.options ?? []).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  value === opt
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-gray-800 bg-gray-950 hover:border-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name={field.id}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                  disabled={disabled}
                  className="text-indigo-500"
                />
                <span className="text-sm text-white">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case "CHECKBOX_GROUP": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string) => {
        if (arr.includes(opt)) onChange(arr.filter((x) => x !== opt));
        else onChange([...arr, opt]);
      };
      return (
        <div className="space-y-1.5">
          {labelEl}
          <div className="space-y-1.5">
            {(field.options ?? []).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  arr.includes(opt)
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-gray-800 bg-gray-950 hover:border-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={arr.includes(opt)}
                  onChange={() => toggle(opt)}
                  disabled={disabled}
                  className="rounded text-emerald-500"
                />
                <span className="text-sm text-white">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case "IMAGE":
    case "FILE":
    case "VIDEO":
      return (
        <SingleFileField
          field={field}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
          labelEl={labelEl}
        />
      );

    case "IMAGES":
      return (
        <MultiImageField
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
          labelEl={labelEl}
        />
      );

    default:
      return null;
  }
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/media/upload", { method: "POST", body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
  const url = d.cloudFrontUrl || d.url || d.s3Url;
  if (!url) throw new Error("Upload returned no URL");
  return url as string;
}

function SingleFileField({
  field,
  value,
  onChange,
  disabled,
  labelEl,
}: {
  field: CustomField;
  value: string;
  onChange: (v: CustomAnswer) => void;
  disabled?: boolean;
  labelEl: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const maxMb = field.maxSizeMb ?? 8;
  const isImage = field.type === "IMAGE";
  const isVideo = field.type === "VIDEO";

  const handleFile = async (file: File) => {
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File too large — max ${maxMb} MB`);
      return;
    }
    if (isImage && !file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (isVideo && !file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
      toast.success("Uploaded");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {labelEl}
      {value && isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="w-full max-h-64 rounded-lg object-cover bg-gray-950 border border-gray-800"
        />
      )}
      {value && !isImage && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-800 bg-gray-950">
          <span className="text-xs text-gray-300 truncate flex-1 font-mono">
            {value}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled || busy}
            className="p-1 text-red-400 hover:bg-red-500/10 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => !busy && !disabled && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-5 cursor-pointer text-center transition-colors ${
          dragOver
            ? "border-indigo-500 bg-indigo-500/5"
            : "border-gray-700 hover:border-indigo-500/50 hover:bg-gray-950"
        } ${disabled || busy ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={field.accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {busy ? (
          <div className="inline-flex items-center gap-2 text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </div>
        ) : (
          <>
            <Upload className="w-7 h-7 text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-white font-semibold">
              {value ? "Replace" : "Click or drag to upload"}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Max {maxMb} MB
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MultiImageField({
  field,
  value,
  onChange,
  disabled,
  labelEl,
}: {
  field: CustomField;
  value: string[];
  onChange: (v: CustomAnswer) => void;
  disabled?: boolean;
  labelEl: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const maxImages = field.maxImages ?? 5;
  const maxMb = field.maxSizeMb ?? 8;
  const remaining = Math.max(0, maxImages - value.length);

  const handleFiles = async (files: FileList) => {
    const valid: File[] = [];
    for (const f of Array.from(files).slice(0, remaining)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > maxMb * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds ${maxMb} MB`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    setBusy(true);
    try {
      const urls = await Promise.all(valid.map(uploadFile));
      onChange([...value, ...urls]);
      toast.success(`Uploaded ${urls.length}`);
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (i: number) => {
    onChange(value.filter((_, j) => j !== i));
  };

  return (
    <div className="space-y-1.5">
      {labelEl}
      <p className="text-[11px] text-gray-500">
        {value.length} / {maxImages} images
      </p>
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {value.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-950 border border-gray-800 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled || busy}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => !busy && !disabled && inputRef.current?.click()}
          disabled={disabled || busy}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-700 hover:border-indigo-500/50 hover:bg-gray-950 text-sm font-semibold text-gray-300 disabled:opacity-50 transition-colors"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add {remaining > 1 ? `up to ${remaining}` : "1"} image
              {remaining === 1 ? "" : "s"} (max {maxMb} MB each)
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={field.accept ?? "image/*"}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          // reset so the same file can be chosen again later
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
