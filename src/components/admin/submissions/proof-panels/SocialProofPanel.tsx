import { ExternalLink, AtSign, Sparkles, Info, AlertTriangle } from "lucide-react";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { getPlatform, getAction, normalizeSocialConfig } from "@/lib/social-tasks";
import type { PanelSubmission, PanelTask } from "./types";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

interface ItemProof {
  action?: string | null;
  proofUrl?: string | null;
  screenshotUrl?: string | null;
  username?: string | null;
  generatedContent?: string | null;
  watched?: boolean | null;
  reviewStatus?: "approved" | "rejected" | null;
  verifyStatus?: "verified" | "code_missing" | "failed" | "unverifiable" | null;
}

const VERIFY_BADGE: Record<
  string,
  { label: string; cls: string }
> = {
  verified: {
    label: "✓ code verified",
    cls: "bg-emerald-500/15 text-emerald-400",
  },
  code_missing: {
    label: "⚠ code not found",
    cls: "bg-red-500/15 text-red-400",
  },
  failed: {
    label: "⚠ not a member",
    cls: "bg-red-500/15 text-red-400",
  },
  unverifiable: {
    label: "⏳ couldn't verify — review",
    cls: "bg-amber-500/15 text-amber-300",
  },
};

interface FraudFlag {
  kind: string;
  value?: string | null;
  matchedUserId?: string | null;
}

interface SocialMetadata {
  socialUsername?: string | null;
  socialGeneratedContent?: string | null;
  items?: ItemProof[];
  fraudFlags?: FraudFlag[];
}

const FRAUD_KIND_LABEL: Record<string, string> = {
  URL: "proof URL",
  SCREENSHOT: "screenshot",
  USERNAME: "username",
};

export function SocialProofPanel({ submission, task }: Props) {
  const norm = normalizeSocialConfig(task.socialConfig);
  const meta = (submission.metadata as SocialMetadata | null) ?? null;

  const platformKey = norm.platform ?? task.socialPlatform ?? null;
  const platform = platformKey ? getPlatform(platformKey) : null;
  const bundleItems = Array.isArray(meta?.items) ? meta!.items : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {platform && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-pink-500/10 border border-pink-500/30 text-pink-300">
            {platform.label}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
          {norm.items.length} action{norm.items.length === 1 ? "" : "s"}
        </span>
      </div>

      {meta?.fraudFlags && meta.fraudFlags.length > 0 && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/40 p-2.5 text-xs text-red-300 space-y-1">
          <p className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Possible duplicate proof — reused by another user on this task
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {meta.fraudFlags.map((f, i) => (
              <li key={i} className="break-all">
                {FRAUD_KIND_LABEL[f.kind] ?? f.kind}
                {f.value ? `: ${f.value}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {bundleItems ? (
        // v2 bundle — one proof block per action.
        <div className="space-y-3">
          {bundleItems.map((proof, idx) => {
            const cfgItem = norm.items[idx];
            const actionKey = proof.action ?? cfgItem?.action ?? null;
            const action =
              platformKey && actionKey
                ? getAction(platformKey, actionKey)
                : null;
            const targetUrl = cfgItem?.fields?.targetUrl ?? null;
            const screenshots = proof.screenshotUrl ? [proof.screenshotUrl] : [];
            return (
              <div
                key={idx}
                className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {action
                      ? `${action.emoji} ${action.label}`
                      : actionKey ?? "Action"}
                  </span>
                  {proof.watched && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300">
                      ✓ watched
                    </span>
                  )}
                  {proof.verifyStatus && VERIFY_BADGE[proof.verifyStatus] && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${VERIFY_BADGE[proof.verifyStatus].cls}`}
                    >
                      {VERIFY_BADGE[proof.verifyStatus].label}
                    </span>
                  )}
                  {proof.reviewStatus && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        proof.reviewStatus === "approved"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {proof.reviewStatus}
                    </span>
                  )}
                  {targetUrl && (
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white truncate max-w-xs"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">Target</span>
                    </a>
                  )}
                </div>

                {proof.proofUrl && (
                  <a
                    href={proof.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-indigo-400 hover:text-indigo-300 break-all max-w-full"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{proof.proofUrl}</span>
                  </a>
                )}

                {proof.username && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-gray-800 border border-gray-700 text-gray-200">
                    <AtSign className="w-3.5 h-3.5 text-pink-400" />
                    <span className="font-mono">{proof.username}</span>
                  </div>
                )}

                {proof.generatedContent && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      AI-generated content:
                    </p>
                    <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-3 text-sm text-gray-200 whitespace-pre-wrap">
                      {proof.generatedContent}
                    </div>
                  </div>
                )}

                {screenshots.length > 0 && (
                  <ImageZoomGallery images={screenshots} size={72} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Legacy single-action submission (pre-bundle).
        <LegacyProof submission={submission} task={task} meta={meta} />
      )}
    </div>
  );
}

function LegacyProof({
  submission,
  task,
  meta,
}: {
  submission: PanelSubmission;
  task: PanelTask;
  meta: SocialMetadata | null;
}) {
  const norm = normalizeSocialConfig(task.socialConfig);
  const platformKey = norm.platform ?? task.socialPlatform ?? null;
  const actionKey = norm.items[0]?.action ?? task.socialAction ?? null;
  const action =
    platformKey && actionKey ? getAction(platformKey, actionKey) : null;
  const targetUrl =
    norm.items[0]?.fields?.targetUrl ?? task.socialUrl ?? null;

  const isLegacy =
    !submission.proof &&
    (!submission.proofImages || submission.proofImages.length === 0) &&
    !meta;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {action && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
            {action.label}
          </span>
        )}
        {targetUrl && (
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white underline-offset-2 hover:underline truncate max-w-md"
            title="Target URL set by admin"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">Target: {targetUrl}</span>
          </a>
        )}
      </div>

      {isLegacy && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-300 inline-flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Legacy submission — no proof was persisted before the v2 update.
          </span>
        </div>
      )}

      {submission.proof && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Proof URL submitted:</p>
          <a
            href={submission.proof}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-indigo-400 hover:text-indigo-300 break-all max-w-full"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{submission.proof}</span>
          </a>
        </div>
      )}

      {meta?.socialUsername && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-gray-800 border border-gray-700 text-gray-200">
          <AtSign className="w-3.5 h-3.5 text-pink-400" />
          <span className="font-mono">{meta.socialUsername}</span>
        </div>
      )}

      {meta?.socialGeneratedContent && (
        <div>
          <p className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            AI-generated content user posted:
          </p>
          <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-3 text-sm text-gray-200 whitespace-pre-wrap">
            {meta.socialGeneratedContent}
          </div>
        </div>
      )}

      {submission.proofImages && submission.proofImages.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Screenshots:</p>
          <ImageZoomGallery images={submission.proofImages} size={72} />
        </div>
      )}
    </div>
  );
}
