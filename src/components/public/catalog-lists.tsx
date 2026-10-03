import Link from "next/link";
import { Star, Users, Clock } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { usd } from "@/lib/utils";
import type { ListingCard, CourseCard } from "@/lib/public-catalog-data";
import { CATALOG_PAGE_SIZE } from "@/lib/public-catalog";

/**
 * Server-rendered catalog grids for the public index / category pages. Every
 * card is a real <a href> so a crawler can follow it without running any
 * script, and pagination is plain links with rel="prev"/"next".
 */

export function ListingGrid({ items, headingLevel = 2 }: { items: ListingCard[]; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  if (items.length === 0) {
    return <p className="text-sm text-(--app-ink-3)">Nothing on sale here yet — check back soon.</p>;
  }
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((l) => (
        <li key={l.id} className="min-w-0">
          <Link
            href={`/marketplace/${l.id}`}
            className="glass rounded-xl overflow-hidden block h-full hover:ring-1 hover:ring-(--app-accent) transition"
          >
            <div className="relative aspect-square bg-black/30">
              {l.image ? (
                <SmartImage
                  src={l.image}
                  alt={l.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-(--app-ink-3) text-xs">
                  No preview
                </div>
              )}
            </div>
            <div className="p-3 space-y-1 min-w-0">
              <p className="text-[11px] text-(--app-ink-3) truncate">
                {l.typeLabel}
                {l.niche ? ` · ${l.niche}` : ""}
              </p>
              <H className="text-sm font-medium text-white line-clamp-2">{l.title}</H>
              <p className="text-[11px] text-(--app-ink-3) truncate">by {l.sellerName}</p>
              <p className="text-sm font-bold text-(--app-accent-ink) tabular-nums">{usd(l.price)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CourseGrid({ items }: { items: CourseCard[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-(--app-ink-3)">No courses published here yet — check back soon.</p>;
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((c) => {
        const live = c.discountPrice ?? c.price;
        return (
          <li key={c.id} className="min-w-0">
            <Link
              href={c.href}
              className="glass rounded-xl overflow-hidden block h-full hover:ring-1 hover:ring-(--app-accent) transition"
            >
              <div className="relative aspect-video bg-black/30">
                {c.thumbnail ? (
                  <SmartImage
                    src={c.thumbnail}
                    alt={c.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="p-3 space-y-1.5 min-w-0">
                {c.categoryName && <p className="text-[11px] text-(--app-ink-3) truncate">{c.categoryName}</p>}
                <h2 className="text-sm font-bold text-white line-clamp-2">{c.title}</h2>
                {c.subtitle && <p className="text-xs text-(--app-ink-2) line-clamp-2">{c.subtitle}</p>}
                {c.tutorName && <p className="text-[11px] text-(--app-ink-3) truncate">by {c.tutorName}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--app-ink-3)">
                  {c.totalReviews > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                      {c.avgRating.toFixed(1)} ({c.totalReviews})
                    </span>
                  )}
                  <span className="inline-flex items-center gap-0.5">
                    <Users className="w-3 h-3" aria-hidden /> {c.enrollmentCount} students
                  </span>
                  {c.totalDuration > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" aria-hidden /> {Math.floor(c.totalDuration / 60)}h {c.totalDuration % 60}m
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold tabular-nums">
                  {c.isFree ? (
                    <span className="text-emerald-300">Free</span>
                  ) : (
                    <span className="text-(--app-accent-ink)">{usd(live)}</span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Page 1 is the bare path (it is the canonical); page N is `?page=N`. */
export function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

export function Pagination({ basePath, page, total }: { basePath: string; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  if (pages <= 1) return null;
  const prev = page > 1 ? pageHref(basePath, page - 1) : null;
  const next = page < pages ? pageHref(basePath, page + 1) : null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {prev && <link rel="prev" href={prev} />}
      {next && <link rel="next" href={next} />}
      {prev ? (
        <Link rel="prev" href={prev} className="rounded-lg border border-(--app-line) px-3 py-2 text-sm text-(--app-ink-2) hover:text-(--app-ink)">
          ← Previous page
        </Link>
      ) : null}
      <span className="px-2 text-sm text-(--app-ink-3)">
        Page {page} of {pages}
      </span>
      {next ? (
        <Link rel="next" href={next} className="rounded-lg border border-(--app-line) px-3 py-2 text-sm text-(--app-ink-2) hover:text-(--app-ink)">
          Next page →
        </Link>
      ) : null}
    </nav>
  );
}
