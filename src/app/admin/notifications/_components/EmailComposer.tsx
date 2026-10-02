"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Monitor, Smartphone, Send, AlertTriangle, Type, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import { useMediaPicker } from "@/components/admin/shared/use-media-picker";

const RichTextEditor = dynamic(
  () => import("@/components/admin/offers/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-40 rounded-lg border border-slate-700 bg-slate-900 animate-pulse" /> }
);

export type EmailDraft = {
  format: "text" | "rich";
  subject: string;
  body: string;
  html: string;
  preheader: string;
};

/** What the preview needs from the rest of the form. */
export type EmailContext = {
  title: string;
  message: string;
  actionUrl: string;
  actionLabel: string;
  imageUrl: string;
  style: string;
  kicker: string;
  important: boolean;
};

const field = "w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm";

/**
 * The email half of the broadcast composer: plain text or a rich body (links,
 * images, headings, lists, dividers), preheader, button, a live preview of
 * the exact email (rendered by the server through the same layout and
 * email-safe conversion the send uses) and "Send test to me".
 */
export function EmailComposer({
  draft,
  onDraft,
  ctx,
  onCta,
}: {
  draft: EmailDraft;
  onDraft: (patch: Partial<EmailDraft>) => void;
  ctx: EmailContext;
  onCta: (patch: { actionUrl?: string; actionLabel?: string }) => void;
}) {
  const { pick, picker } = useMediaPicker("Insert image");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState<{
    html: string;
    subject: string;
    error: string | null;
    flaggedLinks: { url: string; reason: string }[];
    dropped: string[];
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [testing, setTesting] = useState(false);
  const seq = useRef(0);

  const payload = () => ({
    title: ctx.title,
    message: ctx.message,
    emailSubject: draft.subject,
    emailBody: draft.format === "text" ? draft.body : "",
    emailHtml: draft.format === "rich" ? draft.html : "",
    emailPreheader: draft.preheader,
    actionUrl: ctx.actionUrl,
    actionLabel: ctx.actionLabel,
    imageUrl: ctx.imageUrl,
    style: ctx.style,
    kicker: ctx.kicker,
    important: ctx.important,
  });
  const key = JSON.stringify(payload());

  // Debounced: the server renders, so the preview cannot drift from the send.
  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch("/api/admin/notifications/email-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
        });
        const j = await res.json();
        if (id === seq.current && res.ok) setPreview(j);
      } catch {
        /* keep the last preview */
      } finally {
        if (id === seq.current) setPreviewing(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [key]);

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/notifications/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Test failed");
      toast.success(j.message || "Test sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  // The library hands back the storage URL, which 403s (private bucket); the
  // same-origin proxy path shows in the editor and is made absolute at send.
  const pickImage = async () => {
    const u = await pick();
    return u ? mediaSrc(u) : null;
  };

  return (
    <div className="space-y-3">
      {picker}
      <p className="text-[11px] text-slate-500">
        Optional — leave blank to email the title and message above.
      </p>
      <input
        value={draft.subject}
        onChange={(e) => onDraft({ subject: e.target.value })}
        maxLength={150}
        placeholder="Email subject"
        className={field}
      />
      <input
        value={draft.preheader}
        onChange={(e) => onDraft({ preheader: e.target.value })}
        maxLength={200}
        placeholder="Preheader — the grey preview line after the subject in the inbox"
        className={field}
      />

      <div className="inline-flex rounded-lg border border-slate-700 p-0.5 text-xs">
        {(
          [
            ["text", "Plain text", Type],
            ["rich", "Rich — links, images, buttons", Sparkles],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            type="button"
            onClick={() => onDraft({ format: v })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
              draft.format === v ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {draft.format === "text" ? (
        <textarea
          value={draft.body}
          onChange={(e) => onDraft({ body: e.target.value })}
          rows={5}
          maxLength={5000}
          placeholder="Email body — say as much as you need here."
          className={field}
        />
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-900">
          <RichTextEditor
            value={draft.html}
            onChange={(html) => onDraft({ html })}
            onPickImage={pickImage}
            minHeightClass="min-h-48"
            placeholder="Write the email. Use the toolbar for headings, links, images, lists and dividers."
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={ctx.actionLabel}
          onChange={(e) => onCta({ actionLabel: e.target.value })}
          maxLength={40}
          placeholder="Button label (e.g. Claim bonus)"
          className={field}
        />
        <input
          value={ctx.actionUrl}
          onChange={(e) => onCta({ actionUrl: e.target.value })}
          placeholder="Button link — /tasks or https://…"
          className={field}
        />
      </div>
      <p className="text-[11px] text-slate-500">
        The button is shared with the in-app notification. Links must be https (or a page on this site).
      </p>

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-white inline-flex items-center gap-2">
            Email preview {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </p>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-700 p-0.5">
              <button type="button" aria-label="Desktop width" onClick={() => setWidth("desktop")} className={cn("rounded px-2 py-1", width === "desktop" ? "bg-slate-700 text-white" : "text-slate-400")}>
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button type="button" aria-label="Mobile width" onClick={() => setWidth("mobile")} className={cn("rounded px-2 py-1", width === "mobile" ? "bg-slate-700 text-white" : "text-slate-400")}>
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || !(draft.subject || ctx.title)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600/20 border border-blue-500/30 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-600/30 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send test to me
            </button>
          </div>
        </div>
        {preview?.subject && (
          <p className="text-[11px] text-slate-400 truncate">
            Subject: <span className="text-slate-200">{preview.subject}</span>
          </p>
        )}
        {preview?.error && <p className="text-[11px] text-rose-300">{preview.error}</p>}
        {!!preview?.flaggedLinks.length && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200 space-y-0.5">
            <p className="inline-flex items-center gap-1 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Links the safety check flagged (they will still send, and are logged for review):
            </p>
            {preview.flaggedLinks.map((l) => (
              <p key={l.url} className="break-all">
                {l.url} — {l.reason}
              </p>
            ))}
          </div>
        )}
        {!!preview?.dropped.length && (
          <p className="text-[11px] text-amber-200 break-all">
            Removed (not https, or unsafe): {preview.dropped.slice(0, 5).join(", ")}
          </p>
        )}
        <div className="overflow-x-auto rounded-md bg-[#e2e8f0]">
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview?.html ?? ""}
            className="mx-auto block h-[640px] bg-white transition-[width]"
            style={{ width: width === "desktop" ? 640 : 375, maxWidth: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
