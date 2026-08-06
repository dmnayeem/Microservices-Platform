import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { parseAppInstallConfig } from "@/lib/app-install-tasks";
import { GenericProofPanel } from "./GenericProofPanel";
import type { PanelSubmission, PanelTask } from "./types";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

interface MetaItem {
  id?: string;
  kind?: string;
  label?: string;
  target?: number | null;
  valueLabel?: string | null;
  value?: string | null;
  imageUrl?: string | null;
}

/**
 * Labeled proof for App Install tasks: shows each configured requirement with
 * the user's typed value + its screenshot, plus app/game + store context.
 * Falls back to the generic panel for legacy submissions with no structured meta.
 */
export function AppInstallProofPanel({ submission, task }: Props) {
  const cfg = parseAppInstallConfig(task.appInstallConfig);
  const meta = submission.metadata as
    | { appKind?: string; items?: MetaItem[] }
    | null
    | undefined;
  const items = Array.isArray(meta?.items) ? meta!.items! : [];

  if (items.length === 0) {
    // Legacy single-screenshot submission — render the generic view.
    return <GenericProofPanel submission={submission} />;
  }

  const appKind = meta?.appKind ?? cfg?.appKind ?? "app";
  const storeUrl = cfg?.playStoreUrl || cfg?.appStoreUrl || null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">
          {appKind === "game" ? "🎮 Game" : "📱 App"}
        </span>
        {cfg?.appName && <span className="text-gray-300">{cfg.appName}</span>}
        {storeUrl && (
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline"
          >
            store ↗
          </a>
        )}
      </div>

      {items.map((it, i) => (
        <div
          key={it.id ?? i}
          className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 space-y-2"
        >
          <p className="text-sm font-medium text-gray-200">
            <span className="text-emerald-400">{i + 1}.</span> {it.label}
            {it.target != null && (
              <span className="ml-1 text-xs text-gray-500">
                (target: {it.target})
              </span>
            )}
          </p>
          {it.valueLabel && (
            <p className="text-sm text-gray-300">
              <span className="text-gray-500">{it.valueLabel}:</span>{" "}
              <span className="font-semibold text-white">
                {it.value || "—"}
              </span>
            </p>
          )}
          {it.imageUrl && (
            <ImageZoomGallery images={[it.imageUrl]} size={72} />
          )}
        </div>
      ))}
    </div>
  );
}
