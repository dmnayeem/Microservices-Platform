"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Copy, Check, Share2 } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  text?: string;
  /** Fired after the user picks a share destination. The channel hints how
   * they shared (copy_link / native / x / facebook / etc.) so the caller can
   * track the action server-side. */
  onShare?: (channel: string) => void;
}

const PLATFORMS: Array<{
  key: string;
  name: string;
  color: string;
  build: (url: string, text: string) => string;
}> = [
  {
    key: "x",
    name: "X (Twitter)",
    color: "bg-gray-900 text-white",
    build: (u, t) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(
        u
      )}&text=${encodeURIComponent(t)}`,
  },
  {
    key: "facebook",
    name: "Facebook",
    color: "bg-[#1877f2] text-white",
    build: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    color: "bg-[#25d366] text-white",
    build: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
  },
  {
    key: "telegram",
    name: "Telegram",
    color: "bg-[#0088cc] text-white",
    build: (u, t) =>
      `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    color: "bg-[#0a66c2] text-white",
    build: (u) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  },
];

export function ShareModal({
  open,
  onOpenChange,
  url,
  title = "Share",
  text = "",
  onShare,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
      onShare?.("copy_link");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const native = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url });
        onShare?.("native");
      } catch {
        /* user cancelled */
      }
    }
  };

  const canNative =
    typeof navigator !== "undefined" && "share" in navigator;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
          <span className="flex-1 text-xs text-gray-300 truncate">{url}</span>
          <button
            onClick={copyLink}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {canNative && (
          <button
            onClick={native}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            <Share2 className="w-4 h-4" />
            Share via device
          </button>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
            Or share to
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {PLATFORMS.map((p) => (
              <a
                key={p.key}
                href={p.build(url, text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onShare?.(p.key)}
                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg ${p.color} text-[10px] font-semibold`}
              >
                <span className="text-base">{p.name[0]}</span>
                <span>{p.name.split(" ")[0]}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
