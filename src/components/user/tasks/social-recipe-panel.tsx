"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Download,
  ExternalLink,
  ImageIcon,
  Wand2,
  ChevronDown,
} from "lucide-react";
import type { AiMode, ResolvedStep } from "@/lib/social-tasks";
import { buildImageInstruction } from "@/lib/social-ai-recipe";
import { CopyButton, CopyField } from "@/components/user/primitives/copy-field";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { ownMediaKey, mediaSrc } from "@/lib/media-url";

/**
 * The post recipe — the numbered list of things a user copies (or downloads) to
 * publish one social post.
 *
 * One renderer serves all three content modes. That is the point: the old code
 * had a separate AI panel and a separate static-fields block, and the static
 * block was hidden whenever AI was on, so users in AI mode never saw the
 * destination URL or board name the admin had supplied and couldn't actually
 * make the post. Here every step comes from `resolveRecipe`, which always emits
 * the admin's fixed fields, so that failure can't recur.
 *
 * Steps are numbered but never locked — people bounce out to Pinterest and back
 * and need to re-copy in whatever order they like.
 */

export function SocialRecipePanel({
  steps,
  platformLabel,
  mode,
  diyPrompt,
  regenLeft,
  generating,
  hasGenerated,
  onGenerate,
  error,
}: {
  steps: ResolvedStep[];
  platformLabel: string;
  mode: AiMode;
  /** Ready-made prompt the user pastes into ChatGPT/Gemini themselves. */
  diyPrompt: string;
  regenLeft: number;
  generating: boolean;
  hasGenerated: boolean;
  onGenerate: (regenerate: boolean) => void;
  error?: string | null;
}) {
  const canGenerate = mode === "generate" || mode === "both";
  const showDiyUpfront = mode === "diy" || mode === "both";
  const [diyOpen, setDiyOpen] = useState(showDiyUpfront);

  if (!canGenerate && !showDiyUpfront && steps.length === 0) return null;

  return (
    <div className="space-y-2">
      {canGenerate && (
        <div className="rounded-lg bg-purple-500/5 border border-purple-500/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <p className="text-sm font-bold text-purple-300">
              Generate your own content
            </p>
          </div>
          <p className="text-xs text-purple-200/80">
            Everyone gets a different post. Generate once, then copy each field
            below and publish it on {platformLabel}.
          </p>
          <button
            type="button"
            onClick={() => onGenerate(hasGenerated)}
            disabled={generating || (hasGenerated && regenLeft <= 0)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {generating
              ? "Generating…"
              : hasGenerated
                ? regenLeft > 0
                  ? `Generate again (${regenLeft} left)`
                  : "No regenerations left"
                : "Generate with AI"}
          </button>
          {error && <p className="text-[11px] text-amber-400">{error}</p>}
          {!showDiyUpfront && (
            <button
              type="button"
              onClick={() => setDiyOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200"
            >
              <ChevronDown
                className={`w-3 h-3 transition-transform ${diyOpen ? "rotate-180" : ""}`}
              />
              Or make it yourself in ChatGPT / Gemini
            </button>
          )}
        </div>
      )}

      {diyOpen && diyPrompt && (
        <DiyPromptBlock prompt={diyPrompt} platformLabel={platformLabel} />
      )}

      {steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-semibold">
            Copy each item below, then create your {platformLabel} post:
          </p>
          {steps.map((step) => (
            <RecipeStep
              key={step.key}
              step={step}
              platformLabel={platformLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiyPromptBlock({
  prompt,
  platformLabel,
}: {
  prompt: string;
  platformLabel: string;
}) {
  return (
    <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-indigo-400" />
        <p className="text-sm font-bold text-indigo-300">
          Make it yourself — free
        </p>
      </div>
      <p className="text-xs text-indigo-200/80">
        Copy this prompt, paste it into ChatGPT or Gemini, and it will write your{" "}
        {platformLabel} post for you. Then copy each line from its answer.
      </p>
      <div className="rounded bg-gray-950 border border-gray-800 p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold">
            Prompt
          </p>
          <CopyButton value={prompt} />
        </div>
        <p className="text-[11px] text-gray-300 whitespace-pre-wrap wrap-break-word max-h-52 overflow-y-auto">
          {prompt}
        </p>
      </div>
    </div>
  );
}

const AI_BADGE = (
  <span className="shrink-0 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-bold uppercase tracking-wide">
    AI
  </span>
);

function RecipeStep({
  step,
  platformLabel,
}: {
  step: ResolvedStep;
  platformLabel: string;
}) {
  const badge = step.source === "ai" ? AI_BADGE : undefined;

  if (step.kind === "image") {
    return <ImageStep step={step} badge={badge} />;
  }

  if (step.kind === "image-prompt") {
    return (
      <CopyField
        index={step.serial}
        label={step.label}
        value={step.value}
        badge={badge}
      >
        <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded p-2 flex items-start gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {buildImageInstruction(platformLabel)}
        </p>
      </CopyField>
    );
  }

  return (
    <CopyField
      index={step.serial}
      label={step.label}
      value={step.value}
      badge={badge}
    >
      {step.kind === "link" && (
        <a
          href={step.value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
        >
          <ExternalLink className="w-3 h-3" /> Open
        </a>
      )}
    </CopyField>
  );
}

/**
 * The image step: preview plus a real download.
 *
 * `download` only works same-origin, and our own media is served through the
 * `/api/media` proxy, so an image the admin *uploaded* downloads properly. An
 * arbitrary third-party URL they pasted cannot be force-downloaded by the
 * browser, so it falls back to opening in a new tab — which is why the admin
 * builder now defaults to uploading.
 */
function ImageStep({
  step,
  badge,
}: {
  step: ResolvedStep;
  badge?: React.ReactNode;
}) {
  const isOurs = !!ownMediaKey(step.value);
  const href = mediaSrc(step.value);

  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold grid place-items-center">
          {step.serial}
        </span>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold truncate">
          {step.label}
        </p>
        {badge}
      </div>
      <SmartImage
        src={step.value}
        alt={step.label}
        width={480}
        height={320}
        className="w-full max-h-56 rounded-lg object-contain bg-gray-900 border border-gray-800"
      />
      <div className="flex items-center gap-3">
        {isOurs ? (
          <a
            href={href}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-bold"
          >
            <Download className="w-3.5 h-3.5" /> Download image
          </a>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-[11px] font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open image to save
          </a>
        )}
        <CopyButton value={step.value} label="Copy link" />
      </div>
    </div>
  );
}
