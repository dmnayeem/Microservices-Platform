"use client";
import { usd } from "@/lib/utils";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  Star,
  Clock,
  Users,
  Filter,
  ChevronDown,
  Sparkles,
  GraduationCap,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { CardSkeleton } from "@/components/user/primitives/skeleton";

interface FeaturedCard {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  isFree: boolean;
  price: number;
  discountPrice: number | null;
  avgRating: number;
  enrollmentCount: number;
  totalDuration: number;
  totalLessons: number;
  tutor: { id: string; name: string | null; avatar: string | null } | null;
  href: string;
}

interface BrowseCard extends FeaturedCard {
  language: string;
  skillLevel: string;
  category: string;
  totalReviews: number;
  originalPrice?: number | null;
  isEnrolled?: boolean;
  isBookmarked?: boolean;
}

interface Facets {
  total: number;
  categories: Array<{
    id: string;
    name: string;
    color: string | null;
    count: number;
  }>;
  subcategories?: Array<{ id: string; name: string; count: number }>;
  skillLevels: Array<{ value: string; count: number }>;
  languages: Array<{ value: string; count: number }>;
  freeCount: number;
  paidCount: number;
}

interface Props {
  initialFeatured: FeaturedCard[];
}

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Top rated" },
  { value: "price-asc", label: "Price: low → high" },
  { value: "price-desc", label: "Price: high → low" },
] as const;

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export function CoursesBrowse({ initialFeatured }: Props) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [skillLevel, setSkillLevel] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<"all" | "free" | "paid">("all");
  const [minRating, setMinRating] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("newest");

  const [rows, setRows] = useState<BrowseCard[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (subcategoryId) params.set("subcategoryId", subcategoryId);
      if (skillLevel) params.set("skillLevel", skillLevel);
      if (language) params.set("language", language);
      if (priceMode !== "all") params.set("price", priceMode);
      if (minRating !== null) params.set("minRating", String(minRating));
      params.set("sort", sort);
      params.set("limit", "30");

      const res = await fetch(`/api/courses?${params.toString()}`, {
        cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setRows(d.rows as BrowseCard[]);
      setFacets(d.facets as Facets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, [q, categoryId, subcategoryId, skillLevel, language, priceMode, minRating, sort]);

  // Debounce search; refetch on filter changes
  useEffect(() => {
    const t = setTimeout(() => {
      fetchData();
    }, 250);
    return () => clearTimeout(t);
  }, [fetchData]);

  const clearAll = () => {
    setQ("");
    setCategoryId(null);
    setSubcategoryId(null);
    setSkillLevel(null);
    setLanguage(null);
    setPriceMode("all");
    setMinRating(null);
    setSort("newest");
  };

  const activeFilterCount =
    (categoryId ? 1 : 0) +
    (subcategoryId ? 1 : 0) +
    (skillLevel ? 1 : 0) +
    (language ? 1 : 0) +
    (priceMode !== "all" ? 1 : 0) +
    (minRating !== null ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Featured strip */}
      {initialFeatured.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Featured
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {initialFeatured.map((c) => (
              <CourseCard key={c.id} c={{ ...c, language: "", skillLevel: "", category: "", totalReviews: 0 }} highlight />
            ))}
          </div>
        </section>
      )}

      {/* Search + sort */}
      <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            placeholder="Search courses…"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={
              "lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border " +
              (activeFilterCount > 0
                ? "border-indigo-500 bg-indigo-500/10 text-indigo-200"
                : "border-gray-800 bg-gray-900 text-gray-300")
            }
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="appearance-none pl-3 pr-9 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        {/* Filter sidebar */}
        <aside
          className={
            "space-y-4 " +
            (filtersOpen ? "" : "hidden lg:block")
          }
        >
          <FilterCard title="Price">
            <SegmentedThree
              value={priceMode}
              onChange={setPriceMode}
              options={[
                { value: "all", label: "All", count: facets?.total ?? 0 },
                { value: "free", label: "Free", count: facets?.freeCount ?? 0 },
                { value: "paid", label: "Paid", count: facets?.paidCount ?? 0 },
              ]}
            />
          </FilterCard>

          <FilterCard title="Category">
            <ul className="space-y-1">
              <FilterRow
                active={categoryId === null}
                onClick={() => {
                  setCategoryId(null);
                  setSubcategoryId(null);
                }}
                label="All categories"
                count={facets?.total ?? 0}
              />
              {(facets?.categories ?? []).map((c) => (
                <FilterRow
                  key={c.id}
                  active={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    setSubcategoryId(null);
                  }}
                  label={c.name}
                  count={c.count}
                  color={c.color}
                />
              ))}
            </ul>
          </FilterCard>

          {categoryId && (facets?.subcategories?.length ?? 0) > 0 && (
            <FilterCard title="Subcategory">
              <ul className="space-y-1">
                <FilterRow
                  active={subcategoryId === null}
                  onClick={() => setSubcategoryId(null)}
                  label="All"
                  count={facets?.total ?? 0}
                />
                {(facets?.subcategories ?? []).map((s) => (
                  <FilterRow
                    key={s.id}
                    active={subcategoryId === s.id}
                    onClick={() => setSubcategoryId(s.id)}
                    label={s.name}
                    count={s.count}
                  />
                ))}
              </ul>
            </FilterCard>
          )}

          <FilterCard title="Skill level">
            <ul className="space-y-1">
              <FilterRow
                active={skillLevel === null}
                onClick={() => setSkillLevel(null)}
                label="Any level"
                count={facets?.total ?? 0}
              />
              {(facets?.skillLevels ?? []).map((l) => (
                <FilterRow
                  key={l.value}
                  active={skillLevel === l.value}
                  onClick={() => setSkillLevel(l.value)}
                  label={LEVEL_LABELS[l.value] ?? l.value}
                  count={l.count}
                />
              ))}
            </ul>
          </FilterCard>

          <FilterCard title="Language">
            <ul className="space-y-1">
              <FilterRow
                active={language === null}
                onClick={() => setLanguage(null)}
                label="Any language"
                count={facets?.total ?? 0}
              />
              {(facets?.languages ?? []).map((l) => (
                <FilterRow
                  key={l.value}
                  active={language === l.value}
                  onClick={() => setLanguage(l.value)}
                  label={l.value.toUpperCase()}
                  count={l.count}
                />
              ))}
            </ul>
          </FilterCard>

          <FilterCard title="Min rating">
            <div className="flex flex-wrap gap-1.5">
              {[null, 3, 4, 4.5].map((r) => (
                <button
                  key={String(r)}
                  type="button"
                  onClick={() => setMinRating(r)}
                  className={
                    "inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-bold border " +
                    (minRating === r
                      ? "border-amber-400 bg-amber-400/10 text-amber-200"
                      : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800")
                  }
                >
                  {r === null ? "Any" : `${r}+`}
                  {r !== null && (
                    <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                  )}
                </button>
              ))}
            </div>
          </FilterCard>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold border border-gray-800"
            >
              <X className="w-3.5 h-3.5" />
              Clear all filters
            </button>
          )}
        </aside>

        {/* Results */}
        <div className="space-y-3">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-6 text-rose-200 text-sm">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No courses match"
              description="Try removing a filter or searching for something else."
            />
          ) : (
            <>
              <p className="text-xs text-gray-500">
                {rows.length} course{rows.length === 1 ? "" : "s"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {rows.map((c) => (
                  <CourseCard key={c.id} c={c} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function FilterRow({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string | null;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm transition-colors " +
          (active
            ? "bg-indigo-500/15 text-white"
            : "text-gray-300 hover:bg-gray-800")
        }
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {color && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}
          <span className="truncate">{label}</span>
        </span>
        <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
          {count}
        </span>
      </button>
    </li>
  );
}

function SegmentedThree<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count: number }>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            "px-2 py-1.5 rounded-md text-xs font-bold border " +
            (value === o.value
              ? "border-indigo-500 bg-indigo-500/15 text-white"
              : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800")
          }
        >
          {o.label}
          <span className="ml-1 text-gray-500">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function CourseCard({ c, highlight }: { c: BrowseCard; highlight?: boolean }) {
  const livePrice = c.discountPrice ?? c.price;
  return (
    <Link
      href={c.href}
      className={
        "group card overflow-hidden flex flex-col " +
        (highlight
          ? "border-amber-500/40! hover:border-amber-400!"
          : "card-interactive")
      }
    >
      <div className="aspect-video bg-gray-950 relative">
        {c.thumbnail ? (
          <Image
            src={c.thumbnail}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover group-hover:scale-[1.02] transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <GraduationCap className="w-12 h-12" />
          </div>
        )}
        {c.isEnrolled && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500 text-emerald-950 text-[10px] font-bold">
            Enrolled
          </span>
        )}
        {!c.isFree && c.discountPrice && c.discountPrice < c.price && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
            -{Math.round(((c.price - c.discountPrice) / c.price) * 100)}%
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <p className="text-sm font-bold text-white line-clamp-2 group-hover:text-indigo-200">
          {c.title}
        </p>
        {c.subtitle && (
          <p className="text-xs text-gray-400 line-clamp-2">{c.subtitle}</p>
        )}
        {c.tutor && (
          <p className="text-xs text-gray-500">by {c.tutor.name ?? "Tutor"}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
          {c.avgRating > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
              {c.avgRating.toFixed(1)}
              {c.totalReviews > 0 && (
                <span className="text-gray-500">({c.totalReviews})</span>
              )}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" /> {c.enrollmentCount}
          </span>
          {c.totalDuration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {Math.round(c.totalDuration / 60)}h
            </span>
          )}
        </div>
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          {c.isFree ? (
            <span className="text-base font-extrabold text-emerald-300">Free</span>
          ) : (
            <>
              <span className="text-base font-extrabold text-white">
                {usd(livePrice)}
              </span>
              {c.originalPrice && c.originalPrice > livePrice && (
                <span className="text-xs text-gray-500 line-through">
                  {usd(c.originalPrice)}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
