"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { UserUploadField } from "@/components/user/primitives/user-upload-field";
import { AudienceBuilder } from "@/components/admin/ads/audience-builder";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { ADVERTISER_PLACEMENTS } from "@/lib/ad-placements";
import { AD_SIZES } from "@/lib/ad-sizes";
import { type AdTargeting } from "@/lib/ad-targeting";

interface OwnPost {
  id: string;
  content: string;
  image: string | null;
  likesCount: number;
}

/** The subset of an existing ad the composer edits. */
export interface EditableAd {
  id: string;
  format: string;
  status: string;
  brandName: string | null;
  brandLogo: string | null;
  headline: string | null;
  contentUrl: string | null;
  videoUrl: string | null;
  ctaLabel: string | null;
  targetUrl: string | null;
  size: string | null;
  targeting: AdTargeting | null;
}

const inp =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500";

/**
 * Create or edit one ad. Editing exists because there was previously no way for
 * an advertiser to fix a rejected ad — the only option was delete and start over.
 * Any change to the creative, destination or audience re-opens review, which the
 * sheet says out loud so it is never a surprise.
 */
export function AdSheet({
  open,
  onOpenChange,
  campaignId,
  ad,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaignId: string;
  /** Present = edit mode. */
  ad?: EditableAd | null;
  onSaved: () => void;
}) {
  const editing = !!ad;
  const [mode, setMode] = useState<"custom" | "post">("custom");
  const [busy, setBusy] = useState(false);

  const [format, setFormat] = useState<"NATIVE" | "BANNER">("NATIVE");
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [headline, setHeadline] = useState("");
  const [image, setImage] = useState("");
  const [video, setVideo] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Learn More");
  const [targetUrl, setTargetUrl] = useState("");
  const [size, setSize] = useState("responsive");

  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [postId, setPostId] = useState<string | null>(null);
  const [placements, setPlacements] = useState<string[]>(["IN_FEED"]);
  const [targeting, setTargeting] = useState<AdTargeting>({});

  // Seed from the ad being edited each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    if (ad) {
      setMode("custom");
      setFormat(ad.format === "BANNER" ? "BANNER" : "NATIVE");
      setBrandName(ad.brandName ?? "");
      setBrandLogo(ad.brandLogo ?? "");
      setHeadline(ad.headline ?? "");
      setImage(ad.contentUrl ?? "");
      setVideo(ad.videoUrl ?? "");
      setCtaLabel(ad.ctaLabel ?? "Learn More");
      setTargetUrl(ad.targetUrl ?? "");
      setSize(ad.size ?? "responsive");
      setTargeting(ad.targeting ?? {});
    } else {
      setMode("custom");
      setFormat("NATIVE");
      setBrandName("");
      setBrandLogo("");
      setHeadline("");
      setImage("");
      setVideo("");
      setCtaLabel("Learn More");
      setTargetUrl("");
      setSize("responsive");
      setPostId(null);
      setPlacements(["IN_FEED"]);
      setTargeting({});
    }
  }, [open, ad]);

  useEffect(() => {
    if (!open || mode !== "post" || posts.length > 0) return;
    fetch("/api/advertiser/posts")
      .then((r) => r.json())
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => {});
  }, [open, mode, posts.length]);

  const submit = async () => {
    if (!targetUrl.trim()) return toast.error("Destination URL is required");
    if (!editing && mode === "post" && !postId) return toast.error("Pick a post to promote");
    if (mode === "custom" && !headline.trim() && !image && !video) {
      return toast.error("Add a headline, an image or a video");
    }
    if (!editing && placements.length === 0) return toast.error("Pick at least one ad space");

    setBusy(true);
    try {
      const res = editing
        ? await fetch(`/api/advertiser/ads/${ad!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              format,
              brandName: brandName || null,
              brandLogo: brandLogo || null,
              headline: headline || null,
              contentUrl: image || null,
              videoUrl: video || null,
              ctaLabel: ctaLabel || null,
              targetUrl,
              size,
              targeting,
            }),
          })
        : await fetch(`/api/advertiser/campaigns/${campaignId}/ads`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": newIdempotencyKey(),
            },
            body: JSON.stringify(
              mode === "post"
                ? {
                    format: "NATIVE",
                    promotedPostId: postId,
                    ctaLabel,
                    targetUrl,
                    targeting,
                    placements,
                  }
                : {
                    format,
                    brandName: brandName || null,
                    brandLogo: brandLogo || null,
                    headline: headline || null,
                    contentUrl: image || null,
                    videoUrl: video || null,
                    ctaLabel,
                    targetUrl,
                    size,
                    targeting,
                    placements,
                  }
            ),
          });

      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);

      toast.success(editing ? "Changes saved" : "Ad submitted for review", {
        description:
          editing && d.requeued
            ? "It's back in review and will run again once approved."
            : editing
              ? "Your changes are live."
              : "It will go live once an admin approves it.",
      });
      onSaved();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit ad" : "Create Ad"}
      footer={
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? "Save & resubmit" : "Create Ad"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {editing && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2.5 text-[11px] text-amber-100/90">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Changing the creative, destination or audience sends the ad back for review, so it
            pauses until an admin approves it again.
          </p>
        )}

        {!editing && (
          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden text-xs w-full">
            {(["custom", "post"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 px-3 py-2 font-semibold capitalize",
                  mode === m ? "bg-indigo-500 text-white" : "bg-gray-800 text-gray-400"
                )}
              >
                {m === "custom" ? "Custom ad" : "Promote a post"}
              </button>
            ))}
          </div>
        )}

        {mode === "custom" ? (
          <>
            {/* Feed-native vs banner — BANNER was unreachable before (the sheet
                hardcoded NATIVE), so half the inventory couldn't be bought. */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Ad type</label>
              <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden text-xs w-full">
                {(
                  [
                    { id: "NATIVE", label: "Feed post style" },
                    { id: "BANNER", label: "Banner" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      "flex-1 px-3 py-2 font-semibold",
                      format === f.id ? "bg-indigo-500 text-white" : "bg-gray-800 text-gray-400"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Brand name</label>
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. NordVPN" className={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Brand logo</label>
              <UserUploadField value={brandLogo} onChange={setBrandLogo} previewSize="square" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Headline / ad copy</label>
              <textarea rows={3} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="What are you promoting?" className={cn(inp, "resize-none")} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Image</label>
              <UserUploadField value={image} onChange={setImage} previewSize="lg" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Video (optional)</label>
              <UserUploadField value={video} onChange={setVideo} kind="VIDEO" previewSize="lg" />
            </div>
            {format === "BANNER" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Banner size</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className={inp}>
                  {AD_SIZES.filter((s) => s.key !== "custom").map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Pick one of your posts</label>
            {posts.length === 0 ? (
              <p className="text-xs text-gray-600 py-3">No posts to promote yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPostId(p.id)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-lg border text-left",
                      postId === p.id
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-gray-800 bg-gray-800/50"
                    )}
                  >
                    <div className="relative w-9 h-9 rounded bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.image ? (
                        <SmartImage src={p.image} alt="" fill sizes="36px" className="object-cover" />
                      ) : null}
                    </div>
                    <span className="text-xs text-gray-200 line-clamp-2 flex-1">
                      {p.content || "(no text)"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">CTA label</label>
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Destination URL *</label>
            <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" className={inp} />
          </div>
        </div>

        {!editing && (
          <div className="rounded-lg border border-gray-800 p-3 space-y-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Ad spaces ({placements.length} selected)
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {ADVERTISER_PLACEMENTS.map((p) => {
                const on = placements.includes(p.name);
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() =>
                      setPlacements((prev) =>
                        on ? prev.filter((x) => x !== p.name) : [...prev, p.name]
                      )
                    }
                    className={cn(
                      "text-left rounded-lg border p-2",
                      on ? "border-indigo-500 bg-indigo-500/10" : "border-gray-800 bg-gray-800/50"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "w-3.5 h-3.5 rounded-sm grid place-items-center shrink-0 text-[9px] font-bold",
                          on ? "bg-indigo-500 text-white" : "border border-gray-600"
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="text-[11px] font-semibold text-gray-200 truncate">
                        {p.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{p.where}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-800 p-3 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Targeting (optional)
          </p>
          <AudienceBuilder value={targeting} onChange={setTargeting} />
        </div>
      </div>
    </BottomSheet>
  );
}
