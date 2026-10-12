import { ExternalLink, Globe } from "lucide-react";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { DurationCard } from "../duration-card";
import type { PanelSubmission, PanelTask } from "./types";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

export function ProxyProofPanel({ submission, task }: Props) {
  const requiredSec = task.duration ?? 0;

  return (
    <div className="space-y-3">
      {task.proxyInstructions && (
        <details className="group rounded-lg bg-gray-950 border border-gray-800">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-gray-300 inline-flex items-center gap-1.5 select-none">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            Proxy instructions
            <span className="ml-auto text-gray-500 group-open:rotate-90 transition-transform">
              ▶
            </span>
          </summary>
          <pre className="px-3 pb-3 pt-1 text-xs text-gray-400 whitespace-pre-wrap font-sans">
            {task.proxyInstructions}
          </pre>
        </details>
      )}

      {submission.proof && (
        <div>
          <p className="text-xs text-gray-500 mb-1">
            IP-check / log URL submitted:
          </p>
          <a
            href={submission.proof}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-cyan-400 hover:text-cyan-300 break-all max-w-full"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="break-all min-w-0">{submission.proof}</span>
          </a>
        </div>
      )}

      {requiredSec > 0 && (
        <DurationCard
          startedAt={submission.createdAt}
          submittedAt={submission.submittedAt ?? submission.updatedAt}
          requiredSeconds={requiredSec}
          verb="Connected"
        />
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
