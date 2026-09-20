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
          <p className="text-[11px] text-(--app-ink-3) font-semibold">
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
    <div className="rounded-lg bg-(--app-cta)/5 border border-(--app-accent-edge)/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 shrink-0 text-(--app-accent-ink)" />
        <p className="min-w-0 text-sm font-bold text-(--app-accent-ink)">
          Text prompt — writes your {platformLabel} post
        </p>
        <span className="ml-auto shrink-0 rounded bg-(--app-cta)/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-(--app-accent-ink)">
          Free
        </span>
      </div>
      <PromptHowTo
        tone="indigo"
        steps={[
          "Copy the prompt below.",
          "Paste it into ChatGPT or Gemini and send it.",
          `Copy the title and description it writes, and use them in your ${platformLabel} post.`,
        ]}
      />
      {/* The same collapsing treatment as every other long value: this prompt
          is written FOR ChatGPT, not for the person reading the page. It used
          to render as a 13rem scroll box nested inside the page's own scroll,
          which is the worst of both — long AND awkward to scroll past on a
          phone. `CopyField` shows a few lines and copies the whole thing. */}
      <CopyField label="Prompt" value={prompt} />
    </div>
  );
}

/**
 * The three moves, spelled out.
 *
 * Both prompts on this screen are written FOR an AI, not for the person
 * holding the phone — they open with "You are an expert…" and run to
 * thousands of characters. Read as prose that looks like the task itself,
 * which is why people were copying it into Pinterest instead of into ChatGPT.
 * Numbered steps say what the long text is for before it is read.
 */
function PromptHowTo({
  tone,
  steps,
}: {
  tone: "indigo" | "amber";
  steps: string[];
}) {
  const dot =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
      : "border-(--app-accent-edge)/40 bg-(--app-cta)/15 text-(--app-accent-ink)";
  const text = tone === "amber" ? "text-amber-100/90" : "text-(--app-accent-ink)/90";
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-2">
          <span
            className={`mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${dot}`}
          >
            {i + 1}
          </span>
          <span className={`min-w-0 text-[11px] leading-snug ${text}`}>{s}</span>
        </li>
      ))}
    </ol>
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
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            This one makes the picture, not the text
          </p>
          <PromptHowTo
            tone="amber"
            steps={[
              "Copy the prompt above.",
              "Paste it into ChatGPT or Gemini and ask for the image.",
              `Download the image, then upload it to ${platformLabel} when you create your post.`,
            ]}
          />
        </div>
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
          className="inline-flex items-center gap-1 text-[11px] text-(--app-accent-ink) hover:text-(--app-accent-ink)"
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
    <div className="rounded-lg bg-(--app-page) border border-(--app-line) p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 w-5 h-5 rounded-full bg-(--app-cta)/15 border border-(--app-accent-edge)/40 text-(--app-accent-ink) text-[10px] font-bold grid place-items-center">
          {step.serial}
        </span>
        <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold truncate min-w-0">
          {step.label}
        </p>
        {badge}
      </div>
      <SmartImage
        src={step.value}
        alt={step.label}
        width={480}
        height={320}
        className="w-full max-h-56 rounded-lg object-contain bg-(--app-surface) border border-(--app-line)"
      />
      <div className="flex items-center gap-3">
        {isOurs ? (
          <a
            href={href}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-[11px] font-bold"
          >
            <Download className="w-3.5 h-3.5" /> Download image
          </a>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-[11px] font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open image to save
          </a>
        )}
        <CopyButton value={step.value} label="Copy link" />
      </div>
    </div>
  );
}
