"use client";

import { useRef, useState } from "react";
import {
  Loader2,
  Upload,
  X,
  DollarSign,
  Percent,
  Hash,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { CategoryField } from "@/lib/marketplace-categories";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface Props {
  field: CategoryField;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  /** Upload implementation. Admin defaults to `/api/media/upload`; the seller
   *  form passes a user-facing uploader (that endpoint is admin-only). */
  uploadFn?: (file: File) => Promise<string>;
}

const inp =
  "w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50";

export function CategoryFieldInput({
  field,
  value,
  onChange,
  disabled,
  uploadFn,
}: Props) {
  const doUpload = uploadFn ?? uploadFile;
  const labelEl = (
    <label className="block">
      <span className="text-sm font-bold text-white inline-flex items-center gap-1.5">
        {field.label}
        {field.required && <span className="text-red-400 text-base">*</span>}
      </span>
      {field.hint && (
        <span className="block text-xs text-slate-500 mt-0.5">{field.hint}</span>
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
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            maxLength={field.maxLength}
            placeholder={field.hint || "Your answer"}
            className={inp}
          />
        </div>
      );

    case "MULTILINE":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <textarea
            rows={3}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            maxLength={field.maxLength}
            placeholder={field.hint || ""}
            className={inp}
          />
        </div>
      );

    case "URL":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="url"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="https://…"
            className={`${inp} font-mono text-xs`}
          />
        </div>
      );

    case "NUMBER":
    case "MONEY":
    case "PERCENT":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <div className="relative">
            <input
              type="number"
              value={
                typeof value === "number"
                  ? value
                  : value === null || value === undefined || value === ""
                  ? ""
                  : Number(value)
              }
              min={field.min}
              max={field.max}
              step={field.type === "PERCENT" ? 0.1 : field.type === "MONEY" ? 0.01 : 1}
              onChange={(e) =>
                onChange(e.target.value === "" ? "" : Number(e.target.value))
              }
              disabled={disabled}
              placeholder="0"
              className={`${inp} ${field.type === "MONEY" || field.type === "PERCENT" ? "pl-8" : "pl-8"}`}
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
              {field.type === "MONEY" ? (
                <DollarSign className="w-3.5 h-3.5" />
              ) : field.type === "PERCENT" ? (
                <Percent className="w-3.5 h-3.5" />
              ) : (
                <Hash className="w-3.5 h-3.5" />
              )}
            </span>
          </div>
        </div>
      );

    case "DATE":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inp}
          />
        </div>
      );

    case "BOOLEAN":
      return (
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-700 bg-slate-950 hover:border-slate-600">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="rounded bg-slate-800 border-slate-600 text-indigo-500"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {field.label}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </p>
            {field.hint && (
              <p className="text-xs text-slate-500 mt-0.5">{field.hint}</p>
            )}
          </div>
        </label>
      );

    case "SELECT":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inp}
          >
            <option value="">— Choose —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );

    case "SCREENSHOT":
      return (
        <SingleScreenshotField
          field={field}
          value={(value as string) ?? ""}
          onChange={onChange}
          disabled={disabled}
          labelEl={labelEl}
          uploadFn={doUpload}
        />
      );

    case "SCREENSHOT_GROUP":
      return (
        <MultiScreenshotField
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
          labelEl={labelEl}
          uploadFn={doUpload}
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

function SingleScreenshotField({
  field: _field,
  value,
  onChange,
  disabled,
  labelEl,
  uploadFn,
}: {
  field: CategoryField;
  value: string;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  labelEl: React.ReactNode;
  uploadFn: (file: File) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadFn(file);
      onChange(url);
      toast.success("Screenshot uploaded");
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
      {value && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="max-w-md max-h-56 rounded-lg object-cover bg-slate-950 border border-slate-800"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled || busy}
            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-500"
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
        className={`relative rounded-xl border-2 border-dashed p-4 cursor-pointer text-center transition-colors ${
          dragOver
            ? "border-indigo-500 bg-indigo-500/5"
            : "border-slate-700 hover:border-indigo-500/50 hover:bg-slate-950"
        } ${disabled || busy ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {busy ? (
          <div className="inline-flex items-center gap-2 text-slate-300 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </div>
        ) : (
          <>
            <Upload className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-sm text-white font-semibold">
              {value ? "Replace screenshot" : "Click or drag to upload"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">JPG / PNG / WebP · Max 8 MB</p>
          </>
        )}
      </div>
    </div>
  );
}

function MultiScreenshotField({
  field: _field,
  value,
  onChange,
  disabled,
  labelEl,
  uploadFn,
}: {
  field: CategoryField;
  value: string[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
  labelEl: React.ReactNode;
  uploadFn: (file: File) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const MAX = 10;
  const remaining = Math.max(0, MAX - value.length);

  const handleFiles = async (files: FileList) => {
    const valid: File[] = [];
    for (const f of Array.from(files).slice(0, remaining)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds 8 MB`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    setBusy(true);
    try {
      const urls = await Promise.all(valid.map(uploadFn));
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

  return (
    <div className="space-y-1.5">
      {labelEl}
      <p className="text-[11px] text-slate-500">
        {value.length} / {MAX} screenshots
      </p>
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {value.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800 group"
            >
              <SmartImage src={url} alt="" fill sizes="200px" className="object-cover" />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
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
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-slate-950 text-sm font-semibold text-slate-300 disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Add screenshots ({remaining} more)
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
