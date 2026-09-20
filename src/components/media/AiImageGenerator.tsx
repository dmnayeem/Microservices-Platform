"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface AiImageGeneratorProps {
  /** Called with the newly created media item once generation + upload succeed. */
  onGenerated: (media: MediaItem) => void;
}

const SUGGESTIONS = [
  "A vibrant flat-illustration banner of people earning rewards online",
  "Minimal 3D coin with a purple gradient background, app icon style",
  "A friendly cartoon quiz mascot holding a lightbulb",
];

export function AiImageGenerator({ onGenerated }: AiImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleGenerate = async () => {
    const value = prompt.trim();
    if (!value || loading) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.media) {
        setError(data.error || "Image generation failed. Please try again.");
        return;
      }
      setPreview(data.url || data.media.cloudFrontUrl || data.media.s3Url);
      onGenerated(data.media as MediaItem);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 text-white">
        <Sparkles className="w-5 h-5 text-(--app-accent-ink)" />
        <h3 className="text-base font-semibold">Generate an image with AI</h3>
      </div>
      <p className="text-sm text-(--app-ink-3)">
        Describe the image you want. It will be created with Gemini, saved to your
        media library, and selected automatically.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleGenerate();
        }}
        rows={4}
        maxLength={5000}
        disabled={loading}
        placeholder="e.g. A colorful banner showing people earning rewards on their phones, flat illustration style"
        className="w-full px-4 py-3 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-(--app-ink) placeholder:text-(--app-ink-3) focus:outline-none focus:ring-2 focus:ring-(--app-accent-edge) resize-none disabled:opacity-60"
      />

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => setPrompt(s)}
            className="text-xs px-3 py-1.5 rounded-full bg-(--app-surface-2) border border-(--app-line) text-(--app-ink-2) hover:text-white hover:border-(--app-accent-edge) transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={loading || !prompt.trim()}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate
            </>
          )}
        </Button>
        <span className="text-xs text-(--app-ink-3)">Ctrl/⌘ + Enter</span>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center h-56 rounded-lg border border-dashed border-(--app-line) text-(--app-ink-3)">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm">Creating your image… this can take a few seconds.</p>
        </div>
      )}

      {!loading && preview && (
        <div className="space-y-2">
          <p className="text-sm text-green-400">
            Image generated and added to your library — it&apos;s selected below.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="AI generated preview"
            className="w-full max-h-72 object-contain rounded-lg border border-(--app-line) bg-(--app-page)"
          />
        </div>
      )}
    </div>
  );
}
