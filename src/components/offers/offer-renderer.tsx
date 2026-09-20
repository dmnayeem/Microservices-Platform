import Link from "next/link";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import {
  type OfferBlock,
  OFFER_RICHTEXT_CLASS,
  sanitizeOfferHtml,
} from "@/lib/offers";
import { cn } from "@/lib/utils";

const ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function OfferButton({
  label,
  href,
  variant,
  align,
}: {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "outline";
  align: "left" | "center" | "right";
}) {
  const cls = cn(
    "inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold transition-transform hover:scale-[1.02]",
    variant === "primary" && "bg-linear-to-r from-indigo-500 to-purple-600 text-white",
    variant === "secondary" && "bg-(--app-bright) text-(--app-on-bright)",
    variant === "outline" && "border border-white/30 text-white hover:bg-white/10"
  );
  const wrap = cn("my-4", ALIGN[align] ?? "text-center");
  const isExternal = /^https?:\/\//i.test(href);
  return (
    <div className={wrap}>
      {isExternal ? (
        <a href={href || "#"} target="_blank" rel="noopener noreferrer" className={cls}>
          {label}
        </a>
      ) : (
        <Link href={href || "#"} className={cls}>
          {label}
        </Link>
      )}
    </div>
  );
}

function Block({ block }: { block: OfferBlock }) {
  switch (block.type) {
    case "hero":
      return (
        <section
          className={cn(
            "relative rounded-2xl overflow-hidden px-6 py-14 sm:py-20 text-center my-6",
            "bg-linear-to-br",
            block.bgGradient || "from-indigo-600 to-purple-700"
          )}
          style={
            block.imageUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(2,6,23,.6),rgba(2,6,23,.6)), url(${block.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight">
            {block.title}
          </h1>
          {block.subtitle && (
            <p className="mt-3 text-base sm:text-lg text-white/90 max-w-2xl mx-auto">
              {block.subtitle}
            </p>
          )}
          {block.ctaLabel && block.ctaHref && (
            <div className="mt-6">
              <OfferButton
                label={block.ctaLabel}
                href={block.ctaHref}
                variant="secondary"
                align="center"
              />
            </div>
          )}
        </section>
      );

    case "richtext":
      return (
        <div
          className={cn(OFFER_RICHTEXT_CLASS, "my-4")}
          dangerouslySetInnerHTML={{ __html: sanitizeOfferHtml(block.html) }}
        />
      );

    case "image": {
      if (!block.url) return null;
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.url}
          alt={block.caption || ""}
          className="w-full rounded-xl border border-white/10"
        />
      );
      return (
        <figure className="my-4">
          {block.href ? (
            <a href={block.href} target="_blank" rel="noopener noreferrer">
              {img}
            </a>
          ) : (
            img
          )}
          {block.caption && (
            <figcaption className="mt-2 text-center text-sm text-(--app-ink-3)">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    }

    case "video":
      if (!block.url) return null;
      return (
        <figure className="my-4">
          <InlineVideoEmbed url={block.url} className="rounded-xl overflow-hidden" />
          {block.caption && (
            <figcaption className="mt-2 text-center text-sm text-(--app-ink-3)">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "button":
      return (
        <OfferButton
          label={block.label}
          href={block.href}
          variant={block.variant}
          align={block.align}
        />
      );

    case "features":
      return (
        <section className="my-6">
          {block.heading && (
            <h2 className="text-2xl font-bold text-white text-center mb-4">
              {block.heading}
            </h2>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {block.items.map((it, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/5 p-4 text-center"
              >
                {it.emoji && <div className="text-3xl mb-2">{it.emoji}</div>}
                <p className="font-bold text-white">{it.title}</p>
                {it.text && (
                  <p className="text-sm text-(--app-ink-3) mt-1">{it.text}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      );

    case "divider":
      return <hr className="my-6 border-white/10" />;

    case "spacer":
      return (
        <div
          className={
            block.size === "sm" ? "h-4" : block.size === "lg" ? "h-16" : "h-8"
          }
        />
      );

    default:
      return null;
  }
}

export function OfferRenderer({ blocks }: { blocks: OfferBlock[] }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {blocks.map((b) => (
        <Block key={b.id} block={b} />
      ))}
    </div>
  );
}
