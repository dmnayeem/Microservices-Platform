import { ExternalLink, Key, CheckCircle2, XCircle } from "lucide-react";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { BrandIcon } from "@/components/ui/brand-icon";
import { DurationCard } from "../duration-card";
import {
  getProviderMeta,
  engagementSteps,
  effectiveSteps,
  STEP_TYPE_META,
  type VideoConfig,
  type EngagementKey,
  type VideoStepProof,
} from "@/lib/video-tasks";
import type { PanelSubmission, PanelTask } from "./types";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

export function VideoProofPanel({ submission, task }: Props) {
  const cfg = (task.videoConfig as VideoConfig | null) ?? null;
  const provider = cfg?.provider ?? "OTHER";
  const providerMeta = getProviderMeta(provider);
  const requiredSec = cfg?.watchSeconds ?? task.duration ?? 0;
  const requiresKey = !!cfg?.proofRequirements?.uniqueKey;

  // VIDEO unique-key mismatch hard-rejects at submit time. The endpoint sets
  // status=REJECTED + rejectionReason="Incorrect verification key", so detect
  // it here without storing extra metadata.
  const keyRejected =
    requiresKey &&
    submission.status === "REJECTED" &&
    submission.rejectionReason === "Incorrect verification key";
  const keyMatched =
    requiresKey &&
    !keyRejected &&
    (submission.status === "APPROVED" ||
      submission.status === "AUTO_APPROVED" ||
      submission.status === "PENDING");

  const videoUrl = cfg?.videoUrl ?? task.contentUrl ?? null;

  // YouTube-style engagement (#11): what the task required vs what the user
  // confirmed (honor checkboxes, stored in metadata.videoEngagement).
  const engSteps = engagementSteps(cfg);
  const engDone =
    ((submission.metadata as Record<string, unknown> | null)
      ?.videoEngagement as Partial<Record<EngagementKey, boolean>> | undefined) ??
    {};

  // Per-step proof (new typed steps flow), stored on metadata.videoSteps.
  const stepProofs =
    ((submission.metadata as Record<string, unknown> | null)
      ?.videoSteps as VideoStepProof[] | undefined) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${providerMeta.tone}`}
        >
          <BrandIcon brand={provider} fallback={providerMeta.emoji} colored className="w-3.5 h-3.5" />
          {providerMeta.label}
        </span>
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline truncate max-w-md"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">{videoUrl}</span>
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {requiredSec > 0 && (
          <DurationCard
            startedAt={submission.createdAt}
            submittedAt={submission.updatedAt}
            requiredSeconds={requiredSec}
            verb="Watched"
          />
        )}

        {requiresKey && (
          <div
            className={`rounded-lg border p-3 inline-flex items-center gap-2 text-xs font-semibold ${
              keyRejected
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : keyMatched
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-gray-800 border-gray-700 text-gray-300"
            }`}
          >
            {keyRejected ? (
              <XCircle className="w-4 h-4" />
            ) : keyMatched ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Key className="w-4 h-4" />
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wider opacity-80">
                Unique Key
              </p>
              <p>
                {keyRejected
                  ? "Mismatched (auto-rejected)"
                  : keyMatched
                  ? "Verified"
                  : "Required"}
              </p>
            </div>
          </div>
        )}
      </div>

      {engSteps.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">
            YouTube engagement (user-confirmed):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {engSteps.map((s) => {
              const done = !!engDone[s.key];
              return (
                <span
                  key={s.key}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                    done
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {stepProofs.length > 0 ? (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Proof steps:</p>
          <div className="space-y-2">
            {stepProofs.map((p, i) => {
              const meta = STEP_TYPE_META[p.type] ?? STEP_TYPE_META.custom;
              const cfgStep = effectiveSteps(cfg).find((s) => s.id === p.id);
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-gray-700 bg-gray-900 p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span>{meta.emoji}</span>
                    <span className="text-white font-semibold truncate">
                      {i + 1}. {cfgStep?.label || meta.label}
                    </span>
                    <span
                      className={`ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.status === "skipped"
                          ? "bg-gray-800 text-gray-400"
                          : "bg-emerald-500/10 text-emerald-300"
                      }`}
                    >
                      {p.status === "skipped" ? "Skipped" : "Done"}
                    </span>
                  </div>
                  {p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline max-w-full"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{p.link}</span>
                    </a>
                  )}
                  {p.screenshotUrl && (
                    <ImageZoomGallery images={[p.screenshotUrl]} size={72} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        submission.proofImages &&
        submission.proofImages.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Screenshots:</p>
            <ImageZoomGallery images={submission.proofImages} size={72} />
          </div>
        )
      )}
    </div>
  );
}
