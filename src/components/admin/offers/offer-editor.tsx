"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Eye,
  Copy,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
// Tiptap is heavy (~200KB) and only mounts inside this admin editor — load it
// lazily so it stays out of the offer-editor's initial chunk.
const RichTextEditor = dynamic(
  () =>
    import("@/components/admin/offers/rich-text-editor").then(
      (m) => m.RichTextEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-slate-700 bg-slate-950 min-h-40 animate-pulse" />
    ),
  }
);
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import {
  type OfferBlock,
  type OfferBlockType,
  type FeatureItem,
  newBlock,
  BLOCK_LABELS,
  OFFER_BG_GRADIENTS,
} from "@/lib/offers";

interface EditorOffer {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  bgGradient: string;
  status: string;
  blocks: OfferBlock[];
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-fuchsia-500";

const BLOCK_ORDER: OfferBlockType[] = [
  "hero",
  "richtext",
  "image",
  "video",
  "button",
  "features",
  "divider",
  "spacer",
];

export function OfferEditor({ offer }: { offer: EditorOffer }) {
  const router = useRouter();
  const [title, setTitle] = useState(offer.title);
  const [slug, setSlug] = useState(offer.slug);
  const [description, setDescription] = useState(offer.description);
  const [thumbnailUrl, setThumbnailUrl] = useState(offer.thumbnailUrl);
  const [bgGradient, setBgGradient] = useState(
    offer.bgGradient || OFFER_BG_GRADIENTS[0]
  );
  const [status, setStatus] = useState(offer.status);
  const [blocks, setBlocks] = useState<OfferBlock[]>(offer.blocks);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const updateBlock = (id: string, patch: Partial<OfferBlock>) =>
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, ...patch } as OfferBlock) : b))
    );
  const removeBlock = (id: string) =>
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  const moveBlock = (idx: number, dir: -1 | 1) =>
    setBlocks((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const addBlock = (type: OfferBlockType) => {
    setBlocks((prev) => [...prev, newBlock(type)]);
    setAddOpen(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          description,
          thumbnailUrl,
          bgGradient,
          status,
          blocks,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.offer?.slug && d.offer.slug !== slug) setSlug(d.offer.slug);
      toast.success("Offer saved");
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/offer/${slug}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Public link copied"),
      () => toast.error("Couldn't copy")
    );
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-24">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/admin/offers"
          className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <h1 className="text-xl font-bold text-white flex-1 min-w-0 truncate">
          Edit Offer
        </h1>
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
        >
          <Copy className="w-4 h-4" /> Copy link
        </button>
        <Link
          href={`/offer/${slug}?preview=1`}
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
        >
          <Eye className="w-4 h-4" /> Preview
        </Link>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fuchsia-600 text-white text-sm font-bold hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </button>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} />
          </Field>
          <Field label="Slug (public URL)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={inp}
              placeholder="my-offer"
            />
          </Field>
        </div>
        <Field label="SEO / share description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inp}
            placeholder="Short description for search/social previews"
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Share image (OG)">
            <ImageUploadField
              value={thumbnailUrl}
              onChange={setThumbnailUrl}
              title="Select share image"
              previewSize="sm"
            />
          </Field>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Page background
            </label>
            <div className="grid grid-cols-3 gap-2">
              {OFFER_BG_GRADIENTS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setBgGradient(g)}
                  className={cn(
                    "h-9 rounded-lg bg-linear-to-br",
                    g,
                    bgGradient === g
                      ? "ring-2 ring-fuchsia-500 ring-offset-2 ring-offset-slate-900"
                      : ""
                  )}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-slate-400">Status:</span>
          {(["DRAFT", "PUBLISHED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold",
                status === s
                  ? s === "PUBLISHED"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-600 text-white"
                  : "bg-slate-800 text-slate-400"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        {blocks.map((block, idx) => (
          <div
            key={block.id}
            className="rounded-xl border border-slate-800 bg-slate-900"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
                {BLOCK_LABELS[block.type]}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveBlock(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded text-slate-400 hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveBlock(idx, 1)}
                  disabled={idx === blocks.length - 1}
                  className="p-1 rounded text-slate-400 hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeBlock(block.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-3">
              <BlockEditor block={block} onChange={(p) => updateBlock(block.id, p)} />
            </div>
          </div>
        ))}

        {/* Add block */}
        <div className="relative">
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-300 hover:border-fuchsia-500 hover:text-white"
          >
            <Plus className="w-4 h-4" /> Add block
          </button>
          {addOpen && (
            <div className="absolute z-10 left-1/2 -translate-x-1/2 mt-1 w-64 rounded-xl border border-slate-800 bg-slate-900 shadow-xl p-2 grid grid-cols-2 gap-1">
              {BLOCK_ORDER.map((t) => (
                <button
                  key={t}
                  onClick={() => addBlock(t)}
                  className="px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 text-left"
                >
                  {BLOCK_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  onChange,
}: {
  block: OfferBlock;
  onChange: (patch: Partial<OfferBlock>) => void;
}) {
  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-3">
          <Field label="Headline">
            <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} className={inp} />
          </Field>
          <Field label="Subtitle">
            <input value={block.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} className={inp} />
          </Field>
          <Field label="Background image (optional)">
            <ImageUploadField value={block.imageUrl ?? ""} onChange={(url) => onChange({ imageUrl: url })} title="Hero image" previewSize="sm" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Button label (optional)">
              <input value={block.ctaLabel ?? ""} onChange={(e) => onChange({ ctaLabel: e.target.value })} className={inp} />
            </Field>
            <Field label="Button link">
              <input value={block.ctaHref ?? ""} onChange={(e) => onChange({ ctaHref: e.target.value })} className={inp} placeholder="/register or https://…" />
            </Field>
          </div>
        </div>
      );

    case "richtext":
      return <RichTextEditor value={block.html} onChange={(html) => onChange({ html })} />;

    case "image":
      return (
        <div className="space-y-3">
          <ImageUploadField value={block.url} onChange={(url) => onChange({ url })} title="Select image" previewSize="md" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Caption (optional)">
              <input value={block.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} className={inp} />
            </Field>
            <Field label="Link on click (optional)">
              <input value={block.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} className={inp} placeholder="https://…" />
            </Field>
          </div>
        </div>
      );

    case "video":
      return (
        <div className="space-y-3">
          <Field label="Video link (YouTube, Vimeo, or .mp4)">
            <input value={block.url} onChange={(e) => onChange({ url: e.target.value })} className={inp} placeholder="https://youtube.com/watch?v=…" />
          </Field>
          {block.url && (
            <InlineVideoEmbed url={block.url} className="rounded-lg overflow-hidden" />
          )}
          <Field label="Caption (optional)">
            <input value={block.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} className={inp} />
          </Field>
        </div>
      );

    case "button":
      return (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Label">
              <input value={block.label} onChange={(e) => onChange({ label: e.target.value })} className={inp} />
            </Field>
            <Field label="Link">
              <input value={block.href} onChange={(e) => onChange({ href: e.target.value })} className={inp} placeholder="/register or https://…" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Style">
              <select value={block.variant} onChange={(e) => onChange({ variant: e.target.value as "primary" | "secondary" | "outline" })} className={inp}>
                <option value="primary">Primary (gradient)</option>
                <option value="secondary">Secondary (white)</option>
                <option value="outline">Outline</option>
              </select>
            </Field>
            <Field label="Alignment">
              <select value={block.align} onChange={(e) => onChange({ align: e.target.value as "left" | "center" | "right" })} className={inp}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
          </div>
        </div>
      );

    case "features":
      return <FeaturesEditor block={block} onChange={onChange} />;

    case "spacer":
      return (
        <Field label="Height">
          <select value={block.size} onChange={(e) => onChange({ size: e.target.value as "sm" | "md" | "lg" })} className={inp}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </Field>
      );

    case "divider":
      return <p className="text-xs text-slate-500">A horizontal divider line.</p>;

    default:
      return null;
  }
}

function FeaturesEditor({
  block,
  onChange,
}: {
  block: Extract<OfferBlock, { type: "features" }>;
  onChange: (patch: Partial<OfferBlock>) => void;
}) {
  const setItem = (i: number, patch: Partial<FeatureItem>) =>
    onChange({
      items: block.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    });
  const addItem = () =>
    onChange({ items: [...block.items, { emoji: "⭐", title: "Feature", text: "" }] });
  const removeItem = (i: number) =>
    onChange({ items: block.items.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <Field label="Section heading">
        <input value={block.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value })} className={inp} />
      </Field>
      <div className="space-y-2">
        {block.items.map((it, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
            <input
              value={it.emoji ?? ""}
              onChange={(e) => setItem(i, { emoji: e.target.value })}
              className="w-12 px-2 py-2 bg-slate-900 border border-slate-700 rounded text-center text-lg"
              placeholder="⭐"
            />
            <div className="flex-1 space-y-1.5">
              <input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} className={inp} placeholder="Title" />
              <input value={it.text ?? ""} onChange={(e) => setItem(i, { text: e.target.value })} className={inp} placeholder="Short text" />
            </div>
            <button onClick={() => removeItem(i)} className="p-1.5 text-slate-500 hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addItem} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs hover:bg-slate-700">
        <Plus className="w-3.5 h-3.5" /> Add feature
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
