"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Video as VideoIcon, X } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { uploadUserFile } from "@/lib/user-upload";
import { toast } from "@/lib/toast";

/**
 * Creative upload for USER-facing forms.
 *
 * The advertiser composer previously used the admin `ImageUploadField`, which
 * opens the admin media library — `/api/media` and `/api/media/upload` are gated
 * on `tasks.view` / `tasks.create`, so a normal advertiser got a 403 and the only
 * working path was pasting a raw URL. This uploads as the signed-in user via
 * `uploadUserFile`, the same helper the marketplace and feed composer use.
 */
export function UserUploadField({
  value,
  onChange,
  kind = "IMAGE",
  folder = "ads",
  previewSize = "md",
  urlPlaceholder = "…or paste a URL",
}: {
  value: string;
  onChange: (url: string) => void;
  kind?: "IMAGE" | "VIDEO";
  folder?: string;
  previewSize?: "sm" | "md" | "lg" | "square";
  urlPlaceholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isVideo = kind === "VIDEO";
  const Icon = isVideo ? VideoIcon : ImageIcon;

  const sizeCls = {
    sm: "w-20 h-14",
    md: "w-32 h-20",
    lg: "w-48 h-28",
    square: "w-24 h-24",
  }[previewSize];

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadUserFile(file, folder));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-start gap-3">
      {value ? (
        <div className="relative shrink-0">
          {isVideo ? (
            <video
              src={value}
              muted
              playsInline
              className={`${sizeCls} rounded-lg object-cover bg-gray-950 border border-gray-700`}
            />
          ) : (
            <div className={`${sizeCls} relative rounded-lg overflow-hidden bg-gray-950 border border-gray-700`}>
              <SmartImage src={value} alt="" fill sizes="200px" className="object-cover" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className={`${sizeCls} bg-gray-950 border border-gray-700 border-dashed rounded-lg flex items-center justify-center shrink-0`}>
          <Icon className="w-7 h-7 text-gray-600" />
        </div>
      )}

      <div className="flex-1 space-y-2 min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept={isVideo ? "video/*" : "image/*"}
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 border border-gray-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
          {busy ? "Uploading…" : value ? "Change" : `Upload ${isVideo ? "video" : "image"}`}
        </button>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={urlPlaceholder}
          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
