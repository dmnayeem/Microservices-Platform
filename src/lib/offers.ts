// Shared types + helpers for the admin Offer page builder. Kept free of any
// server-only imports (Prisma) so it can be imported by client editor UI too.

export type OfferBlockType =
  | "hero"
  | "richtext"
  | "image"
  | "video"
  | "button"
  | "features"
  | "divider"
  | "spacer";

export interface HeroBlock {
  id: string;
  type: "hero";
  title: string;
  subtitle?: string;
  bgGradient?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
}
export interface RichTextBlock {
  id: string;
  type: "richtext";
  html: string;
}
export interface ImageBlock {
  id: string;
  type: "image";
  url: string;
  caption?: string;
  href?: string;
}
export interface VideoBlock {
  id: string;
  type: "video";
  url: string;
  caption?: string;
}
export interface ButtonBlock {
  id: string;
  type: "button";
  label: string;
  href: string;
  variant: "primary" | "secondary" | "outline";
  align: "left" | "center" | "right";
}
export interface FeatureItem {
  emoji?: string;
  title: string;
  text?: string;
}
export interface FeaturesBlock {
  id: string;
  type: "features";
  heading?: string;
  items: FeatureItem[];
}
export interface DividerBlock {
  id: string;
  type: "divider";
}
export interface SpacerBlock {
  id: string;
  type: "spacer";
  size: "sm" | "md" | "lg";
}

export type OfferBlock =
  | HeroBlock
  | RichTextBlock
  | ImageBlock
  | VideoBlock
  | ButtonBlock
  | FeaturesBlock
  | DividerBlock
  | SpacerBlock;

/** Page theme presets (Tailwind gradient class fragments). */
export const OFFER_BG_GRADIENTS = [
  "from-slate-950 via-slate-900 to-indigo-950",
  "from-gray-950 to-gray-900",
  "from-indigo-950 via-slate-950 to-purple-950",
  "from-slate-950 to-emerald-950",
  "from-slate-950 to-rose-950",
  "from-black to-slate-900",
] as const;

/** Styling for rendered rich-text HTML (no typography plugin installed). */
export const OFFER_RICHTEXT_CLASS =
  "text-slate-200 leading-relaxed [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:my-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:my-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-white [&_h3]:my-2 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_a]:text-indigo-400 [&_a]:underline [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&_u]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_img]:inline-block [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-white [&_h4]:my-2 [&_s]:line-through [&_mark]:rounded [&_mark]:px-0.5 [&_mark]:text-[#1f2937] [&_hr]:my-6 [&_hr]:border-slate-700 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border [&_th]:border-slate-700 [&_th]:bg-slate-800 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-white [&_td]:border [&_td]:border-slate-700 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:rounded-lg";

export const BLOCK_LABELS: Record<OfferBlockType, string> = {
  hero: "Hero",
  richtext: "Rich text",
  image: "Image",
  video: "Video",
  button: "Button / Link",
  features: "Features grid",
  divider: "Divider",
  spacer: "Spacer",
};

let _idc = 0;
export function genBlockId(): string {
  // Unique enough for in-editor keys; ids are opaque strings.
  _idc += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `b_${Date.now().toString(36)}_${_idc}_${rnd}`;
}

export function newBlock(type: OfferBlockType): OfferBlock {
  const id = genBlockId();
  switch (type) {
    case "hero":
      return { id, type, title: "Your headline", subtitle: "A short supporting line." };
    case "richtext":
      return { id, type, html: "<p>Write something…</p>" };
    case "image":
      return { id, type, url: "" };
    case "video":
      return { id, type, url: "" };
    case "button":
      return { id, type, label: "Learn more", href: "", variant: "primary", align: "center" };
    case "features":
      return {
        id,
        type,
        heading: "Features",
        items: [
          { emoji: "⚡", title: "Fast", text: "Describe a benefit." },
          { emoji: "🔒", title: "Secure", text: "Describe a benefit." },
          { emoji: "🎁", title: "Rewarding", text: "Describe a benefit." },
        ],
      };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "md" };
  }
}

/** Coerce arbitrary JSON (from the DB) into a typed block array, dropping junk. */
export function parseBlocks(value: unknown): OfferBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (b): b is OfferBlock =>
      !!b &&
      typeof b === "object" &&
      typeof (b as { type?: unknown }).type === "string" &&
      typeof (b as { id?: unknown }).id === "string"
  );
}

/**
 * Sanitize admin-authored rich-text HTML for public rendering: strip scripts,
 * inline event handlers, and javascript: URLs. Keeps normal formatting tags.
 * (Rich-text blocks never contain iframes; embeds are their own block type.)
 */
export function sanitizeOfferHtml(html: string): string {
  return String(html || "")
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*script\b[^>]*\/?\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");
}
