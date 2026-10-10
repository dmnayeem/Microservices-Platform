import type { PanelSubmission } from "./types";

/** Evidence for a VISIT task, written by the submit route (`metadata.visit`). */
interface VisitMeta {
  kind?: "DIRECT" | "SHORTENER";
  opens?: number;
  early?: number;
  stayedSec?: number | null;
  needSec?: number;
  verdict?: string | null;
  referrerHost?: string | null;
  secondsToArrive?: number | null;
  minSec?: number;
  signedOutCode?: boolean;
}

const VERDICT: Record<string, { text: string; tone: string }> = {
  OK: { text: "Came through the shortener", tone: "text-emerald-300" },
  UNKNOWN: { text: "Source hidden (no referrer)", tone: "text-amber-300" },
  MISMATCH: { text: "Came from another site", tone: "text-red-300" },
  TOO_FAST: { text: "Too fast (bypass)", tone: "text-red-300" },
};

export function VisitProofPanel({ submission }: { submission: PanelSubmission }) {
  const meta = (submission.metadata as { visit?: VisitMeta } | null)?.visit;
  if (!meta) {
    return (
      <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-500">
        No visit recorded on this claim.
      </div>
    );
  }
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-200 text-right">{v}</span>
    </div>
  );
  const v = meta.verdict ? VERDICT[meta.verdict] : null;
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs space-y-1.5">
      {row("Type", meta.kind === "SHORTENER" ? "URL shortener" : "Direct / smart link")}
      {row("Times opened", meta.opens ?? 0)}
      {meta.kind === "SHORTENER" ? (
        <>
          {row("Arrival", v ? <span className={v.tone}>{v.text}</span> : <span className="text-red-300">Never reached the end page</span>)}
          {row("Came from", meta.referrerHost ?? "—")}
          {row("Open → arrival", meta.secondsToArrive != null ? `${meta.secondsToArrive}s (min ${meta.minSec ?? 0}s)` : "—")}
          {row(
            "Code",
            meta.signedOutCode ? (
              <span className="text-amber-300">One-time code (browser not signed in)</span>
            ) : (
              <span className="text-emerald-300">Correct for this user</span>
            )
          )}
        </>
      ) : (
        <>
          {row("Stayed", meta.stayedSec != null ? `${meta.stayedSec}s (needed ${meta.needSec ?? "?"}s)` : "—")}
          {row("Came back too early", meta.early ?? 0)}
        </>
      )}
      <p className="pt-1 text-gray-500">Times are measured on our server, not the user&apos;s device.</p>
    </div>
  );
}
