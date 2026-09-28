"use client";

import { useRef, useState } from "react";
import { MediaSelector } from "@/components/media/MediaSelector";
import type { MediaItem } from "@/types/media";

/**
 * The media library as a promise, for the rich-text editor's image button:
 * `const { pick, picker } = useMediaPicker();` then `onPickImage={pick}` and
 * render `{picker}` once. Resolves with the chosen file's URL, or null.
 */
export function useMediaPicker(title = "Select image") {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((url: string | null) => void) | null>(null);

  const pick = () =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    });

  const finish = (url: string | null) => {
    resolver.current?.(url);
    resolver.current = null;
    setOpen(false);
  };

  const picker = (
    <MediaSelector
      isOpen={open}
      onClose={() => finish(null)}
      onSelect={(media: MediaItem | MediaItem[]) => {
        const m = Array.isArray(media) ? media[0] : media;
        finish(m ? m.cloudFrontUrl || m.s3Url : null);
      }}
      fileType="IMAGE"
      title={title}
    />
  );

  return { pick, picker };
}
