"use client";

import { useState } from "react";
import { X, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface ImageZoomGalleryProps {
  images: string[];
  /** Optional small thumbnail size override (px). */
  size?: number;
}

/**
 * Reusable thumbnail strip + click-to-zoom overlay.
 * Used by Submission Review, KYC, Marketplace dispute, etc.
 */
export function ImageZoomGallery({ images, size = 80 }: ImageZoomGalleryProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (images.length === 0) return null;

  const close = () => setActiveIdx(null);
  const next = () =>
    setActiveIdx((i) => (i === null ? null : (i + 1) % images.length));
  const prev = () =>
    setActiveIdx((i) =>
      i === null ? null : (i - 1 + images.length) % images.length
    );

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {images.map((src, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIdx(idx)}
            className="relative rounded-lg overflow-hidden border border-slate-700 hover:border-blue-500 transition-colors group"
            style={{ width: size, height: size }}
            aria-label={`Open image ${idx + 1}`}
          >
            <SmartImage
              src={src}
              alt={`Proof ${idx + 1}`}
              fill
              sizes="120px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
          </button>
        ))}
      </div>

      {activeIdx !== null && (
        <div
          onClick={close}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={close}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white"
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white"
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[activeIdx]}
            alt={`Proof ${activeIdx + 1}`}
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-800/80 text-white text-sm">
            {activeIdx + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}
