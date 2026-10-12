"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { personalize } from "@/lib/personalize";

/**
 * What the push looks like on an Android phone's lock screen — title, the
 * message line by line, the app logo on the right and the big picture under
 * it (the "rich" notification). Tap the arrow to see the folded version, the
 * way it first shows in the shade. `{name}` is filled with a sample name.
 */
export function PushPreview({
  title,
  message,
  imageUrl,
  sampleName = "Mahedi",
  enabled,
}: {
  title: string;
  message: string;
  imageUrl?: string | null;
  sampleName?: string;
  /** Push ticked for this send — otherwise the preview says so. */
  enabled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const t = personalize(title || "Your title appears here", sampleName);
  const m = personalize(message || "Your message — each line on its own line.", sampleName);

  return (
    <div className="space-y-1.5">
      <div className="rounded-2xl bg-gradient-to-b from-zinc-600 to-zinc-700 p-3">
        <p className="mb-2 px-1 text-[11px] font-medium text-white/80">Lock screen · Android</p>
        <div className="overflow-hidden rounded-[22px] bg-[#1f1f1f] p-3.5 text-white shadow-xl">
          <div className="flex items-start gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon/192" alt="" className="h-7 w-7 shrink-0 rounded-full bg-zinc-700 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-white/60">
                RevType <span className="text-white/40">· now</span>
              </p>
              <p className={cn("mt-0.5 text-[15px] font-semibold leading-snug", !expanded && "truncate")}>{t}</p>
              <p
                className={cn(
                  "mt-0.5 whitespace-pre-line text-[13.5px] leading-snug text-white/75",
                  expanded ? "line-clamp-6" : "line-clamp-1"
                )}
              >
                {m}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Fold" : "Expand"}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/80"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {!expanded && imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              )}
            </div>
          </div>
          {expanded && imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="mt-3 aspect-[2/1] w-full rounded-xl object-cover" />
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        {enabled ? "" : "Tick “Push notification” below to send it as a push. "}
        {"{name}"} becomes each member&apos;s first name (shown here as &ldquo;{sampleName}&rdquo;). Android shows the big
        picture; iPhone shows the text and logo only — Apple does not allow pictures in web push. Best picture size:
        1200×600 (2:1).
      </p>
    </div>
  );
}

/** "+ Member's name" — appends `{name}` to a field. */
export function NameTokenButton({ onInsert }: { onInsert: () => void }) {
  return (
    <button
      type="button"
      onClick={onInsert}
      title="Insert {name} — replaced by each member's first name"
      className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20"
    >
      + Member&apos;s name
    </button>
  );
}
